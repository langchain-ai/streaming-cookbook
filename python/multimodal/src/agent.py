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

from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from openai import OpenAI


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
NARRATOR_TTS_MODEL = "gpt-4o-mini-tts"
NARRATOR_TTS_FORMAT = "mp3"

IMAGE_MODEL = "gpt-image-1"
IMAGE_SIZE = "1024x1024"
IMAGE_QUALITY = "medium"

STORYTELLER_MODEL = "gpt-4o-mini"


storyteller_model = ChatOpenAI(model=STORYTELLER_MODEL)


def _openai_client() -> OpenAI:
    """Lazy OpenAI client.

    ``langgraph dev`` imports the graph module at startup before any request
    arrives; constructing the client at import time would fail when the env
    file hasn't been loaded yet. We grab it on first use so the worker nodes
    see the ``OPENAI_API_KEY`` that ``langgraph dev`` injected.
    """
    return OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


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


class StoryState(TypedDict, total=False):
    """Graph state.

    ``messages`` accumulates LangChain messages via the standard
    ``add_messages`` reducer. ``paragraphs`` is the coordination channel
    between the storyteller and the six media workers: once populated, all
    visualizers and narrators can run in parallel using their page index.
    """

    messages: Annotated[list[AnyMessage], add_messages]
    paragraphs: list[str]


def storyteller_node(state: StoryState) -> dict[str, Any]:
    prompt = _last_human_text(state.get("messages", []))
    response = storyteller_model.invoke(
        [SystemMessage(content=STORYTELLER_SYSTEM), HumanMessage(content=prompt)]
    )

    text = response.content if isinstance(response.content, str) else ""
    paragraphs = _split_paragraphs(text)
    return {"messages": [response], "paragraphs": paragraphs}


def _make_visualizer_node(index: int):
    """Build an image-generation worker bound to a specific story page.

    The worker is its own graph node (``visualizer_<index>``) so LangGraph
    gives it a stable per-page checkpoint namespace the client can scope to.
    Image bytes are kept out of persisted state — we only keep a short URL or
    base64 reference on ``additional_kwargs`` so the client can pick it up
    from the streamed message event, and the final state snapshot stays
    cheap to serialize.
    """

    async def node(state: StoryState) -> dict[str, Any]:
        paragraphs = state.get("paragraphs") or []
        if index >= len(paragraphs):
            return {}
        paragraph = paragraphs[index]
        if not paragraph:
            return {}

        client = _openai_client()
        prompt = f"{VISUALIZER_STYLE_GUIDE}\n\nIllustrate this paragraph:\n\n{paragraph}"
        result = client.images.generate(
            model=IMAGE_MODEL,
            prompt=prompt,
            size=IMAGE_SIZE,
            quality=IMAGE_QUALITY,
            n=1,
        )

        first = result.data[0] if result.data else None
        image_ref: dict[str, Any] = {"page_index": index}
        if first is not None:
            if getattr(first, "url", None):
                image_ref["url"] = first.url
            if getattr(first, "revised_prompt", None):
                image_ref["revised_prompt"] = first.revised_prompt

        message = AIMessage(
            content="Illustration ready.",
            name=f"visualizer_{index}",
            additional_kwargs={"image": image_ref},
        )
        return {"messages": [message]}

    return node


def _make_narrator_node(index: int):
    """Build a text-to-speech worker bound to a specific story page.

    The OpenAI Python SDK's ``audio.speech.create`` returns the full audio
    payload at once; we keep the bytes off the persisted message (only the
    byte length and format land in ``additional_kwargs``) so checkpoint
    snapshots don't balloon. The streamed event the client receives still
    surfaces the worker's progress under the ``narrator_<index>`` node
    namespace.
    """

    async def node(state: StoryState) -> dict[str, Any]:
        paragraphs = state.get("paragraphs") or []
        if index >= len(paragraphs):
            return {}
        paragraph = paragraphs[index]
        if not paragraph:
            return {}

        client = _openai_client()
        response = client.audio.speech.create(
            model=NARRATOR_TTS_MODEL,
            voice=NARRATOR_VOICE,
            input=paragraph,
            response_format=NARRATOR_TTS_FORMAT,
        )

        audio_bytes = response.read()
        # Encode once so we know the length, but only persist metadata.
        encoded = base64.b64encode(audio_bytes).decode("ascii")
        audio_meta = {
            "page_index": index,
            "format": NARRATOR_TTS_FORMAT,
            "byte_length": len(audio_bytes),
            "base64_length": len(encoded),
        }

        message = AIMessage(
            content=paragraph,
            name=f"narrator_{index}",
            additional_kwargs={"audio": audio_meta},
        )
        return {"messages": [message]}

    return node


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
