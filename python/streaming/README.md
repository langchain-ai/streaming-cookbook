# Streaming Scripts (Python)

Runnable Python examples for the LangGraph v3 streaming API. This package mirrors `typescript/streaming` — each file is meant to be read, changed, and run from the terminal.

The examples focus on `graph.astream_events(input, version="v3")`, the `AsyncGraphRunStream` projections built on top of the protocol event stream, and custom `StreamTransformer` extensions.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the Anthropic provider key listed in `.env`.

Install dependencies from this package directory:

```bash
cd python/streaming
uv sync
```

Optional:

```bash
export ANTHROPIC_MODEL=claude-haiku-4-5
```

`langgraph.json` exposes these graphs to the local LangGraph dev server (`uv run langgraph dev`):

- `simple-tool-graph`
- `simple-tool-with-metrics`
- `research-pipeline`
- `human-in-the-loop`
- `deep-agent`
- `a2a-research`

## Running Examples

Run from `python/streaming`. Each example is a module under `src/`:

```bash
uv run python -m basic.in_process
uv run python -m messages.in_process
uv run python -m parallel.in_process
uv run python -m custom_transformer.in_process
uv run python -m subgraphs.in_process
uv run python -m human_in_the_loop.in_process
uv run python -m subagents.in_process
uv run python -m subagent_status.in_process
uv run python -m a2a.in_process
```

> **Note:** the JS sibling has matching `:remote` variants that open an SDK client to `langgraph dev`. Python equivalents aren't included yet — there isn't a Python `langgraph-sdk` client for the streaming protocol. Until that exists, the in-process scripts are the primary entry point; serving these graphs over the wire is covered by the UI examples (which use the JS SDK client against the Python `langgraph dev` server).

## Example Map

| Area | Script | What it demonstrates |
| --- | --- | --- |
| Basic protocol events | `basic.in_process` | Iterating the run stream itself, inspecting protocol event methods and namespaces. |
| Messages | `messages.in_process` | Streaming text and reasoning deltas, awaiting full message output, reading `usage_metadata`. |
| Parallel consumers | `parallel.in_process` | Consuming `run.messages`, `run.values`, and raw protocol events concurrently without draining each other. |
| Custom transformers | `custom_transformer.in_process` | Adding `StreamTransformer` projections under `run.extensions` and exposing remote `StreamChannel` values. |
| Subgraphs | `subgraphs.in_process` | Discovering nested graph runs with `run.subgraphs`, then reading scoped messages from each. |
| Human in the loop | `human_in_the_loop.in_process` | Pausing on interrupts, reading `await run.interrupted()` / `await run.interrupts()`, then resuming with `Command(resume=...)`. |
| Deep Agents subagents | `subagents.in_process`, `subagent_status.in_process` | Reading `run.subagents`, watching delegated task input, messages, tool calls, and completion status. |
| A2A projection | `a2a.in_process` | Translating LangGraph protocol events into A2A `status-update` and `artifact-update` events through a custom transformer. |

## API Surface Cheatsheet

A few Python-specific notes that diverge from the JS sibling:

- `await graph.astream_events(input, version="v3")` returns an `AsyncGraphRunStream` — await the call itself, not just the iterator.
- `run.output`, `run.interrupted`, `run.interrupts` are **methods**, not properties: `await run.output()`. Forgetting the parentheses returns a coroutine that is never awaited.
- `AsyncChatModelStream` exposes `.text`, `.reasoning`, `.tool_calls`, `.output` (all `AsyncProjection`s — both async-iterable and awaitable). There is no `.usage` projection; read token counts from `(await msg.output).usage_metadata`.
- Custom `StreamTransformer` subclasses must accept `scope: tuple[str, ...] = ()` in their `__init__` — the mux calls factories as `factory(scope)`.
- The Python v3 protocol emits two event methods at the top level: `messages` and `values`. Tool activity is derived from `content-block-{start,finish}` blocks of type `tool_call_chunk` / `tool_call` inside messages events, not from a dedicated `tools` event.

## Important Files

- `src/agents/simple_tool_graph.py` — small tool-calling graph used by the basic, messages, parallel, and custom-transformer examples.
- `src/agents/simple_tool_with_metrics.py` — the same tool graph compiled with metric transformers via a module-level `stream_transformers()` factory.
- `src/agents/research_pipeline.py` — nested researcher and analyst subgraphs for the subgraphs example.
- `src/agents/hitl_agent.py` — interruptible agent for approve/resume flows. Bakes in an `InMemorySaver` so the `Command(resume=...)` flow works out of the box.
- `src/agents/deep_agent.py` — a Deep Agents example that delegates work through subagents.
- `src/agents/a2a_research.py` — research pipeline compiled with the A2A stream transformer.
- `src/shared/custom_transformers.py` — reusable stream transformers for tool activity and aggregate token/tool stats.
- `src/shared/a2a_transformer.py` — emits A2A-compatible events into a `StreamChannel("a2a")`.
