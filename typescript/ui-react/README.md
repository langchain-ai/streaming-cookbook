# React Reconnect Streaming

React and Vite example that demonstrates browser refresh recovery against the standard LangGraph dev server.

## What It Demonstrates

- `@langchain/react` `useStream` connected to `langgraphjs dev`.
- Persisting a thread id in `sessionStorage` before a page refresh.
- Reattaching to the same thread after reload so buffered messages catch up.
- Marking messages that were visible before refresh versus messages received after reconnect.

## Run It

From the TypeScript workspace root:

```bash
pnpm --filter @examples/ui-react dev
```

Open the Vite URL, start the streamed run, then click **Refresh mid-stream** while the assistant is still responding.

## Important Files

- `src/App.tsx`: React UI, `useStream`, thread persistence, and refresh control.
- `src/agent.mts`: LangGraph agent served by the dev server.
- `src/main.tsx`: Vite/React entrypoint.
- `langgraph.json`: assistant and environment configuration.
