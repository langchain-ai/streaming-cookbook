from __future__ import annotations

import asyncio
import time
from typing import Any

from streaming_examples.agents.deep_agent import agent


def _tool_call_preview(tc: Any) -> tuple[str, str]:
    if isinstance(tc, dict):
        name = str(tc.get("name") or "?")
        args = tc.get("args")
        preview = str(args)[:120]
        return name, preview
    name = str(getattr(tc, "name", None) or "?")
    args = getattr(tc, "args", tc)
    preview = str(args)[:120]
    return name, preview


async def _drain_subagent(subagent: Any) -> None:
    """Drain one handle concurrently with siblings (matches TS parallel watchers).

    Subagent projections use the same lazy-subscribe rule as ``run.subgraphs``:
    consumers must attach while the root pump can still fan events into each child
    mux. Sequential sync iteration across handles can miss streams entirely when
    multiple ``task`` tools run in parallel.
    """
    label = subagent.name or subagent.graph_name or "subagent"
    print(f"\n--- Subagent: {label} ---")
    # TS exposes `taskInput` on SubagentRunStream; Python deepagents attach
    # cause + trigger_call_id only — task prompts are not on the handle yet.
    if subagent.cause:
        print(f"Cause: {subagent.cause}")
    if subagent.trigger_call_id:
        print(f"Trigger tool_call_id: {subagent.trigger_call_id}")

    async for message in subagent.messages:
        text = await message.text
        if str(text).strip():
            print(f"  [message] {label}: {str(text)[:100]}")
        aim = await message.output
        for tc in aim.tool_calls:
            name, preview = _tool_call_preview(tc)
            tag = " ← demo judge" if name == "judge_poem_quality" else ""
            print(f"  [tool] {name}({preview}){tag}")


async def _async_main() -> None:
    run = await agent.astream_events(
        {"messages": [{"role": "user", "content": "Write me a haiku about the sea"}]},
        version="v3",
        config={"configurable": {"thread_id": f"subagents-{int(time.time() * 1000)}"}},
    )
    async with run:
        tasks: list[asyncio.Task[None]] = []
        async for subagent in run.subagents:
            tasks.append(asyncio.create_task(_drain_subagent(subagent)))
        if tasks:
            await asyncio.gather(*tasks)

        output = await run.output()
        print("\n--- Output ---")
        msgs = output.get("messages") or []
        last = msgs[-1]
        print(getattr(last, "text", last))


def main() -> None:
    asyncio.run(_async_main())
    print("\nDone.")


if __name__ == "__main__":
    main()
