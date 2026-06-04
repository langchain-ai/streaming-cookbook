"""Basic remote streaming — iterate protocol events from a LangGraph dev server.

Spawns a dev server in-process, opens a ``threads.stream`` session against
``simple-tool-graph``, subscribes to core channels, and prints events until
the run ends.

Run::

    cd python/streaming
    uv run python -m basic.remote
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
            async with client.threads.stream(
                assistant_id="simple-tool-graph",
            ) as thread:
                events = thread.subscribe(
                    ["messages", "tools", "values", "lifecycle"],
                )
                await thread.run.start(
                    input={
                        "messages": [{"role": "user", "content": "What is 42 * 17?"}]
                    },
                )

                print("--- All protocol events ---\n")
                async for event in events:
                    params = event.get("params") or {}
                    ns = params.get("namespace") or []
                    prefix = f"[{'/'.join(ns)}] " if ns else ""
                    data = params.get("data")
                    print(
                        f"{prefix}{event.get('method')}",
                        json.dumps(data, default=str)[:120],
                    )

                final_state = await thread.output
                messages = (final_state or {}).get("messages", [])
                last = messages[-1] if messages else None
                print("\n--- Final answer ---")
                if last is None:
                    print("(no answer)")
                else:
                    content = (
                        last.get("content")
                        if isinstance(last, dict)
                        else getattr(last, "content", last)
                    )
                    if isinstance(content, str):
                        print(content)
                    else:
                        print(json.dumps(content, default=str))
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
