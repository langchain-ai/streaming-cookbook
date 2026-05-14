"""Stream subagent messages and tool calls in-process.

`createDeepAgent` returns a graph whose `subagents` projection is
populated by a native `SubagentTransformer` — only real `task`
dispatches show up here (subgraph-internal model calls are excluded).
Each subagent handle exposes scoped `messages` + `toolCalls` + an
`output` promise.

Run:
    cd python/streaming
    uv run python -m subagents.in_process
"""

from __future__ import annotations

import asyncio
import json
import time

from agents.deep_agent import agent


async def main() -> None:
    run = await agent.astream_events(
        {"messages": [{"role": "user", "content": "Write me a haiku about the sea"}]},
        config={"configurable": {"thread_id": f"subagents-{int(time.time())}"}},
        version="v3",
    )

    watchers: list[asyncio.Task[None]] = []

    async for sub in run.subagents:
        name = getattr(sub, "name", None) or "subagent"
        task_input = getattr(sub, "task_input", None) or getattr(sub, "taskInput", None)
        print(f"\n--- Subagent: {name} ---")
        if task_input:
            print(f"Task: {task_input}")

        async def consume(sub=sub, name=name) -> None:
            async def messages_task() -> None:
                async for msg in sub.messages:
                    text = await msg.text
                    if text:
                        print(f"  [message] {name}: {text[:100]}")

            async def tools_task() -> None:
                async for tc in sub.tool_calls:
                    args = getattr(tc, "input", None) or getattr(tc, "args", None)
                    print(
                        f"  [tool] {tc.name}("
                        f"{json.dumps(args, default=str)[:80]})"
                    )
                    status = await tc.status
                    print(f"  [tool] {tc.name} → {status}")

            await asyncio.gather(messages_task(), tools_task())

        watchers.append(asyncio.create_task(consume()))

    await asyncio.gather(*watchers)

    output = await run.output
    last = (output or {}).get("messages", [])[-1] if output else None
    print("\n--- Output ---")
    print(getattr(last, "content", last) if last else "(no output)")
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
