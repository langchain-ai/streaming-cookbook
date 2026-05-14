# ui-svelte (Python backend)

Python parity for the [`typescript/ui-svelte`](../../typescript/ui-svelte/) cookbook example. Serves the same one-node `agent` graph on the same port (2024), so the existing Svelte frontend can talk to a Python `langgraph dev` server unchanged.

## Prerequisites

- Python 3.12 (managed via [`uv`](https://docs.astral.sh/uv/))
- An `OPENAI_API_KEY` in the repo-root `.env` (loaded via `langgraph.json`'s `"env": "../../.env"`)

## Run the backend

From this directory:

```bash
uv sync
uv run langgraph dev
```

`langgraph dev` listens on `http://localhost:2024` and exposes an assistant id of `agent`.

## Run the frontend

The Svelte frontend lives in the sibling TypeScript directory and is unchanged. From `typescript/ui-svelte/`:

```bash
pnpm install
pnpm dev
```

It connects to `http://localhost:2024` with assistant id `"agent"` — pointing at either the Node or Python backend works identically.
