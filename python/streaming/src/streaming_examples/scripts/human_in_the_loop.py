from __future__ import annotations

import json
import time
from typing import Any

from langgraph.types import Command

from streaming_examples.agents.hitl_agent import agent


def _interrupt_payload(interrupt: Any) -> dict[str, Any]:
    if hasattr(interrupt, "payload"):
        return interrupt.payload
    if hasattr(interrupt, "value"):
        return interrupt.value
    return {}


def main() -> None:
    thread_id = f"hitl-example-{int(time.time() * 1000)}"
    config = {"configurable": {"thread_id": thread_id}}

    print("=== Turn 1: Run until interrupt ===\n")

    run1 = agent.stream_events(
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

    for message in run1.messages:
        text = str(message.text)
        if text:
            print(f"  [assistant] {text}")

    print(f"\n  interrupted: {run1.interrupted}")
    print(f"  interrupts:  {json.dumps(run1.interrupts, default=str, indent=2)}")

    if not run1.interrupted:
        print("\n  (graph completed without interrupting - unexpected)")
        raise SystemExit(1)

    decisions = []
    for interrupt in run1.interrupts:
        payload = _interrupt_payload(interrupt)
        for request in payload.get("action_requests", payload.get("actionRequests", [])):
            decisions.append({"action": request.get("name"), "type": "approve"})

    print(f"\n  User decision: APPROVED {len(decisions)} pending action(s)")

    print("\n=== Turn 2: Resume after approval ===\n")

    run2 = agent.stream_events(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v3",
    )

    for message in run2.messages:
        text = str(message.text)
        if text:
            print(f"  [assistant] {text}")

    final_state = run2.output
    print(f"\n  interrupted: {run2.interrupted}")
    print(f"  final messages: {len(final_state.get('messages') or [])}")
    print("\nDone.")


if __name__ == "__main__":
    main()
