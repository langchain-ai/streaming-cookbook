"""Track subagent lifecycle remotely without subscribing to heavy channels.

``thread.subagents`` yields scoped handles whose ``status`` field moves to a
terminal state when the nested task completes. Mirrors the in-process
example without needing a dedicated ``output`` awaitable on SDK handles.

Run::

    cd python/streaming
    uv run python -m subagent_status.remote
"""

from __future__ import annotations

import asyncio
import time

from langgraph_sdk import get_client

from shared.dev_server import start_dev_server


async def _wait_terminal(sub) -> str:
    """Poll until the handle leaves ``started`` (SDK handles lack ``output``)."""
    while sub.status == "started":
        await asyncio.sleep(0.05)
    return sub.status


async def main() -> None:
    print("--- Starting dev server ---\n")
    server = start_dev_server(silent=True)
    try:
        async with get_client(url=server["url"]) as client:
            async with client.threads.stream(assistant_id="deep-agent") as thread:
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Write four poems: a haiku about mountains, "
                                    "a limerick about cats, a quatrain about rain, "
                                    "and a long poem about space"
                                ),
                            }
                        ],
                    },
                )

                graph_start = time.monotonic()

                def elapsed() -> str:
                    return f"{time.monotonic() - graph_start:.2f}s"

                started = 0
                completed = 0
                failed = 0

                def status_line() -> None:
                    total = started + completed + failed
                    print(
                        f"  [{total} subagent(s)] started: {started}, "
                        f"completed: {completed}, failed: {failed}"
                    )

                watchers: list[asyncio.Task[None]] = []

                async def watch(sub) -> None:
                    nonlocal started, completed, failed
                    name = sub.graph_name or "subagent"
                    call_id = sub.trigger_call_id or "?"
                    terminal = await _wait_terminal(sub)
                    started -= 1
                    if terminal == "completed":
                        completed += 1
                        print(f"[{elapsed()}] {name}: completed ({call_id})")
                    else:
                        failed += 1
                        print(f"[{elapsed()}] {name}: {terminal} ({call_id})")
                    status_line()

                handles = [sub async for sub in thread.subagents]
                for sub in handles:
                    started += 1
                    name = sub.graph_name or "subagent"
                    call_id = sub.trigger_call_id or "?"
                    print(f"[{elapsed()}] {name}: started ({call_id})")
                    status_line()
                    watchers.append(asyncio.create_task(watch(sub)))

                await asyncio.gather(*watchers)

                print("\n=== Final ===")
                print(
                    f"  [{elapsed()}] started: {started}, completed: {completed}, "
                    f"failed: {failed}"
                )

        print("\nDone.")
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
