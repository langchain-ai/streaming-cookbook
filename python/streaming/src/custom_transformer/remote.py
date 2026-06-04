"""Custom StreamTransformer remotely — consume projections from a dev server.

When a graph is compiled with ``stream_transformers()`` (see
``agents/simple_tool_with_metrics.py``), the API runs transformers
server-side. Streaming ``toolActivity`` events arrive on the ``custom``
channel as ``{name, payload}`` dicts.

Run::

    cd python/streaming
    uv run python -m custom_transformer.remote
"""

from __future__ import annotations

import asyncio

from langgraph_sdk import get_client

from shared.dev_server import start_dev_server

DIM = "\x1b[2m"
BOLD = "\x1b[1m"
RESET = "\x1b[0m"
CYAN = "\x1b[36m"
YELLOW = "\x1b[33m"
GREEN = "\x1b[32m"


def _activity_payload(data: dict) -> dict:
    payload = data.get("payload")
    return payload if isinstance(payload, dict) else data


async def _consume_tool_activity(thread) -> None:
    """Read ``toolActivity`` from the shared ``custom`` channel.

    ``thread.extensions['toolActivity']`` can hang on the Python SDK when
    the server wraps channel items as ``method: custom`` with a ``name``
    field; subscribing to ``custom`` matches what the API actually emits.
    """
    async for event in thread.subscribe(["custom"]):
        data = (event.get("params") or {}).get("data")
        if not isinstance(data, dict) or data.get("name") != "toolActivity":
            continue
        activity = _activity_payload(data)
        icon = YELLOW if activity.get("status") == "started" else GREEN
        tool_name = activity.get("name") or "tool"
        print(
            f"{icon}[tool]{RESET} {tool_name} "
            f"{DIM}→ {activity.get('status')}{RESET}"
        )


async def main() -> None:
    print("--- Starting dev server ---\n")
    server = start_dev_server(silent=True)
    try:
        async with get_client(url=server["url"]) as client:
            async with client.threads.stream(
                assistant_id="simple-tool-with-metrics",
            ) as thread:
                tool_task = asyncio.create_task(_consume_tool_activity(thread))

                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "What is the square root of 144? Then search "
                                    "for who discovered it."
                                ),
                            }
                        ],
                    },
                )

                print(f"{BOLD}--- Parallel consumers ---{RESET}\n")

                streams = [msg async for msg in thread.messages]
                for msg_index, msg in enumerate(streams, start=1):
                    text = "".join([t async for t in msg.text])
                    if text:
                        print(f"{CYAN}[message #{msg_index}]{RESET} {text}")
                    else:
                        print(
                            f"{CYAN}[message #{msg_index}]{RESET} "
                            f"{DIM}(tool call){RESET}"
                        )

                await tool_task

                print(f"\n{BOLD}--- Final stats (from stats_transformer) ---{RESET}")
                # Final-value futures are not yet forwarded on the Python API's
                # custom channel in this build; the TS client can await them.
                print("  Tool calls:   (n/a — final-value transformers not on wire)")
                print("  Total tokens: (n/a — final-value transformers not on wire)")

        print("\nDone.")
    finally:
        server["stop"]()


if __name__ == "__main__":
    asyncio.run(main())
