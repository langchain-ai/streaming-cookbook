# A2UI Generative UI (Python Backend)

Python port of the backend half of `typescript/a2ui/`. Serves the same
graph wire-shape on the same port (`2024`) so the unchanged React
frontend in `typescript/a2ui/` can talk to either a Node or a Python
`langgraph dev` server.

## What it does

- Builds a ReAct-style agent via `langchain.agents.create_agent` with
  the verbatim A2UI v0.9 system prompt from the JS sibling.
- Attaches an `A2UITransformer` (`langgraph.stream.StreamTransformer`)
  that watches `messages` v3 events. On every `content-block-delta`
  with `delta.type == "text-delta"` it buffers the chunk, splits on
  newlines, and for each line that starts with `A2UI:` parses the
  trailing JSON and pushes it to a `StreamChannel("a2ui")`.
- Exposes the channel remotely as `custom:a2ui`. The React frontend
  subscribes via `useExtension(stream, "a2ui")` with no code change.
- Exports the compiled graph as `agent` (matching the JS export name)
  so `langgraph.json` can reference `./src/agent.py:agent`.

The agent emits plain `dict` payloads of shape `{"message": ...,
"sequence": ...}`, mirroring the JS `A2UIStreamEvent` type. The
frontend does not introspect Python-side types.

## Run

From this directory:

```bash
uv sync
uv run langgraph dev --no-browser --port 2024
```

The dev server reads `OPENAI_API_KEY` from the repository-root `.env`
(via the relative `env` path in `langgraph.json`). Health-check:

```bash
curl -sS http://127.0.0.1:2024/ok
# {"ok":true}
```

## Run the frontend

The frontend lives in `typescript/a2ui/` and is unchanged from the
JS-backend version. It connects to `http://localhost:2024` with
assistant id `"agent"`:

```bash
cd ../../typescript/a2ui
pnpm install
pnpm dev
```

## Notes

- No user-attached checkpointer. `langgraph-api` supplies its own
  persistence and rejects user-provided checkpointers on graphs
  exposed through `langgraph.json`. The JS sibling uses `MemorySaver`
  which is omitted here for the same reason.
- Model: this port uses `openai:gpt-4o-mini`; the JS sibling references
  `gpt-5.5`. The inline system prompt drives behaviour, not the
  specific model.
- v3 protocol shape: text chunks arrive as `content-block-delta` with
  `delta.type == "text-delta"` and `delta.text == "<chunk>"`. The
  transformer ignores anything else (tool call chunks, message
  lifecycle events) for parsing purposes.
