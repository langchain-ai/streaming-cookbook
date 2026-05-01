# TypeScript Streaming Cookbook

This directory is a pnpm workspace for TypeScript examples that exercise the new LangGraph, LangChain, Deep Agents, and frontend streaming surfaces.

The examples are split into terminal scripts and UI apps. Start with `streaming` when learning the protocol and projections, then move to the UI packages when building product-facing streaming experiences.

## Workspace Setup

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the provider keys listed in `.env`. All TypeScript examples load this root env file, including package-level `tsx` scripts and LangGraph dev-server examples.

```bash
cd typescript
pnpm install
```

The workspace is declared in `pnpm-workspace.yaml` and includes:

- `streaming`
- `multimodal`
- `react-custom-transport`
- `ui-angular`
- `ui-svelte`
- `ui-vue`

Many packages use `workspace:*` LangChain dependencies because these examples were imported from active LangChain development. Keep those linked to the local LangChain packages while the streaming APIs are still previewing, or replace them with published versions when the matching packages are available.

## Example Set

| Package                  | Focus                                                             | Start here                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streaming`              | Terminal scripts for in-process and remote streaming projections. | Learn `streamEvents`, `client.threads.stream`, messages, values, subgraphs, subagents, custom transformers, interrupts, and A2A projection streams. |
| `multimodal`             | React storybook with text, images, audio, and video.              | See how media projections and subgraph-scoped hooks build a rich streamed UI.                                                                       |
| `react-custom-transport` | React app with a custom local transport and A2A projection.       | Use when you need to serve protocol events from your own backend shape.                                                                             |
| `ui-angular`             | Minimal Angular chat.                                             | Learn `@langchain/angular` `injectStream` with optimistic message state.                                                                            |
| `ui-svelte`              | Minimal Svelte chat.                                              | Learn `@langchain/svelte` `useStream` with reactive message state.                                                                                  |
| `ui-vue`                 | Minimal Vue chat.                                                 | Learn `@langchain/vue` `useStream` with computed message state.                                                                                     |

## SDK Documentation

Use these docs as the API reference while reading or extending the examples:

- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/5e2014ff1a85fc77416a90b5f22fec9e46336d09/libs/sdk/docs): remote `Client`, `ThreadStream`, subscriptions, channels, namespaces, and replay behavior.
- [React SDK docs](https://github.com/langchain-ai/langgraphjs/tree/cb/stream-improvements/libs/sdk-react/docs): `useStream`, `StreamProvider`, media hooks, custom transports, and extension projections.
- [Vue SDK docs](https://github.com/langchain-ai/langgraphjs/tree/cb/stream-improvements/libs/sdk-vue/docs): Vue `useStream` patterns.
- [Svelte SDK docs](https://github.com/langchain-ai/langgraphjs/tree/cb/stream-improvements/libs/sdk-svelte/docs): Svelte `useStream` patterns.
- [Angular SDK docs](https://github.com/langchain-ai/langgraphjs/tree/cb/stream-improvements/libs/sdk-angular/docs): Angular `injectStream` patterns.

## Common Commands

Run package commands from the package directory, or from this workspace root with `--filter`.

```bash
pnpm --filter @examples/streaming basic:in-process
pnpm --filter @examples/streaming subagents:remote
pnpm --filter @examples/ui-multimodal dev
pnpm --filter @examples/ui-react-transport dev
pnpm --filter @examples/ui-angular dev
pnpm --filter @examples/ui-svelte dev
pnpm --filter @examples/ui-vue dev
```

Convenience scripts are also available at the workspace root:

```bash
pnpm dev:multimodal
pnpm dev:react-transport
pnpm dev:angular
pnpm dev:svelte
pnpm dev:vue
```

## Environment

The script package uses the Anthropic provider key from the root `.env`. The UI packages use the OpenAI provider key from the same root `.env`.

LangGraph dev-server examples read `../../.env` through `langgraph.json`. The terminal scripts and custom React transport server read the same file through `tsx --env-file=../../.env`.

## How To Choose An Example

- Choose `streaming/basic` when you need to inspect raw protocol events and understand event methods, namespaces, and final output.
- Choose `streaming/messages` when you are building token, reasoning, usage, or message-output UI.
- Choose `streaming/custom-transformer` or `react-custom-transport` when your product needs a projection that is not built in.
- Choose `streaming/subgraphs` when internal graph structure matters to the UI.
- Choose `streaming/subagents` when Deep Agents task delegation is the user-facing concept.
- Choose `multimodal` when you need scoped media streams across parallel graph nodes.
- Choose one of the `ui-*` chat apps when validating framework bindings.
