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


def _unwrap_messages(event: dict[str, Any]) -> Any:
    """Return the payload dict of a `messages` v3 protocol event.

    The graph emits each event as `(payload, metadata)`; the payload
    carries the `event` discriminator (`message-start`,
    `content-block-start`, etc.).
    """
    data = event.get("params", {}).get("data")
    if isinstance(data, tuple) and len(data) == 2:
        return data[0]
    return data


class StatsTransformer(StreamTransformer):
    """Final values — total tool calls and total token usage."""

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self._tool_calls = 0
        self._tokens = 0
        self._tool_call_count: asyncio.Future[int] | None = None
        self._total_tokens: asyncio.Future[int] | None = None

    def init(self) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        self._tool_call_count = loop.create_future()
        self._total_tokens = loop.create_future()
        return {
            "toolCallCount": self._tool_call_count,
            "totalTokens": self._total_tokens,
        }

    def process(self, event: dict[str, Any]) -> bool:
        if event.get("method") != "messages":
            return True
        payload = _unwrap_messages(event)
        if not isinstance(payload, dict):
            return True

        evt = payload.get("event")
        if evt == "content-block-start":
            content = payload.get("content") or {}
            if isinstance(content, dict) and content.get("type") == "tool_call_chunk":
                self._tool_calls += 1
        elif evt == "message-finish":
            usage = payload.get("usage") or {}
            if isinstance(usage, dict):
                self._tokens += int(usage.get("input_tokens") or 0)
                self._tokens += int(usage.get("output_tokens") or 0)
        return True

    def finalize(self) -> None:
        if self._tool_call_count is not None and not self._tool_call_count.done():
            self._tool_call_count.set_result(self._tool_calls)
        if self._total_tokens is not None and not self._total_tokens.done():
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

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self._channel: StreamChannel[dict[str, str]] = StreamChannel("toolActivity")
        # maps tool_call_id -> tool_name
        self._tool_names: dict[str, str] = {}

    def init(self) -> dict[str, Any]:
        return {"toolActivity": self._channel}

    def process(self, event: dict[str, Any]) -> bool:
        if event.get("method") != "messages":
            return True
        payload = _unwrap_messages(event)
        if not isinstance(payload, dict):
            return True

        evt = payload.get("event")
        content = payload.get("content") or {}
        if not isinstance(content, dict):
            return True

        # The model streams a tool_call_chunk while it's assembling the
        # call, then emits a finalized tool_call on block-finish. Python
        # langgraph doesn't surface a separate tool-execution event in
        # the v3 protocol, so the chat-model block lifecycle is the best
        # proxy for "tool started/finished" in a demo.
        if evt == "content-block-start" and content.get("type") == "tool_call_chunk":
            name = content.get("name") or "tool"
            tcid = content.get("id") or ""
            self._channel.push({"name": name, "status": "started"})
            if tcid:
                self._tool_names[tcid] = name
        elif evt == "content-block-finish" and content.get("type") == "tool_call":
            tcid = content.get("id") or ""
            name = self._tool_names.get(tcid) or content.get("name") or "tool"
            self._channel.push({"name": name, "status": "finished"})
        return True


def stats_transformer() -> StatsTransformer:
    """Factory mirroring `statsTransformer` from the JS sibling."""
    return StatsTransformer()


def tool_activity_transformer() -> ToolActivityTransformer:
    """Factory mirroring `toolActivityTransformer` from the JS sibling."""
    return ToolActivityTransformer()
