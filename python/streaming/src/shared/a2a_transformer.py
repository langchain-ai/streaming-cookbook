"""A2A stream transformer — emits A2A protocol-compliant streaming events.

Mirrors the JS `createA2ATransformer` (which uses `@a2a-js/sdk`
`TaskStatusUpdateEvent` / `TaskArtifactUpdateEvent` types) but emits
plain dicts in the same shape since the Python A2A SDK isn't a
dependency of this cookbook.

Events are surfaced via a `StreamChannel("a2a")`:
- In-process consumers iterate `run.extensions["a2a"]` directly.
- Remote SDK clients subscribe via the auto-forwarded `custom:a2a`
  channel.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from langgraph.stream import StreamChannel, StreamTransformer


def _unwrap_messages(event: dict[str, Any]) -> Any:
    """Unwrap `(payload, metadata)` from a messages event's data."""
    data = event.get("params", {}).get("data")
    if isinstance(data, tuple) and len(data) == 2:
        return data[0]
    return data


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class A2ATransformer(StreamTransformer):
    """Emit A2A protocol events as `messages` flow through the run."""

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self._channel: StreamChannel[dict[str, Any]] = StreamChannel("a2a")
        self._started = False
        self._active_node: str | None = None
        self._active_role: str | None = None
        self._is_tool_call = False
        self._accumulated_text = ""
        self._artifact_index = 0
        self._announced_nodes: set[str] = set()
        self._context_id = str(uuid.uuid4())
        self._task_id = str(uuid.uuid4())

    def init(self) -> dict[str, Any]:
        return {"a2a": self._channel}

    def _status_event(self, state: str, text: str, final: bool) -> dict[str, Any]:
        return {
            "kind": "status-update",
            "contextId": self._context_id,
            "taskId": self._task_id,
            "final": final,
            "status": {
                "state": state,
                "message": {
                    "kind": "message",
                    "messageId": str(uuid.uuid4()),
                    "role": "agent",
                    "parts": [{"kind": "text", "text": text}],
                },
                "timestamp": _iso_now(),
            },
        }

    def _artifact_event(self, text: str, last_chunk: bool) -> dict[str, Any]:
        node = self._active_node or "agent"
        return {
            "kind": "artifact-update",
            "contextId": self._context_id,
            "taskId": self._task_id,
            "lastChunk": last_chunk,
            "append": not last_chunk,
            "artifact": {
                "artifactId": f"{node}-response-{self._artifact_index}",
                "name": f"{node}-response",
                "parts": [{"kind": "text", "text": text}],
            },
        }

    def process(self, event: dict[str, Any]) -> bool:
        if not self._started:
            self._started = True
            self._channel.push(
                self._status_event("working", "Agent started processing", False)
            )

        namespace = event.get("params", {}).get("namespace") or []
        if namespace:
            segment = namespace[0]
            node_name = segment.split(":", 1)[0]
            if node_name not in self._announced_nodes:
                self._announced_nodes.add(node_name)
                self._channel.push(
                    self._status_event("working", f"{node_name} started", False)
                )

        if event.get("method") != "messages":
            return True

        payload = _unwrap_messages(event)
        if not isinstance(payload, dict):
            return True

        evt = payload.get("event")

        if evt == "message-start":
            segment = namespace[0] if namespace else "agent"
            self._active_node = segment.split(":", 1)[0]
            self._active_role = payload.get("role") or "ai"
            self._accumulated_text = ""
            self._is_tool_call = False

        elif evt == "content-block-start":
            content = payload.get("content") or {}
            if isinstance(content, dict) and content.get("type") in (
                "tool_call_chunk",
                "tool_call",
                "tool_use",
            ):
                self._is_tool_call = True

        elif evt == "content-block-delta":
            delta = payload.get("delta") or {}
            if (
                isinstance(delta, dict)
                and not self._is_tool_call
                and self._active_role == "ai"
                and delta.get("type") == "text-delta"
            ):
                chunk = delta.get("text") or ""
                if chunk:
                    self._accumulated_text += chunk
                    self._channel.push(self._artifact_event(chunk, False))

        elif evt == "message-finish":
            if self._active_role == "ai" and self._accumulated_text:
                self._channel.push(
                    self._artifact_event(self._accumulated_text, True)
                )
                self._artifact_index += 1
                self._accumulated_text = ""
                self._active_node = None
                self._active_role = None
            self._is_tool_call = False

        return True

    def finalize(self) -> None:
        self._channel.push(
            self._status_event("completed", "Agent finished successfully", True)
        )

    def fail(self, err: BaseException) -> None:
        self._channel.push(self._status_event("failed", str(err), True))
