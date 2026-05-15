"""Parallel consumption — messages, values, and raw events concurrently.

Multiple consumers iterate distinct projections on the same run. The
shared mux pumps events to each concurrent reader.

Run:
    cd python/streaming
    uv run python -m parallel.in_process
"""

from __future__ import annotations

import asyncio

from agents.simple_tool_graph import graph


async def main() -> None:
    run = await graph.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Search the web for the population of Paris, then "
                        "calculate 5% of that number."
                    ),
                }
            ]
        },
        version="v3",
    )

    print("--- Parallel consumption ---\n")

    async def count_messages() -> int:
        count = 0
        async for msg in run.messages:
            count += 1
            text = await msg.text
            if text:
                preview = text if len(text) <= 60 else text[:57] + "..."
                print(f"  [msg #{count}] {preview}")
            else:
                print(f"  [msg #{count}] (tool call)")
        return count

    async def count_values() -> int:
        count = 0
        async for _snapshot in run.values:
            count += 1
        return count

    async def count_events() -> int:
        count = 0
        async for _event in run:
            count += 1
        return count

    msg_count, vals_count, evt_count = await asyncio.gather(
        count_messages(), count_values(), count_events()
    )

    final = await run.output()
    final_msgs = (final or {}).get("messages", []) if final else []

    print("\n--- Summary ---")
    print(f"Messages streamed: {msg_count}")
    print(f"State snapshots: {vals_count}")
    print(f"Total protocol events: {evt_count}")
    print(f"Final state messages: {len(final_msgs)}")


if __name__ == "__main__":
    asyncio.run(main())
