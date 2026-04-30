# React Custom Transport

React and Vite example that uses `@langchain/react` with a custom local transport instead of the default LangGraph hosted transport. It also projects the stream into A2A-compatible events through a custom `StreamTransformer`.

## What It Demonstrates

- `StreamProvider` with a custom `AgentServerAdapter`.
- A local HTTP/SSE bridge that serves `streamEvents(..., { version: "v3" })` from a Hono server.
- Subscription filtering by protocol channel and namespace.
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

`src/app.ts` builds a simple LangGraph chat agent and starts `CustomGraphServer`. The server exposes `POST /api/stream`. When the client subscribes to `custom:a2a`, the server returns the `run.extensions.a2a` stream. Other subscriptions receive the regular protocol event stream encoded as SSE.

`src/transport.ts` implements the browser-side adapter. It submits input, parses SSE frames, normalizes custom events into protocol messages, and fans events out to local subscribers that match requested channels and namespaces.

## Important Files

- `src/client.tsx`: React entrypoint, `StreamProvider`, and the UI shell.
- `src/transport.ts`: custom `AgentServerAdapter` implementation.
- `src/app.ts`: graph definition and local server bootstrap.
- `src/app/server.ts`: Hono endpoint that serves protocol events and custom channel streams.
- `src/app/transformer.ts`: A2A `StreamTransformer` that emits `status-update` and `artifact-update` events.
- `src/components/Chat.tsx`: standard streamed chat rendering.
- `src/components/A2AProjectionPanel.tsx`: custom projection rendering.
- `src/components/Prompt.tsx`: prompt submission.

## SDK Docs

- [React SDK docs](https://github.com/langchain-ai/langgraphjs/blob/173c6ab0179baf88e07605f577e3f64e2840ab0d/libs/sdk-react/docs): `StreamProvider`, custom transports, extension projections, and React stream consumption.
- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/5e2014ff1a85fc77416a90b5f22fec9e46336d09/libs/sdk/docs): the lower-level stream, subscription, channel, and namespace behavior that this example reimplements locally.
