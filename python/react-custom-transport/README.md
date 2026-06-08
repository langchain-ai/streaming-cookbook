# React Custom Transport (Python)

Full-stack Python example with a minimal React UI. A `LocalThreadSession`
server exposes the Agent Streaming Protocol over HTTP/SSE; the bundled
`frontend/` app connects through `HttpAgentServerAdapter`.

Thread state is checkpointed in memory via `InMemorySaver` and addressed
per thread at `/threads/<thread_id>/…` (LangGraph API paths). The Vite dev
server proxies `/api` → `http://localhost:9123`, so the UI uses
`/api/threads/<thread_id>/…`.

## What it demonstrates

- `LocalThreadSession` as the server-side counterpart to
  `HttpAgentServerAdapter`.
- Per-thread SSE replay buffers and `thread_id` passed into LangGraph runs.
- `GET|POST /threads/:thread_id/state` for hydrate and thread creation.
- A ReAct agent with `search_web` and `calculator` tools.
- Token-by-token `messages` streaming and `tools` lifecycle events in the UI.
- A minimal React chat UI with one thread id per browser tab.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the OpenAI provider key listed in `.env`.

## Run

Start the Python protocol server (terminal 1):

```bash
cd python/react-custom-transport
uv sync
uv run python src/main.py
```

Start the React UI (terminal 2):

```bash
cd python/react-custom-transport/frontend
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Each tab keeps its own
thread id in `sessionStorage`. Use **New thread** to start a fresh
conversation without colliding with other tabs.

Checkpoints live in server memory only — restarting the Python process clears
all thread state. The UI detects a missing thread and recreates it (or mints a
fresh id if needed).

Vite proxies `/api` to `http://localhost:9123` and strips the `/api` prefix.

## API surface

Server routes (port 9123):

| Route | Purpose |
| --- | --- |
| `GET /threads/:thread_id/state` | Read checkpointed thread state (404 until created) |
| `POST /threads/:thread_id/state` | Create or update thread state |
| `POST /threads/:thread_id/history` | List past thread states (`{ limit, before }` body) |
| `POST /threads/:thread_id/commands` | Agent Protocol commands (`run.start`, …) |
| `POST /threads/:thread_id/stream` | Filtered SSE subscription |

Through the Vite dev proxy, the frontend calls the same paths under `/api/…`.

## Files

**Backend**

- `src/agent.py`: ReAct graph with `InMemorySaver`.
- `src/tools.py`: mock `search_web` and `calculator` tools.
- `src/app/threads.py`: checkpointer-backed get/update state helpers.
- `src/app/session.py`: `LocalThreadSession` per `thread_id`.
- `src/app/server.py`: Starlette routes for state, commands, and streams.
- `src/main.py`: loads the root `.env` and starts the server on port 9123.

**Frontend**

- `frontend/src/threads.ts`: thread id storage and `ensureThreadExists`.
- `frontend/src/App.tsx`: `StreamProvider` with `apiUrl` `/api` and `/threads/<id>/…` paths.

## TypeScript sibling

The richer UI in `typescript/react-custom-transport/` can talk to this
Python backend — point `HttpAgentServerAdapter` at the same per-thread
paths under `/api`.
