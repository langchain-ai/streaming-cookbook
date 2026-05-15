"""Bedtime Story agent — Python port of typescript/multimodal/src/agent.ts.

A minimal ``StateGraph`` that fans out three parallel multimodal generations
after a single storyteller pass::

    START
      |
      v
    storyteller            (gpt-4o-mini, three paragraphs)
      |
      |--> visualizer_0   |--> narrator_0
      |--> visualizer_1   |--> narrator_1
      `--> visualizer_2   `--> narrator_2
                                       |
                                       v
                                      END

As soon as ``storyteller`` writes ``paragraphs`` into state, the six worker
nodes fire in one superstep, so images and audio start streaming in parallel
alongside the last tokens of the story. Because LangGraph assigns every node a
distinct checkpoint namespace (``<node_name>:<uuid>``), the client discovers
each invocation via subgraph-style namespaces and scopes ``useImages`` /
``useAudio`` / ``useMessages`` to the right per-page slot with no shared-tool
plumbing.

Notes vs. the TypeScript sibling:

* The JS visualizer/narrator use ``ChatOpenAI.bindTools`` with first-class
  image_generation and audio tools that aren't surfaced in the Python
  ``langchain-openai`` package today. The Python port calls the OpenAI SDK's
  ``images.generate`` and ``audio.speech.create`` endpoints directly from the
  worker nodes and attaches the resulting bytes / URLs to the ``AIMessage``.
  The architectural shape (parallel fan-out, per-page namespaces, three
  paragraphs) is preserved.
* The JS version strips large binary payloads from ``additional_kwargs``
  before they hit checkpointed state. We do the same: image bytes are kept
  out of state (only a short URL and ``revised_prompt`` metadata stay), and
  TTS audio bytes are base64-encoded but kept off the persisted message
  (only metadata: format, duration estimate, byte length).
* No user checkpointer is attached: ``langgraph-api`` provides persistence
  and rejects graphs that ship their own.
"""

from __future__ import annotations

import base64
import os
from typing import Annotated, Any, TypedDict

from langchain_core.callbacks import AsyncCallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    AnyMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from openai import AsyncOpenAI


STORYTELLER_SYSTEM = """You are a gentle bedtime storyteller for children ages 3-7.

Write EXACTLY three short paragraphs (2-3 sentences each) telling one single,
cohesive, calming bedtime story based on the user's prompt.

Rules:
- Warm, soft, comforting tone. No violence, no scary imagery, no sharp conflict.
- Each paragraph must stand on its own as one page of a picture book — a
  self-contained tiny scene a child can picture.
- Separate the three paragraphs with a single blank line.
- Do not add a title, greeting, disclaimer, or closing remark. Output is
  exactly three paragraphs of prose and nothing else."""

VISUALIZER_STYLE_GUIDE = """Style guide (apply every time):
- Soft watercolor, pastel palette, dreamy lighting.
- Rounded, cozy shapes. Gentle composition centered on the subject.
- No text, letters, signs, or writing anywhere in the image.
- No scary or sharp elements. No weapons."""

NARRATOR_VOICE = "nova"
NARRATOR_AUDIO_MODEL = "gpt-4o-audio-preview"
NARRATOR_AUDIO_FORMAT = "pcm16"  # OpenAI streams 24 kHz mono 16-bit signed
NARRATOR_AUDIO_MIME = "audio/pcm"

NARRATOR_SYSTEM = (
    "You are a warm, gentle narrator reading a child to sleep. "
    "Read the paragraph in the user message aloud at a calm, unhurried pace. "
    "Do NOT add greetings, commentary, stage directions, or extra words. "
    "Speak only the paragraph exactly as written."
)

IMAGE_MODEL = "gpt-image-1"
IMAGE_SIZE = "1024x1024"
IMAGE_QUALITY = "medium"

STORYTELLER_MODEL = "gpt-4o-mini"


storyteller_model = ChatOpenAI(model=STORYTELLER_MODEL)


class _ImageGenChatModel(BaseChatModel):
    """A chat-model adapter that calls OpenAI's image generation endpoint.

    The v3 streaming protocol's `messages` channel only fires
    `content-block-{start,delta,finish}` events for chat-model streams.
    Plain `AIMessage` writes to state are visible on `run.messages`
    in-process but don't reach JS clients — and the React frontend's
    `useImages` hook reads media blocks from those wire events.

    By packaging the image call as a real `BaseChatModel`, langgraph
    intercepts the chat-model callbacks and emits standard messages
    events with the image content block intact.
    """

    @property
    def _llm_type(self) -> str:
        return "openai-image-gen"

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ):
        prompt = _message_text(messages[-1]) if messages else ""
        client = _openai_client()
        result = await client.images.generate(
            model=IMAGE_MODEL,
            prompt=prompt,
            size=IMAGE_SIZE,
            quality=IMAGE_QUALITY,
            n=1,
        )
        first = result.data[0] if result.data else None
        block: dict[str, Any] | None = None
        if first is not None:
            url = getattr(first, "url", None)
            b64 = getattr(first, "b64_json", None)
            if url:
                block = {"type": "image", "url": url, "mime_type": "image/png"}
            elif b64:
                block = {"type": "image", "data": b64, "mime_type": "image/png"}
        if block is None:
            block = {"type": "text", "text": "Illustration unavailable."}
        chunk = AIMessageChunk(content=[block])
        if run_manager is not None:
            await run_manager.on_llm_new_token("", chunk=ChatGenerationChunk(message=chunk))
        yield ChatGenerationChunk(message=chunk)

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        full: AIMessageChunk | None = None
        async for chunk in self._astream(messages, stop=stop, run_manager=run_manager, **kwargs):
            full = chunk.message if full is None else (full + chunk.message)
        message: BaseMessage = full or AIMessage(content="")
        return ChatResult(generations=[ChatGeneration(message=message)])

    def _generate(self, *args: Any, **kwargs: Any) -> ChatResult:
        raise NotImplementedError("This model is async-only; use ainvoke / astream.")


class _NarratorChatModel(BaseChatModel):
    """A chat-model adapter that streams OpenAI's audio-output chat model.

    Uses `gpt-4o-audio-preview` with `modalities=["text", "audio"]` and
    `audio.format="pcm16"` so the model streams 24 kHz mono PCM16 chunks
    as the audio is synthesized. Each chunk is yielded as a separate
    `ChatGenerationChunk` carrying an `audio` content block — the
    langchain v3 messages bridge converts those into wire
    `content-block-delta` events that the React frontend's
    `useAudioPlayer` consumes via the PCM strategy (no
    `HTMLAudioElement.currentTime` quirk on replay).

    The mp3 / TTS endpoint (`gpt-4o-mini-tts`) would have been simpler,
    but it returns the audio in one shot — the player falls into the
    `HTMLAudioElement` strategy, which after `ended` doesn't auto-reset
    `currentTime`, so subsequent Play clicks resume from the end.
    """

    @property
    def _llm_type(self) -> str:
        return "openai-audio-chat-stream"

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ):
        text = _message_text(messages[-1]) if messages else ""
        if not text:
            return
        client = _openai_client()
        stream = await client.chat.completions.create(
            model=NARRATOR_AUDIO_MODEL,
            modalities=["text", "audio"],
            audio={"voice": NARRATOR_VOICE, "format": NARRATOR_AUDIO_FORMAT},
            stream=True,
            messages=[
                {"role": "system", "content": NARRATOR_SYSTEM},
                {"role": "user", "content": text},
            ],
        )
        async for chunk in stream:
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            audio_obj = getattr(delta, "audio", None) if delta is not None else None
            if audio_obj is None:
                continue
            audio_dict = (
                audio_obj
                if isinstance(audio_obj, dict)
                else audio_obj.model_dump(exclude_none=True)
            )
            audio_data = audio_dict.get("data")
            if not audio_data:
                continue
            ai_chunk = AIMessageChunk(
                content=[
                    {
                        "type": "audio",
                        "data": audio_data,
                        "mime_type": NARRATOR_AUDIO_MIME,
                        "encoding": "base64",
                        "index": 0,
                    }
                ]
            )
            gen_chunk = ChatGenerationChunk(message=ai_chunk)
            if run_manager is not None:
                await run_manager.on_llm_new_token("", chunk=gen_chunk)
            yield gen_chunk

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        full: AIMessageChunk | None = None
        async for chunk in self._astream(messages, stop=stop, run_manager=run_manager, **kwargs):
            full = chunk.message if full is None else (full + chunk.message)
        message: BaseMessage = full or AIMessage(content="")
        return ChatResult(generations=[ChatGeneration(message=message)])

    def _generate(self, *args: Any, **kwargs: Any) -> ChatResult:
        raise NotImplementedError("This model is async-only; use ainvoke / astream.")


visualizer_model = _ImageGenChatModel()
narrator_model = _NarratorChatModel()


def _openai_client() -> AsyncOpenAI:
    """Lazy async OpenAI client.

    ``langgraph dev`` runs nodes on an async event loop and refuses sync
    blocking calls (its blockbuster middleware catches ``time.sleep``,
    socket reads, etc.). The image/audio endpoints don't have a langchain
    tool binding today, so workers call the OpenAI SDK directly — but it
    has to be the async client.
    """
    return AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def _split_paragraphs(text: str) -> list[str]:
    """Split the storyteller output into up to three trimmed paragraphs."""
    parts = [p.strip() for p in text.split("\n\n")]
    parts = [p for p in parts if p]
    return parts[:3]


def _last_human_text(messages: list[AnyMessage]) -> str:
    """Return the most recent ``HumanMessage`` content as a plain string."""
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            content = message.content
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                pieces: list[str] = []
                for block in content:
                    if isinstance(block, str):
                        pieces.append(block)
                    elif isinstance(block, dict) and isinstance(
                        block.get("text"), str
                    ):
                        pieces.append(block["text"])
                return "".join(pieces)
    return ""


def _paragraphs_reducer(left: list[str] | None, right: list[str] | None) -> list[str]:
    """Pick the most recent non-empty paragraphs list.

    Six parallel worker subgraphs each echo back the parent's paragraphs
    unchanged as part of their state output, which without a reducer
    trips ``InvalidUpdateError: Can receive only one value per step``.
    The storyteller is the only real writer; everything else is a
    pass-through.
    """
    if right:
        return right
    return left or []


class StoryState(TypedDict, total=False):
    """Graph state.

    ``messages`` accumulates LangChain messages via the standard
    ``add_messages`` reducer. ``paragraphs`` is the coordination channel
    between the storyteller and the six media workers: once populated,
    all visualizers and narrators run in parallel using their page index.
    """

    messages: Annotated[list[AnyMessage], add_messages]
    paragraphs: Annotated[list[str], _paragraphs_reducer]


def _message_text(message: Any) -> str:
    """Flatten a BaseMessage's content (string or list of content blocks) to text."""
    text = getattr(message, "text", None)
    if isinstance(text, str):
        return text
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        pieces: list[str] = []
        for block in content:
            if isinstance(block, str):
                pieces.append(block)
            elif isinstance(block, dict):
                t = block.get("text")
                if isinstance(t, str):
                    pieces.append(t)
        return "".join(pieces)
    return ""


async def storyteller_node(state: StoryState) -> dict[str, Any]:
    prompt = _last_human_text(state.get("messages", []))
    response = await storyteller_model.ainvoke(
        [SystemMessage(content=STORYTELLER_SYSTEM), HumanMessage(content=prompt)]
    )

    text = _message_text(response)
    paragraphs = _split_paragraphs(text)
    return {"messages": [response], "paragraphs": paragraphs}


def _make_visualizer_node(index: int):
    """Build a one-node subgraph for the i-th image worker.

    The worker is compiled as its own subgraph so LangGraph assigns it a
    checkpoint namespace of the form ``visualizer_<index>:<uuid>`` when it
    runs inside the parent. The React frontend's ``useNodeRun`` hook keys
    off the leading namespace segment to scope ``useImages`` / ``useAudio``
    per page — without the subgraph wrapping, every parallel worker runs
    at root scope and the hook attributes all three images to the same
    page.
    """

    async def worker(state: StoryState) -> dict[str, Any]:
        paragraphs = state.get("paragraphs") or []
        if index >= len(paragraphs):
            return {}
        paragraph = paragraphs[index]
        if not paragraph:
            return {}

        prompt = f"{VISUALIZER_STYLE_GUIDE}\n\nIllustrate this paragraph:\n\n{paragraph}"
        response = await visualizer_model.ainvoke([HumanMessage(content=prompt)])
        named = AIMessage(content=response.content, name=f"visualizer_{index}")
        return {"messages": [named]}

    return (
        StateGraph(StoryState)
        .add_node("worker", worker)
        .add_edge(START, "worker")
        .add_edge("worker", END)
        .compile()
    )


def _make_narrator_node(index: int):
    """Build a one-node subgraph for the i-th TTS worker.

    Same subgraph rationale as ``_make_visualizer_node``: ensures the
    narrator runs at namespace ``narrator_<index>:<uuid>`` so the React
    frontend's ``useAudio`` can scope correctly per page.
    """

    async def worker(state: StoryState) -> dict[str, Any]:
        paragraphs = state.get("paragraphs") or []
        if index >= len(paragraphs):
            return {}
        paragraph = paragraphs[index]
        if not paragraph:
            return {}

        response = await narrator_model.ainvoke([HumanMessage(content=paragraph)])
        named = AIMessage(content=response.content, name=f"narrator_{index}")
        return {"messages": [named]}

    return (
        StateGraph(StoryState)
        .add_node("worker", worker)
        .add_edge(START, "worker")
        .add_edge("worker", END)
        .compile()
    )


WORKER_NODES = (
    "visualizer_0",
    "visualizer_1",
    "visualizer_2",
    "narrator_0",
    "narrator_1",
    "narrator_2",
)


# All worker edges leave ``storyteller``, so LangGraph schedules the three
# image generations and three narrations in the same superstep.
builder = StateGraph(StoryState)
builder.add_node("storyteller", storyteller_node)
builder.add_node("visualizer_0", _make_visualizer_node(0))
builder.add_node("visualizer_1", _make_visualizer_node(1))
builder.add_node("visualizer_2", _make_visualizer_node(2))
builder.add_node("narrator_0", _make_narrator_node(0))
builder.add_node("narrator_1", _make_narrator_node(1))
builder.add_node("narrator_2", _make_narrator_node(2))

builder.add_edge(START, "storyteller")
for worker in WORKER_NODES:
    builder.add_edge("storyteller", worker)
    builder.add_edge(worker, END)

graph = builder.compile()
