# LangChain Streaming Cookbook

This cookbook collects runnable examples for the new streaming features across LangGraph, LangChain agents, Deep Agents, and framework-specific frontend packages.

## What's New

The new streaming work moves LangGraph and LangChain from low-level stream-mode tuples toward a protocol and SDK layer designed for large, interactive agent applications.

- **Typed protocol events instead of raw chunks.** Streams now use a common event envelope with a channel-like method, namespace, sequence metadata, timestamp, and typed payload. Consumers no longer need to decode tuple positions or infer where an event came from.
- **Channels for concerns, not products.** Core channels such as `messages`, `values`, `updates`, `tools`, `lifecycle`, `input`, and `custom:*` describe reusable streaming concerns. LangChain agents, Deep Agents, framework hooks, and custom projections all build on the same event model.
- **Projection APIs for application code.** In-process runs and remote threads expose ergonomic views such as messages, values, output, subgraphs, subagents, tool calls, interrupts, and extensions. You can iterate live deltas or await final values without manually parsing the full event stream.
- **Selective subscriptions.** Remote clients can subscribe by channel, namespace, and depth, so UIs only receive the parts of a large agent tree they need. This is critical when a run fans out across many subgraphs or subagents.
- **Reconnect and replay semantics.** Events carry ordering metadata so clients can recover after a dropped connection by resuming from the last seen event instead of replaying or duplicating an entire stream.
- **Content-block message streaming.** Model output is represented with explicit message and content-block lifecycles, making text, reasoning, tool-call arguments, usage, and provider-specific content easier to assemble without lossy chunk merging.
- **Multimodal streaming.** The protocol separates JSON lifecycle metadata from media payload delivery, allowing text, image, audio, and video streams to be routed and rendered with the transport best suited to each modality.
- **Extensible stream transformers.** Built-in and user-defined transformers can derive typed projections from protocol events. Custom projections can stay local or be exposed remotely through named stream channels.

## Documentation

The cookbook tracks these preview docs pages. These APIs and docs are still in preview and may change:

**TypeScript**

- [LangGraph event streaming](https://docs.langchain.com/oss/javascript/langgraph/event-streaming): LangGraph streaming overview, Event Streaming, remote streaming, namespaces, protocol, `StreamChannel`, and custom transformers.
- [LangChain event streaming](https://docs.langchain.com/oss/javascript/langchain/event-streaming): LangChain agent streaming projections for messages, reasoning, tool calls, state, output, and extensions.
- [DeepAgents event streaming](https://docs.langchain.com/oss/javascript/deepagents/event-streaming): Deep Agents subagent streaming, nested messages, subagent tool calls, and subagent-vs-subgraph guidance.

**Python**

- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview): Python graphs, checkpointers, and `astream_events(..., version="v3")`.
- [LangChain agents (Python)](https://docs.langchain.com/oss/python/langchain/agents): agent construction used by several Python backends in this repo.

Client and framework SDK docs:

- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/cb/stream-improvements/libs/sdk/docs)
- [React v1 SDK docs](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-react/docs)
- [Vue v1 SDK docs](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-vue/docs)
- [Svelte v1 SDK docs](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-svelte/docs)
- [Angular v1 SDK docs](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-angular/docs)

Streaming protocol and generated bindings:

- [LangChain agent streaming protocol](https://github.com/langchain-ai/agent-protocol/tree/main/streaming)
- [Python protocol bindings](https://github.com/langchain-ai/agent-protocol/tree/main/streaming/py)
- [TypeScript protocol bindings](https://github.com/langchain-ai/agent-protocol/tree/main/streaming/js)

## Setup

Create one root env file for every example:

```bash
cp .env.example .env
```

Then fill in the provider keys listed in `.env`. The real `.env` file is ignored by git; keep `.env.example` as the documented template.

## Examples

Each concept below has a **TypeScript** and/or **Python** package. Several UI
examples pair a Python `langgraph dev` backend with a TypeScript frontend,
while `typescript/a2ui`, `typescript/openui`, and the custom-backend examples
also demonstrate self-contained full-stack variants.

| Concept                    | TypeScript                        | Python                                     |
| -------------------------- | --------------------------------- | ------------------------------------------ |
| Terminal streaming scripts | `typescript/streaming`            | `python/streaming`                         |
| Multimodal storybook       | `typescript/multimodal`           | `python/multimodal` (backend)              |
| A2UI generative UI         | `typescript/a2ui`                 | `python/a2ui` (backend)                    |
| OpenUI parallel dashboard  | `typescript/openui`               | —                                          |
| React reconnect            | `typescript/ui-react`             | `python/ui-react` (backend)                |
| Custom React backend       | `typescript/react-custom-backend` | `python/react-custom-backend` (full stack) |
| Angular chat               | `typescript/ui-angular`           | `python/ui-angular` (backend)              |
| Svelte chat                | `typescript/ui-svelte`            | `python/ui-svelte` (backend)               |
| Vue chat                   | `typescript/ui-vue`               | `python/ui-vue` (backend)                  |

- TypeScript workspace overview: [`typescript/README.md`](typescript/README.md)
- Python workspace overview: [`python/README.md`](python/README.md)

### TypeScript

See `typescript/README.md` for the workspace overview and package-by-package commands.

#### Terminal Streaming Scripts

`typescript/streaming` is the fastest way to inspect the streaming primitives without a browser. It includes in-process and remote examples for protocol events, message projections, state values, custom transformers, subgraphs, interrupts, Deep Agents subagents, and A2A projections.

#### Multimodal Storybook

`typescript/multimodal` is a React storybook demo that turns a prompt into a three-page bedtime story. It streams story text, generated images, audio narration, and a video page from scoped graph nodes so the UI can render each page as soon as its media arrives.

![Multimodal storybook demo](assets/multimodal.png)

#### A2UI Generative UI

`typescript/a2ui` demonstrates generative UI where a ReAct Agent produces A2UI v0.9 declarative interface descriptions from natural language prompts. The agent streams messages through a `custom:a2ui` channel; the React frontend consumes them via `@langchain/react`, processes them with `@a2ui/web_core/MessageProcessor`, and renders live surfaces with `@a2ui/react`.

**Key concepts shown**:
- Custom `StreamTransformer` that parses `A2UI:` prefixed JSON lines from LLM output
- `useExtension(stream, "a2ui")` hook for subscribing to custom projections
- Real-time surface building as A2UI `createSurface`, `updateComponents`, and `updateDataModel` messages arrive
- Action handling for interactive components (buttons, forms) with context captured back into the surface data model

**Example prompt**: "Build a team directory with contact cards" produces a complete UI with headers, stat cards, scrollable lists, and detailed profile views without writing any React component code.

See `typescript/a2ui/README.md` for full architecture details, system prompt explanation, and customization ideas.

#### OpenUI Parallel Dashboard

`typescript/openui` demonstrates a Deep Agents coordinator that delegates
Stripe, PostHog, GitHub, and Calendar panels in one parallel task turn. The
React client discovers those subagents through `stream.subagents`, scopes
each panel with `useMessages(stream, snapshot)`, and feeds each independent
OpenUI Lang stream into its own OpenUI renderer. This shows dynamic panel
discovery and render isolation without a custom stream transformer or manual
event demultiplexing.

![OpenUI parallel dashboard demo](assets/openui-dashboard.gif)

The example runs with deterministic mock business data by default and
supports explicitly configured live provider adapters.

#### React Reconnect

`typescript/ui-react` shows browser reconnect and replay with the standard LangGraph dev server. Start a streamed run, refresh the page while it is still loading, and the React UI reattaches to the same thread so buffered messages catch up before live events continue.

#### Custom React Backend

`typescript/react-custom-backend` shows how to connect `@langchain/react` to your own Agent Protocol backend instead of `langgraph dev`. It serves commands, filtered SSE streams, and checkpointed thread state through a local Hono server, then renders token-by-token messages and tool lifecycle events in the React UI.

![Custom React backend demo](assets/custom-backend.png)

#### Framework Chat SDKs

`typescript/ui-angular`, `typescript/ui-svelte`, and `typescript/ui-vue` are compact chat apps for the framework SDKs. They share the same shape: a simple LangGraph chat agent, streamed message state, loading/error handling, and optimistic user-message updates through `@langchain/angular`, `@langchain/svelte`, and `@langchain/vue`.

![Framework chat SDK demo](assets/ui.png)

Start from the TypeScript workspace root:

```bash
cd typescript
pnpm install
```

Then run individual examples:

```bash
pnpm --filter @examples/streaming basic:in-process
pnpm --filter @examples/streaming subagents:remote
pnpm dev:a2ui
pnpm dev:openui
pnpm dev:multimodal
pnpm dev:react
pnpm dev:react-custom-backend
pnpm dev:angular
pnpm dev:svelte
pnpm dev:vue
```

### Python

See `python/README.md` for the package overview, `uv` setup, and per-example commands.

Python examples use [`uv`](https://docs.astral.sh/uv/) per package (`cd python/<example> && uv sync`). They load the same root `.env` as the TypeScript workspace.

#### Terminal Streaming Scripts

`python/streaming` mirrors `typescript/streaming`: in-process and remote scripts for protocol events, message projections, custom transformers, subgraphs, interrupts, Deep Agents subagents, and A2A projections.

```bash
cd python/streaming
uv sync
uv run python -m basic.in_process
uv run python -m messages.remote
```

#### Multimodal Storybook (Python backend)

`python/multimodal` serves the same graph wire-shape as `typescript/multimodal` on port `2024`. Run the Python backend, then the unchanged React frontend from `typescript/multimodal`.

```bash
cd python/multimodal && uv sync && uv run langgraph dev --port 2024
# other terminal:
cd typescript && pnpm install && pnpm dev:multimodal
```

#### A2UI Generative UI (Python backend)

`python/a2ui` exposes the same `custom:a2ui` projection as `typescript/a2ui`. Point the existing React app at the Python dev server with no frontend changes.

```bash
cd python/a2ui && uv sync && uv run langgraph dev --port 2024
# other terminal:
cd typescript && pnpm install && pnpm dev:a2ui
```

#### React Reconnect (Python backend)

`python/ui-react` serves the same reconnect demo graph as `typescript/ui-react` on port `2024`.

```bash
cd python/ui-react && uv sync && uv run langgraph dev --port 2024
# other terminal:
cd typescript && pnpm install && pnpm dev:react
```

#### Custom React Backend (full stack)

`python/react-custom-backend` is a self-contained Python stack: `LocalThreadSession` on port `9123`, per-thread checkpoints and history, tool-calling agent streams, and a bundled React UI via `HttpAgentServerAdapter`.

```bash
cd python/react-custom-backend && uv sync && uv run python src/main.py
# other terminal:
cd python/react-custom-backend/frontend && npm install && npm run dev
```

See `python/react-custom-backend/README.md` for the Agent Protocol routes and thread model.

#### Framework Chat SDKs (Python backends)

`python/ui-angular`, `python/ui-svelte`, and `python/ui-vue` each serve a minimal chat agent on port `2024`. Pair them with the matching frontend in `typescript/ui-*`.

```bash
# Example: Svelte
cd python/ui-svelte && uv sync && uv run langgraph dev
# other terminal:
cd typescript/ui-svelte && pnpm install && pnpm dev
```

## Streaming Surfaces Covered

- Event Streaming with `streamEvents(..., { version: "v3" })`.
- Remote streaming with `client.threads.stream(...)`.
- Message projections for text, reasoning, output, usage, and tool-call chunks.
- State snapshots and final output through `values` and `output`.
- Subgraph and subagent discovery.
- Parallel OpenUI Lang rendering from namespace-scoped subagent messages.
- Human-in-the-loop interrupts and resume commands.
- Custom projections through `StreamTransformer`, `StreamChannel`, and `extensions`.
- Reconnect and replay behavior with browser refresh recovery, sequence cursors, filtered subscriptions, and event-id deduplication.
- Frontend framework hooks for React, Angular, Svelte, and Vue.
- Media projections for image, audio, and video streams.
