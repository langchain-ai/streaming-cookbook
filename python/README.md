# Python Streaming Cookbook

This directory collects Python examples that mirror the TypeScript workspace in `../typescript/`. Most packages are **backends** — they run `langgraph dev` on port `2024` with the same graph wire-shape as their TypeScript sibling, so you can keep the existing React/Angular/Svelte/Vue frontends unchanged.

Start with `streaming` when learning protocol events and projections, then move to a UI backend when you want to exercise framework SDKs against Python.

## Workspace Setup

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the provider keys listed in `.env`. Every Python package loads this file (via `langgraph.json` or explicit `load_dotenv` in standalone servers).

Each example is an independent `uv` project. Install and run from the package directory:

```bash
cd python/<package>
uv sync
```

There is no shared Python workspace file — treat each folder like its own mini-repo. TypeScript frontends still use `pnpm` from `../typescript/` when an example pairs a Python backend with an existing UI.

## Example Set

| Package | Focus | TypeScript sibling | Start here |
| --- | --- | --- | --- |
| `streaming` | Terminal scripts for in-process and remote streaming. | `typescript/streaming` | Learn `astream_events(..., version="v3")`, projections, subgraphs, subagents, custom transformers, interrupts, and A2A streams. |
| `multimodal` | Six-way fan-out story graph (text, images, audio). | `typescript/multimodal` | Python backend only — run `pnpm dev:multimodal` for the React UI. |
| `a2ui` | ReAct agent with `custom:a2ui` projection. | `typescript/a2ui` | Python backend only — run `pnpm dev:a2ui` for the React UI. |
| `ui-react` | Reconnect / replay against `langgraph dev`. | `typescript/ui-react` | Python backend only — run `pnpm dev:react` for the React UI. |
| `react-custom-transport` | Full-stack custom Agent Protocol server + React UI. | `typescript/react-custom-transport` | `LocalThreadSession`, per-thread SSE, `HttpAgentServerAdapter`, tool streaming. **No TypeScript backend required.** |
| `ui-angular` | Minimal chat agent. | `typescript/ui-angular` | Python backend — run the Angular app from `typescript/ui-angular`. |
| `ui-svelte` | Minimal chat agent. | `typescript/ui-svelte` | Python backend — run the Svelte app from `typescript/ui-svelte`. |
| `ui-vue` | Minimal chat agent. | `typescript/ui-vue` | Python backend — run the Vue app from `typescript/ui-vue`. |

## Common Commands

### Terminal streaming (`python/streaming`)

```bash
cd python/streaming
uv sync

# In-process
uv run python -m basic.in_process
uv run python -m messages.in_process
uv run python -m subagents.in_process

# Remote (spawns local langgraph dev, then connects via SDK)
uv run python -m basic.remote
uv run python -m custom_transformer.remote
```

See `streaming/README.md` for the full script map.

### LangGraph dev backends (port 2024)

Most UI backends share the same run pattern:

```bash
cd python/ui-react   # or multimodal, a2ui, ui-angular, ui-svelte, ui-vue
uv sync
uv run langgraph dev --port 2024
```

Then start the matching frontend from `typescript/` (see each package README for the exact `pnpm` command).

### Full-stack custom transport (port 9123)

```bash
cd python/react-custom-transport
uv sync
uv run python src/main.py

# other terminal
cd python/react-custom-transport/frontend
npm install
npm run dev
```

## SDK and Protocol Docs

Python examples use LangGraph's Python v3 event stream and, for remote scripts, `langgraph-sdk`. UI apps use the same `@langchain/react` (and other framework) packages as the TypeScript frontends.

- [LangGraph Python docs](https://docs.langchain.com/oss/python/langgraph/overview)
- [Agent streaming protocol](https://github.com/langchain-ai/agent-protocol/tree/main/streaming)
- [Python protocol bindings](https://github.com/langchain-ai/agent-protocol/tree/main/streaming/py)
- [React SDK docs](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-react/docs) (frontends call the JS SDK against Python servers)

## How To Choose An Example

- Choose `streaming/basic` when you need raw protocol events and namespaces.
- Choose `streaming/messages` when building token, reasoning, or tool-call UI.
- Choose `streaming/custom-transformer` or `react-custom-transport` when you need custom projections or your own HTTP/SSE transport.
- Choose `a2ui` when rendering declarative A2UI surfaces from a Python agent.
- Choose `streaming/subgraphs` or `multimodal` when scoped namespaces matter to the UI.
- Choose `streaming/subagents` when Deep Agents task delegation is the user-facing concept.
- Choose `ui-react` when testing browser refresh recovery.
- Choose `react-custom-transport` when implementing the Agent Protocol without `langgraph dev`.
- Choose a `ui-*` backend when validating framework bindings against a Python graph server.

## Environment Notes

- `python/streaming` uses the **Anthropic** key from the root `.env`.
- Most UI backends and `react-custom-transport` use the **OpenAI** key.
- Remote streaming scripts need **langgraph-sdk** with `client.threads.stream()` support (see `streaming/README.md`).
