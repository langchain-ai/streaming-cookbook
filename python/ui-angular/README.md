# Angular Chat (Python backend)

Python port of the LangGraph backend in `typescript/ui-angular`. It serves
the exact same `agent` graph wire-shape on the same port (2024), so the
existing Angular frontend in `typescript/ui-angular` can talk to this
Python `langgraph dev` server without any changes.

The graph is a single-node `StateGraph(MessagesState)` that calls
`ChatOpenAI(model="gpt-4o-mini")` on the conversation history and appends
the assistant's reply.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the OpenAI provider key listed in `.env`. The LangGraph dev server
loads the root file through `langgraph.json`.

## Run the backend

From this directory:

```bash
uv sync
uv run langgraph dev
```

This starts the LangGraph dev server on `http://localhost:2024`, exposing
the assistant id `"agent"`.

## Run the frontend

The Angular frontend lives in the TypeScript workspace and is unchanged.
From a separate shell:

```bash
cd typescript/ui-angular
pnpm install
pnpm dev:client
```

(Use `pnpm dev:client` rather than `pnpm dev` so you don't also boot the
JS LangGraph dev server, which would clash on port 2024.)

The Angular client connects to:

```ts
injectStream({
  assistantId: "agent",
  apiUrl: "http://localhost:2024",
});
```

## Files

- `src/agent.py`: one-node `StateGraph` invoking `ChatOpenAI`.
- `langgraph.json`: registers the `agent` assistant and loads `../../.env`.
- `pyproject.toml`: dependencies, including the pinning combo required by
  the `langgraph-api` 0.9.0rc1 preview.
