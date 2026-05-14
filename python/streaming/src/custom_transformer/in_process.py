"""Custom StreamTransformer — extend astream_events with domain projections.

Two transformer patterns:

  1. `stats_transformer` — final values (total tool calls, total tokens),
     resolved once at the end of the run.
  2. `tool_activity_transformer` — streaming updates yielded concurrently
     with the main event stream.

Compiled into the graph via `transformers=[...]` at call time; the
remote variant uses `agents/simple_tool_with_metrics.py` which exposes
the same transformers via a module-level `stream_transformers()`
factory that langgraph-api auto-registers.

Run:
    cd python/streaming
    uv run python -m custom_transformer.in_process
"""

from __future__ import annotations

import asyncio

from agents.simple_tool_graph import graph
from shared.custom_transformers import StatsTransformer, ToolActivityTransformer

DIM = "\x1b[2m"
BOLD = "\x1b[1m"
RESET = "\x1b[0m"
CYAN = "\x1b[36m"
YELLOW = "\x1b[33m"
GREEN = "\x1b[32m"


async def main() -> None:
    run = await graph.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "What is the square root of 144? Then search for who "
                        "discovered it."
                    ),
                }
            ]
        },
        version="v3",
        transformers=[StatsTransformer, ToolActivityTransformer],
    )

    print(f"{BOLD}--- Parallel consumers ---{RESET}\n")

    async def consume_messages() -> None:
        msg_index = 0
        async for msg in run.messages:
            msg_index += 1
            text = await msg.text
            if text:
                print(f"{CYAN}[message #{msg_index}]{RESET} {text}")
            else:
                print(f"{CYAN}[message #{msg_index}]{RESET} {DIM}(tool call){RESET}")

    async def consume_tool_activity() -> None:
        async for activity in run.extensions["toolActivity"]:
            icon = YELLOW if activity["status"] == "started" else GREEN
            print(
                f"{icon}[tool]{RESET} {activity['name']} "
                f"{DIM}→ {activity['status']}{RESET}"
            )

    await asyncio.gather(consume_messages(), consume_tool_activity())

    print(f"\n{BOLD}--- Final stats (from stats_transformer) ---{RESET}")
    tool_calls = await run.extensions["toolCallCount"]
    total_tokens = await run.extensions["totalTokens"]
    print(f"  Tool calls:   {tool_calls}")
    print(f"  Total tokens: {total_tokens}")


if __name__ == "__main__":
    asyncio.run(main())
