"""Shared custom `StreamTransformer` factories used by the
`custom_transformer/` examples.

Two patterns demonstrated:

1. Final values — futures resolved once when the run ends (e.g. total
   token count). Consumers `await` them after the stream is done.
2. Streaming updates — a `StreamChannel` that yields incremental items
   as events arrive. Consumers iterate them concurrently with the main
   event stream. Use `StreamChannel("name")` to also expose them
   remotely as `custom:<name>`.
"""

from __future__ import annotations

import asyncio
from typing import Any

from langgraph.stream import StreamChannel, StreamTransformer


class StatsTransformer(StreamTransformer):
    """Final values — total tool calls and total token usage."""

    def __init__(self) -> None:
        super().__init__()
        self._tool_calls = 0
        self._tokens = 0
        self._loop = asyncio.get_event_loop()
        self._tool_call_count: asyncio.Future[int] = self._loop.create_future()
        self._total_tokens: asyncio.Future[int] = self._loop.create_future()

    def init(self) -> dict[str, Any]:
        return {
            "toolCallCount": self._tool_call_count,
            "totalTokens": self._total_tokens,
        }

    def process(self, event: dict[str, Any]) -> bool:
        method = event.get("method")
        data = event.get("params", {}).get("data") or {}
        # `messages` events sometimes arrive wrapped as (payload, meta).
        if method == "messages" and isinstance(data, tuple) and len(data) == 2:
            data = data[0] if isinstance(data[0], dict) else {}

        if method == "tools" and isinstance(data, dict):
            if data.get("event") == "tool-started":
                self._tool_calls += 1

        if method == "messages" and isinstance(data, dict):
            if data.get("event") == "message-finish":
                usage = data.get("usage") or {}
                if isinstance(usage, dict):
                    self._tokens += int(usage.get("input_tokens") or 0)
                    self._tokens += int(usage.get("output_tokens") or 0)
        return True

    def finalize(self) -> None:
        if not self._tool_call_count.done():
            self._tool_call_count.set_result(self._tool_calls)
        if not self._total_tokens.done():
            self._total_tokens.set_result(self._tokens)

    def fail(self, err: BaseException) -> None:  # noqa: ARG002
        self.finalize()


class ToolActivityTransformer(StreamTransformer):
    """Streaming updates — yields tool lifecycle events as they happen.

    `StreamChannel("toolActivity")` is both the in-process async buffer
    and the auto-forwarding mechanism for remote SDK clients (visible
    as `custom:toolActivity`). The mux auto-closes the channel when
    the run ends.
    """

    def __init__(self) -> None:
        super().__init__()
        self._channel: StreamChannel[dict[str, str]] = StreamChannel("toolActivity")
        # maps tool_call_id -> tool_name
        self._tool_names: dict[str, str] = {}

    def init(self) -> dict[str, Any]:
        return {"toolActivity": self._channel}

    def process(self, event: dict[str, Any]) -> bool:
        if event.get("method") != "tools":
            return True
        data = event.get("params", {}).get("data") or {}
        if not isinstance(data, dict):
            return True

        ev = data.get("event")
        tcid = data.get("tool_call_id") or ""
        if ev == "tool-started":
            name = data.get("tool_name") or "tool"
            self._channel.push({"name": name, "status": "started"})
            if tcid:
                self._tool_names[tcid] = name
        elif ev == "tool-finished":
            name = self._tool_names.get(tcid, tcid)
            self._channel.push({"name": name, "status": "finished"})
        elif ev == "tool-error":
            name = self._tool_names.get(tcid, tcid)
            self._channel.push({"name": name, "status": "error"})
        return True


def stats_transformer() -> StatsTransformer:
    """Factory mirroring `statsTransformer` from the JS sibling."""
    return StatsTransformer()


def tool_activity_transformer() -> ToolActivityTransformer:
    """Factory mirroring `toolActivityTransformer` from the JS sibling."""
    return ToolActivityTransformer()
