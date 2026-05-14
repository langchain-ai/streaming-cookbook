"""Human-in-the-loop (in-process) — interrupt, inspect, resume.

The agent calls `send_release_update_email`; `HumanInTheLoopMiddleware`
pauses the run and emits an interrupt. We inspect the pending action,
approve it, and resume via `Command(resume={"decisions": [...]})`.

Run:
    cd python/streaming
    uv run python -m human_in_the_loop.in_process
"""

from __future__ import annotations

import asyncio
import json
import time

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agents.hitl_agent import agent


async def main() -> None:
    thread_id = f"hitl-example-{int(time.time())}"
    # `create_agent` doesn't accept a checkpointer kwarg directly in
    # this langchain version; bind one via `with_config` on the
    # compiled agent or use the checkpointer slot the framework
    # provides. We attach via runtime config below.
    checkpointer = InMemorySaver()
    compiled = agent.with_config({"checkpointer": checkpointer})  # noqa: F841
    config = {"configurable": {"thread_id": thread_id}}

    # --- Turn 1: run until interrupt ----------------------------------
    print("=== Turn 1: Run until interrupt ===\n")

    run1 = await agent.astream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Send a release update email about the new streaming API",
                }
            ]
        },
        config=config,
        version="v3",
    )

    async for msg in run1.messages:
        text = await msg.text
        if text:
            print(f"  [assistant] {text}")

    await run1.output()

    interrupted = await run1.interrupted()
    interrupts = await run1.interrupts() or []
    print(f"\n  interrupted: {interrupted}")
    print(f"  interrupts:  {json.dumps(interrupts, default=str, indent=2)}")

    if not interrupted:
        print("\n  (graph completed without interrupting — unexpected)")
        return

    # Build the approval payload the Python middleware expects.
    decisions: list[dict] = []
    for interrupt in interrupts:
        payload = interrupt.get("value") if isinstance(interrupt, dict) else None
        if not isinstance(payload, dict):
            continue
        # Python middleware uses snake_case keys.
        for req in payload.get("action_requests") or []:
            decisions.append({"type": "approve"})
        # Some envelopes nest the payload deeper.
        for req in (
            payload.get("payload", {}).get("action_requests") or []
            if isinstance(payload.get("payload"), dict)
            else []
        ):
            decisions.append({"type": "approve"})

    print(f"\n  User decision: APPROVED {len(decisions)} pending action(s)")

    # --- Turn 2: resume with decision ---------------------------------
    print("\n=== Turn 2: Resume after approval ===\n")

    run2 = await agent.astream_events(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v3",
    )

    async for msg in run2.messages:
        text = await msg.text
        if text:
            print(f"  [assistant] {text}")

    final_state = await run2.output()
    final_msgs = (final_state or {}).get("messages", []) if final_state else []
    print(f"\n  interrupted: {await run2.interrupted()}")
    print(f"  final messages: {len(final_msgs)}")
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
