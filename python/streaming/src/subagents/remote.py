"""Stream subagent messages and tool calls from a deep agent on a dev server.

Demonstrates: ``thread.subagents`` → ``sub.messages`` + ``sub.tool_calls``.
The SDK exposes scoped handles backed by the ``tools`` + ``tasks`` channels.

Run::

    cd python/streaming
    uv run python -m subagents.remote
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
            async with client.threads.stream(assistant_id="deep-agent") as thread:
                await thread.run.start(
                    input={
                        "messages": [
                            {
                                "role": "user",
                                "content": "Write me a haiku about the sea",
                            }
                        ],
                    },
                )

                watchers: list[asyncio.Task[None]] = []

                # Match the TS remote example: start consumers inside the
                # ``thread.subagents`` loop so each handle's projections are
                # subscribed before the next handle is yielded.
                async for sub in thread.subagents:
                    name = sub.graph_name or "subagent"
                    call_id = sub.trigger_call_id or "?"
                    print(f"\n--- Subagent: {name} (call: {call_id}) ---")
                    print(f"Namespace: {'/'.join(sub.namespace)}")

                    async def consume(
                        sub=sub,
                        name=name,
                    ) -> None:
                        async def messages_task() -> None:
                            async for msg in sub.messages:
                                text = "".join([t async for t in msg.text])
                                if text:
                                    print(f"  [message] {name}: {text[:100]}")

                        async def tools_task() -> None:
                            async for tc in sub.tool_calls:
                                print(
                                    f"  [tool] {tc.name}("
                                    f"{json.dumps(tc.input, default=str)[:80]})"
                                )
                                result = await tc.output
                                print(
                                    f"  [tool] {tc.name} → "
                                    f"{json.dumps(result, default=str)[:80]}"
                                )

                        await asyncio.gather(messages_task(), tools_task())

                    watchers.append(asyncio.create_task(consume()))

                if watchers:
                    await asyncio.gather(*watchers)

                output = await thread.output
                messages = (output or {}).get("messages", [])
                last = messages[-1] if messages else None
                print("\n--- Output ---")
                if last is None:
                    print("(no output)")
                else:
                    content = (
                        last.get("content")
                        if isinstance(last, dict)
                        else getattr(last, "content", last)
                    )
                    print(content)
    finally:
        server["stop"]()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
