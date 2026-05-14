"""Subgraph observation — discover subgraphs and stream their messages.

Iterates `run.subgraphs` on the in-process run. Each discovered
subgraph has its own message stream that yields scoped chat-model
deltas independent of the parent's stream.

Run:
    cd python/streaming
    uv run python -m subgraphs.in_process
"""

from __future__ import annotations

import asyncio
import json
import sys

from agents.research_pipeline import graph


async def main() -> None:
    run = await graph.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Research TypeScript 5.8 features and identify risks.",
                }
            ]
        },
        version="v3",
    )

    workers: list[asyncio.Task[None]] = []

    async for sub in run.subgraphs:
        path = "/".join(getattr(sub, "path", ()) or [])
        name = getattr(sub, "name", None) or getattr(sub, "graph_name", None) or "subgraph"
        print(f"\n--- Subgraph: {name} [{path}] ---")

        async def consume(sub=sub, name=name) -> None:
            async for msg in sub.messages:
                node = getattr(msg, "node", None)
                label = f"{name}/{node}" if node else name
                sys.stdout.write(f"\n  [{label}] ")

                async for delta in msg.text:
                    sys.stdout.write(delta)
                    sys.stdout.flush()

                usage = await msg.usage
                if usage and (usage.get("input_tokens") or usage.get("output_tokens")):
                    sys.stdout.write(
                        f"\n  (tokens: {usage.get('input_tokens') or 0} in / "
                        f"{usage.get('output_tokens') or 0} out)"
                    )
                sys.stdout.write("\n")

        workers.append(asyncio.create_task(consume()))

        output = await sub.output
        summary = json.dumps(output, default=str)[:120] if output else "null"
        print(f"\n--- Subgraph {name} completed: {summary} ---")

    await asyncio.gather(*workers)
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
