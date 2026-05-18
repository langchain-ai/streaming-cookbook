"""Basic astream_events(version="v3") usage — iterate protocol events and await final output.

Run:
    cd python/streaming
    uv run python -m basic.in_process
"""

from __future__ import annotations

import asyncio
import json

from langgraph.stream import (
    CheckpointsTransformer,
    TasksTransformer,
    UpdatesTransformer,
)

from agents.simple_tool_graph import graph

# Default factories baked into v3: Values, Messages, Lifecycle,
# Subgraph. The optional ones below add `checkpoints` / `tasks` /
# `updates` channels. Note: today the langgraph-py v3 emit path
# surfaces fewer channels than the JS sibling (no `lifecycle` /
# `checkpoints` / `tasks` lines below) — see the JS basic example for
# the all-channels reference. Tracked upstream.
ALL_CHANNEL_TRANSFORMERS = [
    CheckpointsTransformer,
    TasksTransformer,
    UpdatesTransformer,
]


async def main() -> None:
    input_state = {"messages": [{"role": "user", "content": "What is 42 * 17?"}]}

    print("--- Streaming All protocol events (in-process) ---\n")

    final_state: dict | None = None
    run = await graph.astream_events(
        input_state,
        version="v3",
        transformers=ALL_CHANNEL_TRANSFORMERS,
    )
    async for event in run:
        ns = event["params"]["namespace"]
        prefix = f"[{'/'.join(ns)}] " if ns else ""
        method = event["method"]
        data = event["params"]["data"]
        print(f"{prefix}{method}", json.dumps(data, default=str)[:120])

    # Re-run to capture the final state — v3 events don't return it inline.
    final_state = await graph.ainvoke(input_state)

    last = (final_state or {}).get("messages", [])[-1] if final_state else None
    print("\n--- Final answer ---")
    content = getattr(last, "content", None) if last else None
    if isinstance(content, str):
        print(content)
    else:
        print(json.dumps(content, default=str) if content is not None else "(no answer)")


if __name__ == "__main__":
    asyncio.run(main())
