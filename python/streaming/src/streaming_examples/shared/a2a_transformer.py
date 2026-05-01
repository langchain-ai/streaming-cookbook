from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, TypedDict
from uuid import uuid4

from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langgraph.stream import ProtocolEvent, StreamChannel, StreamTransformer


def _unpack_messages_payload(raw: Any) -> tuple[Any, dict[str, Any]] | None:
    """Normalize LangGraph `messages` protocol payloads.

    Under ``stream_events(version="v3")``, ``params["data"]`` is typically a
    ``(payload, metadata)`` tuple (matching ``MessagesTransformer``). Older or
    synthetic shapes may pass a bare dict for ``payload``.
    """
    if isinstance(raw, tuple) and len(raw) >= 2:
        meta = raw[1] if isinstance(raw[1], dict) else {}
        return raw[0], meta
    if isinstance(raw, dict):
        return raw, {}
    return None


def _interpret_content_block_delta(data: dict[str, Any]) -> tuple[bool, str | None]:
    """Parse Agent Streaming Protocol ``content-block-delta`` (`MessagesData`).

    ``delta`` is a ``ContentBlockDelta``: append-style deltas or ``block-delta`` (shallow-merge
    ``fields`` onto the active block — tool-call streaming per ``agent-protocol/streaming/protocol.cddl``).

    Returns ``(skip_tool_stream, text_chunk)`` for mapping assistant ``text-delta`` into A2A artifacts.
    """

    raw_delta = data.get("delta")
    if isinstance(raw_delta, dict) and raw_delta.get("type") == "block-delta":
        fields = raw_delta.get("fields")
        if isinstance(fields, dict):
            ft = fields.get("type")
            if ft in (
                "tool_call_chunk",
                "tool_use",
                "tool_call",
                "input_json_delta",
            ):
                return True, None
            if ft in ("text", "text-delta"):
                t = fields.get("text")
                if isinstance(t, str):
                    return False, t
        return False, None

    if isinstance(raw_delta, dict):
        dt = raw_delta.get("type")
        if dt in ("text", "text-delta"):
            t = raw_delta.get("text")
            if isinstance(t, str):
                return False, t

    alt = data.get("content") or data.get("content_block")
    if isinstance(alt, dict) and alt.get("type") in ("text", "text-delta"):
        t = alt.get("text")
        if isinstance(t, str):
            return False, t

    return False, None


class TextPart(TypedDict):
    kind: Literal["text"]
    text: str


class A2AMessage(TypedDict):
    kind: Literal["message"]
    messageId: str
    role: Literal["agent"]
    parts: list[TextPart]


class A2AStatus(TypedDict):
    state: str
    message: A2AMessage
    timestamp: str


class A2AStatusUpdateEvent(TypedDict):
    kind: Literal["status-update"]
    contextId: str
    taskId: str
    final: bool
    status: A2AStatus


class A2AArtifact(TypedDict):
    artifactId: str
    name: str
    parts: list[TextPart]


class A2AArtifactUpdateEvent(TypedDict):
    kind: Literal["artifact-update"]
    contextId: str
    taskId: str
    lastChunk: bool
    append: bool
    artifact: A2AArtifact


A2AStreamEvent = A2AStatusUpdateEvent | A2AArtifactUpdateEvent


class A2ATransformer(StreamTransformer):
    required_stream_modes = ("messages", "lifecycle")

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self.a2a = StreamChannel[A2AStreamEvent]("a2a")
        self.started = False
        self.active_node: str | None = None
        self.active_role: str | None = None
        self.is_tool_call = False
        self.accumulated_text = ""
        self.artifact_index = 0
        self.announced_nodes: set[str] = set()
        self.context_id = str(uuid4())
        self.task_id = str(uuid4())

    def init(self) -> dict[str, StreamChannel[A2AStreamEvent]]:
        return {"a2a": self.a2a}

    def _status(self, state: str, text: str, final: bool) -> A2AStatusUpdateEvent:
        return {
            "kind": "status-update",
            "contextId": self.context_id,
            "taskId": self.task_id,
            "final": final,
            "status": {
                "state": state,
                "message": {
                    "kind": "message",
                    "messageId": str(uuid4()),
                    "role": "agent",
                    "parts": [{"kind": "text", "text": text}],
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        }

    def _artifact(self, text: str, last_chunk: bool) -> A2AArtifactUpdateEvent:
        active_node = self.active_node or "agent"
        return {
            "kind": "artifact-update",
            "contextId": self.context_id,
            "taskId": self.task_id,
            "lastChunk": last_chunk,
            "append": not last_chunk,
            "artifact": {
                "artifactId": f"{active_node}-response-{self.artifact_index}",
                "name": f"{active_node}-response",
                "parts": [{"kind": "text", "text": text}],
            },
        }

    def process(self, event: ProtocolEvent) -> bool:
        if not self.started:
            self.started = True
            self.a2a.push(self._status("working", "Agent started processing", False))

        namespace = event["params"].get("namespace") or []
        if namespace:
            node_name = str(namespace[0]).split(":")[0]
            if node_name not in self.announced_nodes:
                self.announced_nodes.add(node_name)
                self.a2a.push(self._status("working", f"{node_name} started", False))

        if event["method"] != "messages":
            return True

        unpacked = _unpack_messages_payload(event["params"].get("data"))
        if unpacked is None:
            return True
        payload, _meta = unpacked

        if isinstance(payload, BaseMessage):
            # Whole-message emission (e.g. ``on_llm_end`` / node output); v1-style
            # ``AIMessageChunk`` streams are ignored here (same as ``MessagesTransformer``).
            if isinstance(payload, AIMessageChunk):
                return True
            if isinstance(payload, AIMessage) and not payload.tool_calls:
                segment = namespace[0] if namespace else "agent"
                self.active_node = str(segment).split(":")[0]
                text = payload.text
                if text.strip():
                    self.a2a.push(self._artifact(text, True))
                    self.artifact_index += 1
                self.active_node = None
            return True

        if not isinstance(payload, dict):
            return True

        data = payload

        if data.get("event") == "message-start":
            segment = namespace[0] if namespace else "agent"
            self.active_node = str(segment).split(":")[0]
            role = data.get("role")
            if role is None and isinstance(data.get("tool_call_id"), str):
                self.active_role = "tool"
            else:
                self.active_role = role if role is not None else "ai"
            self.accumulated_text = ""
            self.is_tool_call = False

        block_start = data.get("content") or data.get("content_block") or {}
        if data.get("event") == "content-block-start" and isinstance(block_start, dict):
            if block_start.get("type") in {
                "tool_call_chunk",
                "tool_call",
                "tool_use",
            }:
                self.is_tool_call = True

        if data.get("event") == "content-block-delta":
            skip_tool, chunk = _interpret_content_block_delta(data)
            if (
                not skip_tool
                and self.active_role == "ai"
                and not self.is_tool_call
                and chunk is not None
            ):
                self.accumulated_text += chunk
                self.a2a.push(self._artifact(chunk, False))

        if data.get("event") == "message-finish":
            if self.active_role == "ai" and self.accumulated_text:
                self.a2a.push(self._artifact(self.accumulated_text, True))
                self.artifact_index += 1
            self.accumulated_text = ""
            self.active_node = None
            self.active_role = None
            self.is_tool_call = False

        return True

    def finalize(self) -> None:
        self.a2a.push(self._status("completed", "Agent finished successfully", True))
        self.a2a.close()

    def fail(self, err: BaseException) -> None:
        self.a2a.push(self._status("failed", str(err), True))
        self.a2a.close()
