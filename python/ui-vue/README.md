# ui-vue (Python backend)

Python backend for the `ui-vue` cookbook example. Serves the same graph
wire-shape as `typescript/ui-vue/` on the same port (2024), so the
existing Vue frontend in `typescript/ui-vue/` can talk to a Python
`langgraph dev` server unchanged.

The graph is a single-node `StateGraph` over `MessagesState` that
invokes `ChatOpenAI(model="gpt-4o-mini")` on the running messages and
appends the response. It is registered as the `agent` assistant.

## Prerequisites

Create the shared environment file at the repo root and fill in the
OpenAI key:

```bash
cp .env.example .env
```

The dev server loads it via `langgraph.json`'s `"env": "../../.env"`.

## Run the backend

From this directory:

```bash
cd python/ui-vue
uv sync
uv run langgraph dev
```

The server listens on `http://localhost:2024` with assistant id `agent`.

Health check:

```bash
curl -sS http://127.0.0.1:2024/ok
# {"ok":true}
```

## Run the frontend

The Vue frontend lives in the sibling TypeScript package and is
unchanged:

```bash
cd typescript/ui-vue
pnpm install
pnpm dev
```

It connects to the dev server at `http://localhost:2024` with
`assistantId: "agent"` — point that at either the Node or Python backend.

## Files

- `src/agent.py`: one-node `StateGraph` over `MessagesState` that calls
  `ChatOpenAI` and appends the AI message.
- `langgraph.json`: registers `agent` and points at the root `.env`.
- `pyproject.toml`: `langgraph-api` + `langgraph-runtime-inmem` pinned
  to the pre-release that the API server actually calls into, with
  `[tool.uv] prerelease = "allow"` and an override for the runtime.
