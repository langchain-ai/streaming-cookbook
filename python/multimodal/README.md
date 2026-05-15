# Multimodal Bedtime Story (Python backend)

Python port of the `multimodal` example backend. Serves the same graph
wire-shape as `typescript/multimodal/` so the existing Vite/React frontend
can talk to a Python `langgraph dev` server on port 2024 unchanged.

The graph is a six-way fan-out after a single storyteller pass:

```
                       storyteller (gpt-4o-mini, three paragraphs)
                              |
       +----------+-----------+-----------+----------+----------+
       v          v           v           v          v          v
   visualizer_0 visualizer_1 visualizer_2 narrator_0 narrator_1 narrator_2
```

Once `storyteller` writes `paragraphs` into state, the six worker nodes
fire in a single superstep. **Each worker is compiled as its own subgraph**
so LangGraph assigns it a checkpoint namespace of the form
`<node_name>:<uuid>` — which is how the React client's `useNodeRun` scopes
`useImages` / `useAudio` / `useMessages` to the right per-page slot.
Without the subgraph wrapping, parallel function-nodes share the parent's
root namespace and the frontend collapses all three images onto page 0.

## Workers as chat models

OpenAI's `image_generation` and audio tools aren't surfaced as bindable
`ChatOpenAI` tools in the Python `langchain-openai` package yet, but we
can't just call the SDK directly and shove the result into an `AIMessage`
either — the v3 `messages` protocol only emits `content-block-start` /
`content-block-delta` / `content-block-finish` events for *streamed*
chat-model output. A plain `AIMessage` written into state is visible on
`run.messages` in-process but never reaches JS clients, so `useImages` /
`useAudio` see nothing.

The fix: wrap each modality as a `BaseChatModel` subclass whose
`_astream` yields `ChatGenerationChunk`s carrying the right content
block. Then the chat-model callback machinery fires the v3 events the
frontend's `MediaAssembler` consumes.

- **`_ImageGenChatModel`** calls OpenAI's `images.generate` (`gpt-image-1`,
  soft watercolor style guide in the prompt) and yields a single
  `AIMessageChunk` with content `[{type:"image", data:<b64>,
  mime_type:"image/png", encoding:"base64"}]`.
- **`_NarratorChatModel`** streams `gpt-4o-audio-preview` with
  `modalities=["text", "audio"]` and `audio.format="pcm16"`. Each
  streamed chunk yields a `ChatGenerationChunk` carrying the PCM16
  bytes as an `audio` content block with `mime_type:"audio/pcm"`.
  The 24 kHz mono PCM matches `useAudioPlayer`'s default sample rate.

The PCM path is intentional: an mp3 delivered via `audio.speech.create`
in one shot would route the frontend player through its HTMLAudioElement
strategy, which doesn't auto-reset `currentTime` after `ended` — replays
would resume from the end of the clip. PCM16 streaming uses Web Audio
scheduling, which restarts cleanly on every play.

## Other notable choices

- All OpenAI calls use `AsyncOpenAI`. `langgraph dev`'s blockbuster
  middleware catches sync HTTP calls on the event loop (including
  the sync SDK's `time.sleep` retry path).
- `_paragraphs_reducer` is needed because six parallel subgraphs each
  echo the parent's `paragraphs` value back unchanged; without a reducer
  that's six writes per superstep and `InvalidUpdateError` fires.
- `_message_text` flattens both string-content and list-of-blocks-content
  AIMessages so the storyteller's output parses correctly regardless of
  which content shape the model returns.
- No checkpointer — `langgraph-api` provides its own and rejects graphs
  that bake one in.

## Run the backend

From this directory:

```bash
uv sync
uv run langgraph dev --port 2024
```

The server exposes assistant id `"bedtime-story"` at `http://localhost:2024`,
matching the assistant id the JS frontend connects to.

## Run the frontend

The frontend lives in the TypeScript workspace and is unchanged. From the
repository root:

```bash
pnpm install
pnpm --filter @examples/ui-multimodal dev
```

Open the Vite URL and submit a story prompt. The page renders three
illustrations and three narrations as they stream in parallel.

## Requires `@langchain/langgraph-sdk` with BaseMessage normalization

The frontend uses `new HumanMessage(prompt)` and ships it through
`stream.submit(...)`. Older `@langchain/langgraph-sdk` releases call
`JSON.stringify` on the request body, which invokes
`BaseMessage.toJSON()` and emits the legacy
`{lc:1, type:"constructor", id:[...], kwargs:{...}}` envelope. Python's
`langchain_core.messages.utils._convert_to_message` rejects that shape
with `MESSAGE_COERCION_FAILURE` on the first input.

This example assumes a `@langchain/langgraph-sdk` release that
normalizes `BaseMessage` instances to the canonical
`{type, content, ...}` dict shape before stringify (see
[langchain-ai/langgraphjs#2395](https://github.com/langchain-ai/langgraphjs/pull/2395)).
If you see `MESSAGE_COERCION_FAILURE` in the `langgraph dev` log,
upgrade `@langchain/langgraph-sdk` in the workspace and reinstall.

## Files

- `src/agent.py` — `StateGraph` with one storyteller node fanning out into
  six per-page subgraphs (`visualizer_<i>` / `narrator_<i>`), each driven by
  a small `BaseChatModel` subclass. Exported as `graph`.
- `langgraph.json` — assistant id (`bedtime-story`), Python version, and
  shared root `.env` location.
- `pyproject.toml` — pinned `langgraph-api` / `langgraph-runtime-inmem`
  combo that works with the current preview release, plus `langchain-openai`
  and a direct `openai` dependency for the async client.
