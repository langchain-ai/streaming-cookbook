"""Human-in-the-loop (remote) — detect an interrupt and resume via ``run.respond``.

Uses the same ``human-in-the-loop`` assistant as the in-process variant. A
``thread.values`` subscription survives across the interrupt and resumed run.

Run::

    cd python/streaming
    uv run python -m human_in_the_loop.remote
"""

from __future__ import annotations

import asyncio
import json

from langgraph_sdk import get_client

from shared.dev_server import start_dev_server


async def main() -> None:
    print("--- Starting dev server ---\n")
    server = start_dev_server(silent=True)
    try:
        async with get_client(url=server["url"]) as client:
            async with client.threads.stream(
                assistant_id="human-in-the-loop",
            ) as thread:
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Send a release update email about the new "
                                    "streaming API"
                                ),
                            }
                        ],
                    },
                )

                async for snapshot in thread.values:
                    msg_count = len((snapshot or {}).get("messages", []))
                    print(f"  State snapshot: {msg_count} message(s)")
                    if thread.interrupted:
                        break

                if thread.interrupted:
                    print(
                        f"\nRun interrupted with {len(thread.interrupts)} "
                        "interrupt(s):\n"
                    )
                    for interrupt in thread.interrupts:
                        print(f"  Interrupt ID: {interrupt['interrupt_id']}")
                        ns = interrupt.get("namespace") or []
                        print(f"  Namespace:    {'/'.join(ns) or '(root)'}")
                        print(
                            "  Payload:      "
                            f"{json.dumps(interrupt.get('value'), indent=2, default=str)}"
                        )

                    print("\nApproving all pending actions...")
                    for interrupt in thread.interrupts:
                        payload = interrupt.get("value") or {}
                        if not isinstance(payload, dict):
                            payload = {}
                        decisions = [
                            {
                                "type": "approve",
                                **(
                                    {"action": req["name"]}
                                    if isinstance(req, dict) and req.get("name")
                                    else {}
                                ),
                            }
                            for req in payload.get("action_requests") or []
                        ]
                        # Server may surface an interrupt before the payload dict
                        # is populated on `value`; still send one approval.
                        if not decisions:
                            decisions = [{"type": "approve"}]
                        await thread.run.respond(
                            {"decisions": decisions},
                            interrupt_id=interrupt["interrupt_id"],
                        )

                    print("Resumed. Waiting for final state...\n")
                    async for snapshot in thread.values:
                        msg_count = len((snapshot or {}).get("messages", []))
                        print(f"  State snapshot: {msg_count} message(s)")

                    final = await thread.output
                    messages = (final or {}).get("messages", [])
                    print(f"\nFinal state: {len(messages)} messages")
                else:
                    print("\nRun completed without interrupts.")
                    final = await thread.output
                    print(f"Final state: {json.dumps(final, default=str)[:200]}")

        print("Done.")
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
