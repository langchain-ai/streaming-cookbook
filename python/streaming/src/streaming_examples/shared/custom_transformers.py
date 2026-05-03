from __future__ import annotations

from typing import Any, TypedDict

from langgraph.stream import ProtocolEvent, StreamChannel, StreamTransformer


class ToolActivity(TypedDict):
    name: str
    status: str


class StatsTransformer(StreamTransformer):
    required_stream_modes = ("messages", "tools", "values")

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self.tools = 0
        self.tokens = 0
        self.seen_usage_messages: set[str] = set()
        self.tool_call_count = StreamChannel[int]("tool_call_count")
        self.total_tokens = StreamChannel[int]("total_tokens")

    def init(self) -> dict[str, StreamChannel[int]]:
        return {
            "tool_call_count": self.tool_call_count,
            "total_tokens": self.total_tokens,
        }

    def process(self, event: ProtocolEvent) -> bool:
        data = event["params"].get("data")
        if event["method"] == "tools" and isinstance(data, dict):
            if data.get("event") == "tool-started":
                self.tools += 1

        if event["method"] == "messages":
            payload = data[0] if isinstance(data, tuple) else data
            if isinstance(payload, dict):
                usage = payload.get("usage") or payload.get("usage_metadata") or {}
                if payload.get("event") == "message-finish" and isinstance(usage, dict):
                    self.tokens += self._token_count(usage)

        if event["method"] == "values" and isinstance(data, dict):
            for message in data.get("messages") or []:
                usage = getattr(message, "usage_metadata", None)
                message_id = getattr(message, "id", None)
                if not usage and isinstance(message, dict):
                    usage = message.get("usage_metadata")
                    message_id = message.get("id")

                if not isinstance(usage, dict):
                    continue

                key = str(message_id or id(message))
                if key in self.seen_usage_messages:
                    continue

                self.seen_usage_messages.add(key)
                self.tokens += self._token_count(usage)

        return True

    def _token_count(self, usage: dict[str, Any]) -> int:
        if usage.get("total_tokens") is not None:
            return int(usage["total_tokens"])
        return int(usage.get("input_tokens") or 0) + int(usage.get("output_tokens") or 0)

    def finalize(self) -> None:
        self.tool_call_count.push(self.tools)
        self.total_tokens.push(self.tokens)
        self.tool_call_count.close()
        self.total_tokens.close()

    def fail(self, err: BaseException) -> None:
        self.finalize()


class ToolActivityTransformer(StreamTransformer):
    required_stream_modes = ("tools",)

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self.tool_activity = StreamChannel[ToolActivity]("toolActivity")
        self.tools: dict[str, str] = {}

    def init(self) -> dict[str, StreamChannel[ToolActivity]]:
        return {"toolActivity": self.tool_activity}

    def process(self, event: ProtocolEvent) -> bool:
        if event["method"] != "tools":
            return True

        data: Any = event["params"].get("data")
        if not isinstance(data, dict):
            return True

        tool_call_id = data.get("tool_call_id")
        if data.get("event") == "tool-started":
            name = data.get("tool_name") or str(tool_call_id)
            self.tools[str(tool_call_id)] = name
            self.tool_activity.push({"name": name, "status": "started"})
        elif data.get("event") == "tool-finished":
            name = self.tools.get(str(tool_call_id), str(tool_call_id))
            self.tool_activity.push({"name": name, "status": "finished"})
        elif data.get("event") == "tool-error":
            name = self.tools.get(str(tool_call_id), str(tool_call_id))
            self.tool_activity.push({"name": name, "status": "error"})

        return True
