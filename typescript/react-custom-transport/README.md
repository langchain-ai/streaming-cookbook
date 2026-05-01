# React Custom Transport

React and Vite example that uses `@langchain/react` against a local Agent Streaming Protocol server instead of the default LangGraph hosted transport. It also projects the stream into A2A-compatible events through a custom `StreamTransformer`.

## What It Demonstrates

- `StreamProvider` with `HttpAgentServerAdapter` pointed at local command and stream endpoints.
- A local Hono server that implements the Agent Streaming Protocol over HTTP and SSE.
- Subscription filtering by protocol channel, namespace, depth, and replay cursor.
- A remote `StreamChannel` named `a2a` exposed as a custom projection.
- Rendering standard chat messages and custom A2A status/artifact events side by side.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the OpenAI provider key listed in `.env`. The local server loads the root file through `tsx --env-file=../../.env`.

Install from the TypeScript workspace root:

```bash
cd typescript
pnpm install
```

## Run

```bash
cd typescript/react-custom-transport
pnpm dev
```

This starts:

- `vite` for the browser app.
- `tsx watch --env-file=../../.env --clear-screen=false src/app.ts` for the local graph server.

Other commands:

```bash
pnpm dev:client
pnpm dev:server
pnpm build:internal
pnpm preview
```

The Vite dev server proxies `/api` to the local Hono server on `http://localhost:9123`.

## How It Works

`src/app.ts` builds a simple LangGraph chat agent and starts `CustomServer`. The server exposes the Agent Streaming Protocol routes consumed by `HttpAgentServerAdapter`:

- `POST /api/threads/:threadId/commands` accepts `run.start` commands and starts an in-process `streamEvents(..., { version: "v3" })` run.
- `POST /api/threads/:threadId/stream` opens a filtered SSE subscription and replays matching buffered events when a cursor is provided.

`src/client.tsx` configures `HttpAgentServerAdapter` with those local paths and passes it to `StreamProvider`. The SDK handles command submission, SSE parsing, subscription rotation, and projection hooks in the browser.

`src/app/session.ts` is the server-side counterpart. It buffers protocol events by sequence number, applies subscription filters, normalizes remote transformer events into `custom:<name>` events, and fans matching SSE frames out to active subscribers. When the client subscribes to `custom:a2a`, it receives the events emitted by the remote `StreamChannel` from `src/app/transformer.ts`.

## Important Files

- `src/client.tsx`: React entrypoint, `StreamProvider`, and the UI shell.
- `src/app/session.ts`: in-memory thread session, replay buffer, subscription filtering, and SSE framing.
- `src/app.ts`: graph definition and local server bootstrap.
- `src/app/server.ts`: Hono routes for Agent Streaming Protocol commands and stream subscriptions.
- `src/app/transformer.ts`: A2A `StreamTransformer` that emits `status-update` and `artifact-update` events.
- `src/components/Chat.tsx`: standard streamed chat rendering.
- `src/components/A2AProjectionPanel.tsx`: custom projection rendering.
- `src/components/Prompt.tsx`: prompt submission.

## SDK Docs

- [React SDK docs](https://github.com/langchain-ai/langgraphjs/blob/173c6ab0179baf88e07605f577e3f64e2840ab0d/libs/sdk-react/docs): `StreamProvider`, custom transports, extension projections, and React stream consumption.
- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/5e2014ff1a85fc77416a90b5f22fec9e46336d09/libs/sdk/docs): the lower-level stream, subscription, channel, and namespace behavior that this example reimplements locally.
