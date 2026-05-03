# Streaming Scripts

Runnable TypeScript examples for the new LangGraph and LangChain streaming APIs. This package is the script-oriented part of the cookbook: each file is meant to be read, changed, and run from the terminal.

The examples focus on `streamEvents(..., { version: "v3" })`, `client.threads.stream(...)`, and the projection objects built on top of the protocol event stream.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the Anthropic provider key listed in `.env`. The scripts in this package load that shared file automatically through `tsx --env-file=../../.env`.

Install dependencies from the TypeScript workspace root:

```bash
cd typescript
pnpm install
```

Optional:

```bash
export ANTHROPIC_MODEL=claude-haiku-4-5
```

`langgraph.json` configures Node 22 and exposes these assistants to the local LangGraph dev server:

- `simple-tool-graph`
- `simple-tool-with-metrics`
- `research-pipeline`
- `human-in-the-loop`
- `deep-agent`
- `a2a-research`

## Running Examples

Run commands from `typescript/streaming`, or prefix them from the workspace root with `pnpm --filter @examples/streaming`.

```bash
pnpm basic:in-process
pnpm messages:in-process
pnpm parallel:in-process
pnpm custom-transformer:in-process
pnpm subgraphs:in-process
pnpm hitl:in-process
pnpm subagents:in-process
pnpm subagent-status:in-process
pnpm a2a:in-process
```

Remote examples start a local LangGraph dev server, connect with `@langchain/langgraph-sdk`, and stop the server when the script exits:

```bash
pnpm basic:remote
pnpm messages:remote
pnpm parallel:remote
pnpm custom-transformer:remote
pnpm subgraphs:remote
pnpm hitl:remote
pnpm subagents:remote
pnpm subagent-status:remote
pnpm a2a:remote
```

There is also a model-level streaming script:

```bash
pnpm messages:model
```

Browser reconnect/replay is covered by the React UI package:

```bash
pnpm --filter @examples/ui-react dev
```

## Example Map

| Area | Scripts | What it demonstrates |
| --- | --- | --- |
| Basic protocol events | `basic:*` | Iterating the run stream itself, inspecting protocol event methods and namespaces, and awaiting `run.output` or `thread.output`. |
| Messages | `messages:*`, `messages:model` | Streaming text and reasoning deltas, awaiting full message text, reading usage metadata, and comparing graph-level and model-level streams. |
| Parallel consumers | `parallel:*` | Consuming messages, state snapshots, and raw protocol events at the same time without draining each other. |
| Custom transformers | `custom-transformer:*` | Adding `StreamTransformer` projections under `run.extensions` and exposing remote `StreamChannel` values to SDK clients. |
| Subgraphs | `subgraphs:*` | Discovering nested graph runs with `run.subgraphs` or `thread.subgraphs`, then reading scoped messages from each subgraph. |
| Human in the loop | `hitl:*` | Pausing on interrupts, reading `run.interrupted` and `run.interrupts`, then resuming with `Command`. |
| Deep Agents subagents | `subagents:*`, `subagent-status:*` | Reading `run.subagents` or `thread.subagents`, watching delegated task input, messages, tool calls, and completion status. |
| A2A projection | `a2a:*` | Translating LangGraph protocol events into A2A `status-update` and `artifact-update` events through a custom transformer. |
| Browser reconnect | `../ui-react` | Refreshing the page mid-stream, preserving the thread id, and rendering replayed token messages through `useMessages`. |

The package currently also has `api:*` script entries for lower-level protocol experiments. Those scripts expect files under `src/api`; if that directory is not present in your checkout, skip them or re-import the API examples before running.

## Important Files

- `src/agents/simple-tool-graph.ts`: a small tool-calling graph used by the basic, message, parallel, and custom-transformer examples.
- `src/agents/simple-tool-with-metrics.ts`: the same tool graph compiled with metric transformers so remote clients can read custom projections.
- `src/agents/research-pipeline.ts`: a graph with nested researcher and analyst work for subgraph examples.
- `src/agents/hitl-agent.ts`: an interruptible graph for approve/resume flows.
- `src/agents/deep-agent.ts`: a Deep Agents example that delegates work through subagents.
- `src/agents/a2a-research.ts`: the graph used by the A2A examples.
- `src/shared/custom-transformers.ts`: reusable stream transformers for tool activity and aggregate token/tool stats.
- `src/shared/a2a-transformer.ts`: emits A2A-compatible events into a remote `StreamChannel`.
- `src/shared/dev-server.ts`: starts `langgraphjs dev` for remote SDK examples.
- `src/reconnect/issue-responses.md`: GitHub response drafts for streaming-related issues found during the original reconnect/replay planning pass.

## Concepts Covered

The scripts are intentionally small and explicit. Use them to learn which projection to reach for:

- Use the run object itself when exact protocol order matters.
- Use `run.messages` or `thread.messages` for model text, reasoning, tool-call chunks, output, and usage.
- Use `run.values` or `thread.values` when state snapshots are the product surface.
- Use `run.subgraphs` for graph execution structure.
- Use `run.subagents` for Deep Agents task delegation that should appear in an application UI.
- Use `run.extensions` or `thread.extensions` when a custom stream transformer shapes events into product-specific data.
- Use `../ui-react` when you need a browser-level reconnect demo with page refresh, replayed messages, and token streaming through `useMessages`.
