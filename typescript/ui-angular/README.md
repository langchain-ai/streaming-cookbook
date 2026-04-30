# Angular Chat

Compact Angular example for the LangChain streaming frontend package. It shows the smallest useful `@langchain/angular` chat loop against a LangGraph dev server.

## What It Demonstrates

- `injectStream` with an `assistantId` and LangGraph API URL.
- Rendering streamed message state from the hook.
- Loading and error state for a remote stream.
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
cd typescript/ui-angular
pnpm dev
```

This runs Angular and the LangGraph dev server together:

- `pnpm dev:client`: `NG_CLI_ANALYTICS=false ng serve`
- `pnpm dev:server`: `langgraphjs dev --no-browser`

Other commands:

```bash
pnpm start
pnpm build
pnpm watch
```

## Graph

`langgraph.json` registers the `agent` assistant from `src/agent.mts`. The graph stores `messages`, calls `ChatOpenAI`, and returns the next AI message.

The client connects to:

```ts
injectStream({
  assistantId: "agent",
  apiUrl: "http://localhost:2024",
});
```

## Important Files

- `src/app.ts`: Angular component, stream hook usage, message rendering, optimistic values, and form handling.
- `src/agent.mts`: LangGraph agent used by the dev server.
- `src/styles.css`: app styling.
- `langgraph.json`: assistant and environment configuration.

## SDK Docs

- [Angular SDK docs](https://github.com/langchain-ai/langgraphjs/blob/173c6ab0179baf88e07605f577e3f64e2840ab0d/libs/sdk-angular/docs): `injectStream`, streamed values, optimistic updates, and Angular integration patterns.
- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/5e2014ff1a85fc77416a90b5f22fec9e46336d09/libs/sdk/docs): remote stream behavior shared by all framework SDKs.
