# React Reconnect Streaming (Python backend)

Python port of the `ui-react` example backend. Serves the same graph wire-shape
as `typescript/ui-react/` so the existing Vite/React frontend can talk to a
Python `langgraph dev` server on port 2024 unchanged.

The JS sibling defines a `deepagents` agent with a `MemorySaver` checkpointer.
This Python build drops the checkpointer because `langgraph-api` ships its own
persistence layer and rejects graphs that attach a custom one.

## Run the backend

From this directory:

```bash
uv sync
uv run langgraph dev --port 2024
```

The server exposes assistant id `"agent"` at `http://localhost:2024`, matching
the assistant id the JS frontend connects to.

## Run the frontend

The frontend lives in the TypeScript workspace and is unchanged. From the
repository root:

```bash
pnpm install
pnpm --filter @examples/ui-react dev
```

Open the Vite URL, start a streamed run, then click **Refresh mid-stream**
while the assistant is still responding to exercise the reconnect path.

## Files

- `src/agent.py`: `deepagents.create_deep_agent` graph exported as `graph`.
- `langgraph.json`: assistant and environment configuration consumed by
  `langgraph dev`.
- `pyproject.toml`: pinned `langgraph-api` / `langgraph-runtime-inmem` combo
  that works with the current preview release.
