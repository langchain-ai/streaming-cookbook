"""Subgraph observation remotely — discover subgraphs and stream their messages.

Mirrors ``subgraphs.in_process`` using ``thread.subgraphs``. For each
discovered child, text deltas are rendered from ``sub.messages``.

Run::

    cd python/streaming
    uv run python -m subgraphs.remote
"""

from __future__ import annotations

import asyncio
import json
import sys

from langgraph_sdk import get_client

from shared.dev_server import start_dev_server


async def main() -> None:
    print("--- Starting dev server ---\n")
    server = start_dev_server(silent=True)
    try:
        async with get_client(url=server["url"]) as client:
            async with client.threads.stream(
                assistant_id="research-pipeline",
            ) as thread:
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Research TypeScript 5.8 features and "
                                    "identify risks."
                                ),
                            }
                        ]
                    },
                )

                workers: list[asyncio.Task[None]] = []
                handles = [sub async for sub in thread.subgraphs]

                for sub in handles:
                    name = sub.graph_name or "subgraph"
                    path = "/".join(sub.namespace)
                    print(f"\n--- Subgraph: {name} [{path}] ---")

                    async def consume(sub=sub, name=name) -> None:
                        async for msg in sub.messages:
                            node = getattr(msg, "node", None)
                            label = f"{name}/{node}" if node else name
                            sys.stdout.write(f"\n  [{label}] ")

                            async for delta in msg.text:
                                sys.stdout.write(delta)
                                sys.stdout.flush()

                            final_msg = await msg.output
                            usage = getattr(final_msg, "usage_metadata", None) or {}
                            if usage and (
                                usage.get("input_tokens") or usage.get("output_tokens")
                            ):
                                sys.stdout.write(
                                    f"\n  (tokens: {usage.get('input_tokens') or 0} "
                                    f"in / {usage.get('output_tokens') or 0} out)"
                                )
                            sys.stdout.write("\n")

                    workers.append(asyncio.create_task(consume()))

                    summary = json.dumps(sub.status, default=str)
                    if sub.error:
                        summary = f"{sub.status} ({sub.error})"
                    print(f"\n--- Subgraph {name} terminal: {summary} ---")

                await asyncio.gather(*workers)
    finally:
        server["stop"]()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
