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
fire in a single superstep. Each worker is its own graph node so LangGraph
gives it a stable per-page checkpoint namespace (`<node_name>:<uuid>`),
which is how the React client scopes `useImages` / `useAudio` /
`useMessages` to the right per-page slot with no shared-tool plumbing.

## Stubs vs. the JS sibling

The TypeScript version uses `ChatOpenAI.bindTools` against OpenAI's
first-class `image_generation` and audio tools. The Python `langchain-openai`
package does not yet surface those as bindable tools, so this port calls the
OpenAI Python SDK directly inside each worker node:

- `visualizer_<i>` calls `client.images.generate` (`gpt-image-1`, soft
  watercolor style guide baked into the prompt) and attaches the resulting
  URL / revised_prompt onto the `AIMessage`'s `additional_kwargs.image`.
  Raw image bytes are kept out of persisted state.
- `narrator_<i>` calls `client.audio.speech.create` (`gpt-4o-mini-tts`,
  voice `nova`, `mp3`) and writes only metadata (`format`, `byte_length`)
  to `additional_kwargs.audio`. The audio bytes themselves are deliberately
  not persisted; the streamed event surfaces the worker's progress under
  the `narrator_<i>` node namespace.

The architectural shape (parallel fan-out, per-page namespaces, three
paragraphs) is preserved.

The JS sibling attaches a `MemorySaver` checkpointer. This Python build
drops it because `langgraph-api` provides persistence and rejects graphs
that bake in a custom one.

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
pnpm --filter @examples/multimodal dev
```

Open the Vite URL and submit a story prompt. The page renders three
illustrations and three narrations as they stream in parallel.

## Files

- `src/agent.py`: `StateGraph` with one storyteller node fanning out into
  six parallel `visualizer_<i>` / `narrator_<i>` workers, exported as `graph`.
- `langgraph.json`: assistant id (`bedtime-story`), Python version, and
  shared root `.env` location.
- `pyproject.toml`: pinned `langgraph-api` / `langgraph-runtime-inmem` combo
  that works with the current preview release.
