"""A2A streaming over a LangGraph dev server using the v3 protocol.

The research pipeline is compiled with ``A2ATransformer``, which emits
A2A-shaped dicts on the auto-forwarded ``custom:a2a`` channel. Subscribe
to that channel and print each payload.

Run::

    cd python/streaming
    uv run python -m a2a.remote
"""

from __future__ import annotations

import asyncio
import json

from langgraph_sdk import get_client

from shared.dev_server import start_dev_server


async def main() -> None:
    print("--- Starting dev server ---\n")
    server = start_dev_server()
    try:
        async with get_client(url=server["url"]) as client:
            async with client.threads.stream(assistant_id="a2a-research") as thread:
                events = thread.subscribe(["custom:a2a"])
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Research WebAssembly adoption and identify "
                                    "key risks."
                                ),
                            }
                        ],
                    },
                )

                print("--- Streaming A2A events (remote) ---\n")
                async for event in events:
                    data = (event.get("params") or {}).get("data")
                    print(json.dumps(data, default=str))

        print("--- Done ---")
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
