"""Parallel consumption remotely — messages, values, and raw events concurrently.

All projections on ``AsyncThreadStream`` share one SSE session. Mirrors
``parallel.in_process`` using the SDK client against a dev server.

Run::

    cd python/streaming
    uv run python -m parallel.remote
"""

from __future__ import annotations

import asyncio

from langgraph_sdk import get_client

from shared.dev_server import start_dev_server


async def main() -> None:
    print("--- Starting dev server ---\n")
    server = start_dev_server(silent=True)
    try:
        async with get_client(url=server["url"]) as client:
            async with client.threads.stream(
                assistant_id="simple-tool-graph",
            ) as thread:
                raw_events = thread.subscribe(
                    ["messages", "tools", "values", "lifecycle"],
                )
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Search the web for the population of Paris, "
                                    "then calculate 5% of that number."
                                ),
                            }
                        ]
                    },
                )

                print("--- Parallel consumption ---\n")

                async def count_messages() -> int:
                    streams = [msg async for msg in thread.messages]
                    count = 0
                    for msg in streams:
                        count += 1
                        text = "".join([t async for t in msg.text])
                        if text:
                            preview = text if len(text) <= 60 else text[:57] + "..."
                            print(f"  [msg #{count}] {preview}")
                        else:
                            print(f"  [msg #{count}] (tool call)")
                    return count

                async def count_values() -> int:
                    count = 0
                    async for _snapshot in thread.values:
                        count += 1
                    return count

                async def count_events() -> int:
                    count = 0
                    async for _event in raw_events:
                        count += 1
                    return count

                msg_count, vals_count, evt_count = await asyncio.gather(
                    count_messages(),
                    count_values(),
                    count_events(),
                )

                final = await thread.output
                final_msgs = (final or {}).get("messages", []) if final else []

                print("\n--- Summary ---")
                print(f"Messages streamed: {msg_count}")
                print(f"State snapshots: {vals_count}")
                print(f"Total protocol events: {evt_count}")
                print(f"Final state messages: {len(final_msgs)}")
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
