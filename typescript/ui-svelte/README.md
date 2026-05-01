# Svelte Chat

Compact Svelte example for the LangChain streaming frontend package. It shows a minimal `@langchain/svelte` chat UI backed by a LangGraph dev server.

## What It Demonstrates

- `useStream` from `@langchain/svelte`.
- Reactive rendering of streamed messages.
- Loading and error state for the remote stream.
- Optimistic user-message insertion through `optimisticValues`.
- A simple LangGraph `StateGraph` that appends an AI message to state.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the OpenAI provider key listed in `.env`. The LangGraph dev server loads the root file through `langgraph.json`.

Install from the TypeScript workspace root:

```bash
cd typescript
pnpm install
```

## Run

```bash
cd typescript/ui-svelte
pnpm dev
```

This runs Vite and the LangGraph dev server together:

- `pnpm dev:client`: `vite`
- `pnpm dev:server`: `langgraphjs dev --no-browser`

Other commands:

```bash
pnpm build:internal
pnpm preview
```

## Graph

`langgraph.json` registers the `agent` assistant from `src/agent.mts`. The graph stores `messages`, calls `ChatOpenAI`, and returns the next AI message.

The client connects to:

```ts
const stream = useStream({
  assistantId: "agent",
  apiUrl: "http://localhost:2024",
});
```

## Important Files

- `src/App.svelte`: Svelte UI, `useStream`, message rendering, optimistic values, and form handling.
- `src/agent.mts`: LangGraph agent used by the dev server.
- `src/main.ts`: Vite/Svelte entrypoint.
- `langgraph.json`: assistant and environment configuration.

## SDK Docs

- [Svelte SDK docs](https://github.com/langchain-ai/langgraphjs/tree/cb/stream-improvements/libs/sdk-svelte/docs): `useStream`, streamed values, optimistic updates, and Svelte integration patterns.
- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/5e2014ff1a85fc77416a90b5f22fec9e46336d09/libs/sdk/docs): remote stream behavior shared by all framework SDKs.
