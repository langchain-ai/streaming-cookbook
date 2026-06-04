"""Streaming messages remotely — consume text tokens from a LangGraph dev server.

Mirrors ``messages.in_process`` using ``thread.messages``. Each yielded
chat-model stream exposes ``.text`` and ``.reasoning`` as async iterators
and ``.output`` for the finalized message.

Run::

    cd python/streaming
    uv run python -m messages.remote
"""

from __future__ import annotations

import asyncio
import sys

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
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Search the web for the current population of "
                                    "Tokyo, then calculate what 1% of that number is."
                                ),
                            }
                        ]
                    },
                )

                print("--- Streaming messages (remote) ---")
                # Drain the outer iterator first — iterating inner `.text` /
                # `.reasoning` while the outer `thread.messages` loop is
                # suspended deadlocks (same constraint as the SDK integration
                # tests and the TypeScript cookbook's concurrent void tasks).
                streams = [message async for message in thread.messages]
                msg_count = 0
                for message in streams:
                    msg_count += 1
                    sys.stdout.write("\n  reasoning: ")
                    async for reasoning in message.reasoning:
                        sys.stdout.write(reasoning)
                        sys.stdout.flush()

                    sys.stdout.write("\n  text: ")
                    async for token in message.text:
                        sys.stdout.write(token)
                        sys.stdout.flush()

                    output = await message.output
                    blocks = getattr(output, "content", None) or []
                    block_len = len(blocks) if isinstance(blocks, list) else 1
                    sys.stdout.write(f"\n  content blocks: {block_len}")

                    usage = getattr(output, "usage_metadata", None) or {}
                    if usage:
                        sys.stdout.write(
                            f"\n  tokens: {usage.get('input_tokens') or 0} in, "
                            f"{usage.get('output_tokens') or 0} out"
                        )
                    sys.stdout.write("\n\n")

                print("--- Final output ---")
                state = await thread.output
                messages = (state or {}).get("messages", [])
                print(messages[-1] if messages else None)
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
