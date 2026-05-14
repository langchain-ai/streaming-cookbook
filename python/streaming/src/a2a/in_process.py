"""A2A streaming in-process — iterate the `a2a` extension channel.

The research pipeline in `agents/a2a_research.py` is compiled with the
`A2ATransformer` which exposes a `StreamChannel("a2a")`. In-process,
that channel is available as `run.extensions["a2a"]` and yields
A2A protocol-compliant `status-update` and `artifact-update` dicts.

Run:
    cd python/streaming
    uv run python -m a2a.in_process
"""

from __future__ import annotations

import asyncio
import json

from agents.a2a_research import graph


async def main() -> None:
    run = await graph.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Research WebAssembly adoption and identify key risks.",
                }
            ]
        },
        version="v3",
    )

    print("--- Streaming A2A events (in-process) ---\n")
    async for event in run.extensions["a2a"]:
        print(json.dumps(event))

    await run.output()
    print("\n--- Done ---")


if __name__ == "__main__":
    asyncio.run(main())
