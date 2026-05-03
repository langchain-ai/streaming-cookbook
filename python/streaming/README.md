# Streaming Scripts

Runnable Python examples for the new LangGraph and LangChain streaming APIs. This package mirrors the TypeScript `streaming` scripts and uses `stream_events(..., version="v3")` for in-process examples.

The remote examples use the current Python SDK shape from the docs: `langgraph_sdk.get_client()` plus `client.runs.stream(...)`. The TypeScript-only `client.threads.stream(...)` projection API does not have a matching Python surface yet.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the Anthropic provider key listed in `.env`. The Python scripts load that shared file at runtime without printing secret values.

Install dependencies from this package:

```bash
cd python/streaming
uv sync
```

`langgraph.json` exposes these assistants to the local LangGraph dev server:

- `simple-tool-graph`
- `simple-tool-with-metrics`
- `research-pipeline`
- `human-in-the-loop`
- `deep-agent`
- `a2a-research`

## Running Examples

Run commands from `python/streaming`:

```bash
uv run basic
uv run messages
uv run parallel
uv run custom-transformer
uv run subgraphs
uv run hitl
uv run subagents
uv run a2a
```

There is also a model-level streaming script:

```bash
uv run messages-model
```

## Example Map

| Area                  | Scripts                            | What it demonstrates                                                                                                       |
| --------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Basic protocol events | `basic-*`                          | Iterating protocol events and reading final output.                                                                        |
| Messages              | `messages-*`, `messages-model`     | Streaming text and reasoning deltas, reading full message output, and inspecting usage metadata.                           |
| Parallel consumers    | `parallel-*`                       | Reading multiple projections from one run with `run.interleave(...)`, or multiple remote stream modes from the SDK.        |
| Custom transformers   | `custom-transformer-*`             | Adding `StreamTransformer` projections under `run.extensions` and exposing named `StreamChannel` values to remote clients. |
| Subgraphs             | `subgraphs-*`                      | Discovering nested graph runs with `run.subgraphs`, and observing remote subgraph events through SDK stream chunks.        |
| Human in the loop     | `hitl-*`                           | Pausing on interrupts, reading `run.interrupted` and `run.interrupts`, then resuming with `Command`.                       |
| Deep Agents subagents | `subagents-*`, `subagent-status-*` | Reading `run.subagents` in process and observing remote subagent lifecycle chunks.                                         |
| A2A projection        | `a2a-*`                            | Translating LangGraph protocol events into A2A-shaped status and artifact events through a custom transformer.             |
