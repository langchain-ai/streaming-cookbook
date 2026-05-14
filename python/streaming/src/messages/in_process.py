"""Streaming messages — consume text tokens as they arrive.

Iterates the `messages` projection on the in-process run. Each yielded
chat-model stream has its own reasoning + text iterators.

Run:
    cd python/streaming
    uv run python -m messages.in_process
"""

from __future__ import annotations

import asyncio
import sys

from agents.simple_tool_graph import graph


async def main() -> None:
    run = await graph.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Search the web for the current population of Tokyo, "
                        "then calculate what 1% of that number is."
                    ),
                }
            ]
        },
        version="v3",
    )

    print("--- Streaming messages (in-process) ---")
    msg_count = 0
    async for message in run.messages:
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
        sys.stdout.write(
            f"\n  content blocks: {len(blocks) if isinstance(blocks, list) else 1}"
        )

        usage = await message.usage
        if usage:
            sys.stdout.write(
                f"\n  tokens: {usage.get('input_tokens') or 0} in, "
                f"{usage.get('output_tokens') or 0} out"
            )
        sys.stdout.write("\n\n")

    print("--- Final output ---")
    state = await run.output
    last = (state or {}).get("messages", [])[-1] if state else None
    print(last)


if __name__ == "__main__":
    asyncio.run(main())
