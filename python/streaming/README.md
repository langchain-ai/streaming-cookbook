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

Remote examples need **langgraph-sdk ≥ 0.4** (`client.threads.stream()`). This
package pins a path dependency on the sibling
[`python_langgraph`](../../../python_langgraph) checkout when present; if you
only have the cookbook repo, install a 0.4+ SDK from PyPI or git once it is
available.

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

Remote examples spawn a local LangGraph dev server in a child process (see `src/shared/dev_server.py`), connect with `langgraph-sdk`, and stop the server when the script exits — mirroring the TypeScript `:remote` scripts:

```bash
uv run python -m basic.remote
uv run python -m messages.remote
uv run python -m parallel.remote
uv run python -m custom_transformer.remote
uv run python -m subgraphs.remote
uv run python -m human_in_the_loop.remote
uv run python -m subagents.remote
uv run python -m subagent_status.remote
uv run python -m a2a.remote
```

## Example Map

| Area | Scripts | What it demonstrates |
| --- | --- | --- |
| Basic protocol events | `basic.in_process`, `basic.remote` | Iterating protocol events and awaiting terminal `output` / `thread.output`. |
| Messages | `messages.in_process`, `messages.remote` | Streaming text and reasoning deltas, awaiting full message output, reading usage metadata. |
| Parallel consumers | `parallel.in_process`, `parallel.remote` | Consuming messages, values, and raw protocol events concurrently on one session. |
| Custom transformers | `custom_transformer.in_process`, `custom_transformer.remote` | `StreamTransformer` projections under `run.extensions` / `thread.extensions`. |
| Subgraphs | `subgraphs.in_process`, `subgraphs.remote` | Discovering nested runs with `run.subgraphs` / `thread.subgraphs`, then scoped messages. |
| Human in the loop | `human_in_the_loop.in_process`, `human_in_the_loop.remote` | Interrupts and resume via `Command(resume=...)` or `thread.run.respond(...)`. |
| Deep Agents subagents | `subagents.in_process`, `subagents.remote`, `subagent_status.*` | `run.subagents` / `thread.subagents`, messages, tool calls, and lifecycle status. |
| A2A projection | `a2a.in_process`, `a2a.remote` | A2A-shaped events on the `custom:a2a` channel. |

## API Surface Cheatsheet

A few Python-specific notes that diverge from the JS sibling:

- **In-process:** `await graph.astream_events(input, version="v3")` returns an `AsyncGraphRunStream` — await the call itself, not just the iterator.
- **Remote:** `async with client.threads.stream(assistant_id=...)` returns an `AsyncThreadStream`; use `await thread.output` (property, not a method).
- **In-process:** `run.output`, `run.interrupted`, `run.interrupts` are **methods**: `await run.output()`.
- **Remote subagent handles** expose `graph_name` and `trigger_call_id` (not `name` / `callId`); there is no `taskInput` helper on the Python SDK yet.
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
- `src/shared/dev_server.py` — starts `langgraph dev` for remote SDK examples (mirrors `typescript/streaming/src/shared/dev-server.ts`).
