from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterable, Iterable
from typing import Any


def print_event(event: dict[str, Any]) -> None:
    params = event.get("params", {})
    namespace = params.get("namespace") or []
    prefix = f"[{'/'.join(namespace)}] " if namespace else ""
    data = json.dumps(params.get("data"), default=str)[:120]
    print(f"{prefix}{event.get('method')} {data}")


def last_message_content(state: Any) -> Any:
    messages = (state or {}).get("messages") if isinstance(state, dict) else None
    if not messages:
        return None
    last = messages[-1]
    if hasattr(last, "content"):
        return last.content
    if isinstance(last, dict):
        return last.get("content")
    return last


def message_text(message: Any) -> str:
    text = getattr(message, "text", None)
    if text is not None:
        return str(text)
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    return str(content)


def stream_final_value(stream: Iterable[Any]) -> Any:
    value = None
    for value in stream:
        pass
    return value


async def collect_async(stream: AsyncIterable[Any]) -> list[Any]:
    items = []
    async for item in stream:
        items.append(item)
    return items


def run_async(coro: Any) -> None:
    asyncio.run(coro)
