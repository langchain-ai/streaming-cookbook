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

- [LangGraph streaming](https://langchain-5e9cc07a-preview-cbnews-1777416002-49cb50c.mintlify.app/oss/langgraph/streaming/overview): LangGraph streaming overview, Event Streaming, remote streaming, namespaces, protocol, `StreamChannel`, and custom transformers.
- [LangChain streaming projections](https://langchain-5e9cc07a-preview-cbnews-1777416002-49cb50c.mintlify.app/oss/langchain/streaming-projections): LangChain agent streaming projections for messages, reasoning, tool calls, state, output, and extensions.
- [Deep Agents streaming projections](https://langchain-5e9cc07a-preview-cbnews-1777416002-49cb50c.mintlify.app/oss/deepagents/streaming-projections): Deep Agents subagent streaming, nested messages, subagent tool calls, and subagent-vs-subgraph guidance.

Client and framework SDK docs:

- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/ee952a5b6426ec93c6515d58425e75a9a1037079/libs/sdk/docs)
- [React v1 SDK docs](https://github.com/langchain-ai/langgraphjs/blob/ee952a5b6426ec93c6515d58425e75a9a1037079/libs/sdk-react/docs)
- [Vue v1 SDK docs](https://github.com/langchain-ai/langgraphjs/blob/ee952a5b6426ec93c6515d58425e75a9a1037079/libs/sdk-vue/docs)
- [Svelte v1 SDK docs](https://github.com/langchain-ai/langgraphjs/blob/ee952a5b6426ec93c6515d58425e75a9a1037079/libs/sdk-svelte/docs)
- [Angular v1 SDK docs](https://github.com/langchain-ai/langgraphjs/blob/ee952a5b6426ec93c6515d58425e75a9a1037079/libs/sdk-angular/docs)

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

### TypeScript

See `typescript/README.md` for the workspace overview and package-by-package commands.

#### Terminal Streaming Scripts

`typescript/streaming` is the fastest way to inspect the streaming primitives without a browser. It includes in-process and remote examples for protocol events, message projections, state values, custom transformers, subgraphs, interrupts, Deep Agents subagents, and A2A projections.

#### Multimodal Storybook

`typescript/multimodal` is a React storybook demo that turns a prompt into a three-page bedtime story. It streams story text, generated images, audio narration, and a video page from scoped graph nodes so the UI can render each page as soon as its media arrives.

![Multimodal storybook demo](assets/multimodal.png)

#### Custom React Transport

`typescript/react-custom-transport` shows how to connect `@langchain/react` to your own backend transport. It serves LangGraph protocol events through a local Hono server and exposes a custom A2A projection beside the normal chat stream.

![Custom React transport demo](assets/transport.png)

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
pnpm dev:multimodal
pnpm dev:react-transport
pnpm dev:angular
pnpm dev:svelte
pnpm dev:vue
```

### Python

`python/` is reserved for Python cookbook examples that mirror the same streaming concepts.

## Streaming Surfaces Covered

- Event Streaming with `streamEvents(..., { version: "v3" })`.
- Remote streaming with `client.threads.stream(...)`.
- Message projections for text, reasoning, output, usage, and tool-call chunks.
- State snapshots and final output through `values` and `output`.
- Subgraph and subagent discovery.
- Human-in-the-loop interrupts and resume commands.
- Custom projections through `StreamTransformer`, `StreamChannel`, and `extensions`.
- Frontend framework hooks for React, Angular, Svelte, and Vue.
- Media projections for image, audio, and video streams.
