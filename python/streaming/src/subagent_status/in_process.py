"""Track subagent lifecycle without subscribing to heavy channels.

Just iterates `run.subagents` and awaits each handle's `output`
future — no message or tool-call subscription needed for a running
tally of started/completed/failed counts.

Run:
    cd python/streaming
    uv run python -m subagent_status.in_process
"""

from __future__ import annotations

import asyncio
import time

from agents.deep_agent import agent


async def main() -> None:
    run = await agent.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Write four poems: a haiku about mountains, a "
                        "limerick about cats, a quatrain about rain, and a "
                        "long poem about space"
                    ),
                }
            ]
        },
        config={"configurable": {"thread_id": f"subagent-status-{int(time.time())}"}},
        version="v3",
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
        try:
            await sub.output
            started -= 1
            completed += 1
            print(f"[{elapsed()}] {sub.name}: completed")
        except Exception:
            started -= 1
            failed += 1
            print(f"[{elapsed()}] {sub.name}: failed")
        status_line()

    async for sub in run.subagents:
        started += 1
        print(f"[{elapsed()}] {sub.name}: started")
        status_line()
        watchers.append(asyncio.create_task(watch(sub)))

    await asyncio.gather(*watchers)

    print("\n=== Final ===")
    print(
        f"  [{elapsed()}] started: {started}, completed: {completed}, "
        f"failed: {failed}"
    )
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
