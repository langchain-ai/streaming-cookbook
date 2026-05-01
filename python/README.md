# Python Streaming Cookbook

This directory contains Python examples for LangGraph and LangChain streaming APIs.

The examples currently live in `streaming`, which mirrors the TypeScript `streaming` scripts where the Python SDK has equivalent surfaces. More Python example packages will be added here as the cookbook grows.

## Workspace Setup

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the Anthropic provider key listed in `.env`. Python examples load this root env file at runtime without printing secret values.

Install dependencies from the package you want to run:

```bash
cd python/streaming
uv sync
```

## Example Set

- `streaming`: terminal scripts for in-process streaming. Start here to learn protocol events, messages, subgraphs, subagents, custom transformers, interrupts, parallel streams, and A2A-shaped projections.

## Environment

The Python scripts use the Anthropic provider key from the root `.env`.

LangGraph dev-server examples read `../../.env` through `langgraph.json`. Terminal scripts read the same file through the shared environment loader in `streaming_examples.shared.env`.
