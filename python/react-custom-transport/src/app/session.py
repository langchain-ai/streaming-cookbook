"""Agent Streaming Protocol session utilities.

Port of the `LocalThreadSession` proposed in deepagents#3786. This class
is the server-side counterpart to `HttpAgentServerAdapter`.

@see https://github.com/langchain-ai/agent-protocol/tree/main/streaming
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
import uuid
import warnings
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from langchain_core._api import LangChainBetaWarning
from langchain_core.messages import BaseMessage
from langgraph.graph.state import CompiledStateGraph
from langgraph.stream import ProtocolEvent
from langgraph.stream.run_stream import AsyncGraphRunStream
from langgraph.types import Command, Send

logger = logging.getLogger(__name__)

LocalProtocolGraph = CompiledStateGraph

PROTOCOL_METHODS = {
    "values",
    "checkpoints",
    "updates",
    "messages",
    "tools",
    "custom",
    "lifecycle",
    "input.requested",
    "tasks",
}


def is_record(value: Any) -> bool:
    return isinstance(value, dict)


def segment_matches(filter_segment: str, event_segment: str) -> bool:
    if ":" in filter_segment:
        return filter_segment == event_segment
    return event_segment.split(":")[0] == filter_segment


def get_event_channel(event: ProtocolEvent) -> str:
    method = event["method"]
    # Python v3 emits named custom channels as ``custom:<name>`` on the wire.
    if method.startswith("custom:"):
        return method
    if method != "custom":
        return method
    data = event["params"]["data"]
    if is_record(data) and isinstance(data.get("name"), str):
        return f"custom:{data['name']}"
    return "custom"


def matches_subscription(event: ProtocolEvent, params: dict[str, Any]) -> bool:
    channel = get_event_channel(event)
    channels = params.get("channels")
    if (
        isinstance(channels, list)
        and channels
        and channel not in channels
        and not (channel.startswith("custom:") and "custom" in channels)
    ):
        return False

    namespaces = params.get("namespaces")
    if not isinstance(namespaces, list) or not namespaces:
        return True

    namespace = (
        event["params"]["namespace"]
        if isinstance(event["params"]["namespace"], list)
        else []
    )

    depth = params.get("depth")
    for prefix in namespaces:
        if not isinstance(prefix, list):
            continue
        if len(prefix) > len(namespace):
            continue
        prefix_matches = all(
            segment_matches(segment, namespace[index] if index < len(namespace) else "")
            for index, segment in enumerate(prefix)
        )
        if not prefix_matches:
            continue
        if depth is None or len(namespace) - len(prefix) <= depth:
            return True
    return False


def is_after_replay_cursor(event: ProtocolEvent, params: dict[str, Any]) -> bool:
    since = params.get("since")
    return not isinstance(since, int) or (event.get("seq") or -1) > since


def normalize_event(event: ProtocolEvent) -> ProtocolEvent:
    method = event["method"]
    if method in PROTOCOL_METHODS:
        return event

    # Python v3 already emits named custom channels as ``custom:<name>``.
    # Pass them through so SSE frames match LangGraph's native wire shape.
    if method.startswith("custom:"):
        return event

    # LangGraph JS ``StreamChannel.remote("<name>")`` emits method ``"<name>"``.
    return {
        **event,
        "method": "custom",
        "params": {
            **event["params"],
            "data": {
                "name": method,
                "payload": event["params"]["data"],
            },
        },
    }


def unwrap_protocol_data(method: str, data: Any) -> Any:
    """Unwrap Python v3 ``(payload, metadata)`` tuples for protocol consumers.

    LangGraph's Python v3 stream emits ``messages`` (and ``tools``) events with
    ``params.data`` as a ``(payload, metadata)`` pair. The JS SDK's
    ``MessageAssembler`` expects a single payload object with an ``event`` field.
    """
    if method not in {"messages", "tools"}:
        return data
    if isinstance(data, tuple) and len(data) >= 1:
        return data[0]
    if (
        isinstance(data, list)
        and len(data) >= 1
        and isinstance(data[0], dict)
        and "event" in data[0]
    ):
        return data[0]
    return data


def sanitize_for_json(value: Any) -> Any:
    if isinstance(value, BaseMessage):
        return value.model_dump()
    if isinstance(value, Command):
        return sanitize_for_json(dataclasses.asdict(value))
    if isinstance(value, Send):
        return sanitize_for_json(
            {
                "node": value.node,
                "arg": value.arg,
                "timeout": value.timeout,
            }
        )
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return sanitize_for_json(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {key: sanitize_for_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(item) for item in value]
    return value


def sanitize_event(event: ProtocolEvent) -> ProtocolEvent:
    params = dict(event["params"])
    method = event.get("method", "")
    params["data"] = sanitize_for_json(
        unwrap_protocol_data(method, params.get("data"))
    )
    if "interrupts" in params:
        params["interrupts"] = sanitize_for_json(params["interrupts"])
    return {**event, "params": params}


def _messages_from_values_event(event: ProtocolEvent) -> list[dict[str, Any]]:
    if event.get("method") != "values":
        return []
    params = event.get("params")
    if not is_record(params):
        return []
    namespace = params.get("namespace")
    if isinstance(namespace, list) and len(namespace) > 0:
        return []
    data = params.get("data")
    if not is_record(data):
        return []
    messages = data.get("messages")
    if not isinstance(messages, list):
        return []
    return [message for message in messages if is_record(message)]


def synthesize_tools_events(
    event: ProtocolEvent,
    *,
    announced: set[str],
    finished: set[str],
) -> list[ProtocolEvent]:
    """Emit ``tools`` channel events when Python v3 only surfaces tool activity in ``values``.

    The JS SDK's ``stream.toolCalls`` projection listens for ``tool-started`` /
    ``tool-finished`` on the ``tools`` channel. LangGraph's Python runtime does
    not always emit those alongside ``values.messages``, so we synthesize them
    from authoritative checkpoint snapshots.
    """
    synthesized: list[ProtocolEvent] = []
    for message in _messages_from_values_event(event):
        message_type = message.get("type")
        if message_type == "ai":
            tool_calls = message.get("tool_calls")
            if not isinstance(tool_calls, list):
                continue
            for tool_call in tool_calls:
                if not is_record(tool_call):
                    continue
                call_id = tool_call.get("id")
                tool_name = tool_call.get("name")
                if not isinstance(call_id, str) or not isinstance(tool_name, str):
                    continue
                if call_id in announced:
                    continue
                announced.add(call_id)
                synthesized.append(
                    {
                        "type": "event",
                        "method": "tools",
                        "params": {
                            "namespace": [],
                            "data": {
                                "event": "tool-started",
                                "tool_call_id": call_id,
                                "tool_name": tool_name,
                                "input": tool_call.get("args") or {},
                            },
                        },
                    }
                )
            continue

        if message_type != "tool":
            continue

        call_id = message.get("tool_call_id")
        if not isinstance(call_id, str) or call_id in finished:
            continue
        finished.add(call_id)
        synthesized.append(
            {
                "type": "event",
                "method": "tools",
                "params": {
                    "namespace": [],
                    "data": {
                        "event": "tool-finished",
                        "tool_call_id": call_id,
                        "output": message.get("content"),
                    },
                },
            }
        )
    return synthesized


def encode_sse(event: ProtocolEvent) -> str:
    event_id = event.get("event_id")
    seq = event.get("seq")
    frame_id = event_id if event_id else (f"{seq}" if isinstance(seq, int) else "")
    id_line = f"id: {frame_id}\n" if frame_id else ""
    return f"{id_line}event: message\ndata: {json.dumps(event)}\n\n"


@dataclass
class _Sink:
    params: dict[str, Any]
    queue: asyncio.Queue[str | None]


class LocalThreadSession:
    """Minimal in-memory Agent Streaming Protocol session for the local demo.

    This class is the server-side counterpart to `HttpAgentServerAdapter`.
    It implements the SSE/HTTP transport model documented by the Agent
    Streaming Protocol:

    - `POST /threads/:thread_id/commands` sends a JSON `Command` and receives a
      `CommandResponse` or `ErrorResponse`.
    - `POST /threads/:thread_id/stream` opens a connection-scoped SSE
      subscription described by `SubscribeParams`.
    - Events are buffered by `seq` and replayed to later subscriptions, enabling
      the SDK to rotate streams as subscriptions widen or narrow.

    The implementation is intentionally small and process-local. It is suitable
    for this example and for understanding the protocol shape, but production
    servers should persist threads, enforce concurrency policies, and coordinate
    replay buffers across workers.

    @see https://github.com/langchain-ai/agent-protocol/tree/main/streaming
    """

    def __init__(self, graph: LocalProtocolGraph, thread_id: str) -> None:
        self._graph = graph
        self._thread_id = thread_id
        self._buffer: list[ProtocolEvent] = []
        self._sinks: list[_Sink] = []
        self._active_run: AsyncGraphRunStream | None = None
        self._active_run_id: str | None = None
        self._active_run_task: asyncio.Task[None] | None = None
        self._root_lifecycle_terminal: str | None = None
        self._announced_tool_calls: set[str] = set()
        self._finished_tool_calls: set[str] = set()

    def _next_seq(self) -> int:
        if not self._buffer:
            return 0
        last_seq = self._buffer[-1].get("seq")
        if isinstance(last_seq, int):
            return last_seq + 1
        return len(self._buffer)

    @staticmethod
    def _is_root_lifecycle(event: ProtocolEvent, name: str) -> bool:
        if event.get("method") != "lifecycle":
            return False
        params = event.get("params")
        if not is_record(params):
            return False
        namespace = params.get("namespace")
        if not isinstance(namespace, list) or len(namespace) != 0:
            return False
        data = params.get("data")
        if not is_record(data):
            return False
        return data.get("event") == name

    def _publish_lifecycle(self, event: str, *, error: str | None = None) -> None:
        data: dict[str, Any] = {"event": event}
        if error is not None:
            data["error"] = error
        seq = self._next_seq()
        self._publish(
            {
                "type": "event",
                "seq": seq,
                "method": "lifecycle",
                "params": {
                    "namespace": [],
                    "data": data,
                },
            }
        )

    def _ensure_root_lifecycle_terminal(self, *, error: Exception | None = None) -> None:
        if self._root_lifecycle_terminal is not None:
            return
        if error is not None:
            self._publish_lifecycle("failed", error=str(error))
            self._root_lifecycle_terminal = "failed"
        else:
            self._publish_lifecycle("completed")
            self._root_lifecycle_terminal = "completed"

    async def _rollback_checkpoints(self, run_id: str) -> None:
        checkpointer = self._graph.checkpointer
        if checkpointer is None:
            return
        await checkpointer.adelete_for_runs([run_id])

    async def cancel_run(
        self, run_id: str, *, action: str = "interrupt", wait: bool = False
    ) -> None:
        if self._active_run_id is not None and self._active_run_id != run_id:
            return

        async def finish_cancel() -> None:
            if self._active_run is not None:
                await self._active_run.abort()
            if self._active_run_task is not None:
                try:
                    await self._active_run_task
                except Exception:
                    logger.exception("Run task failed during cancel")
            if action == "rollback":
                await self._rollback_checkpoints(run_id)

        if wait:
            await finish_cancel()
            return

        if self._active_run is not None:
            await self._active_run.abort()
        if action == "rollback":
            asyncio.create_task(finish_cancel())

    async def handle_command(self, command: dict[str, Any]) -> dict[str, Any]:
        """Handle a thread command sent to the Agent Protocol `/commands` endpoint."""
        if command.get("method") != "run.start":
            return {
                "type": "error",
                "id": command.get("id"),
                "error": "unknown_command",
                "message": f"Unsupported command: {command.get('method')}",
            }

        params = command.get("params") if is_record(command.get("params")) else {}
        run_id = str(uuid.uuid4())
        self._active_run_task = asyncio.create_task(
            self._start_run(params.get("input"), run_id)
        )

        return {
            "type": "success",
            "id": command.get("id"),
            "result": {"run_id": run_id},
        }

    async def stream(self, params: dict[str, Any]) -> AsyncIterator[str]:
        """Open a connection-scoped SSE subscription for this thread."""
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        sink = _Sink(params=params, queue=queue)
        self._sinks.append(sink)

        try:
            for event in self._buffer:
                if is_after_replay_cursor(event, params) and matches_subscription(
                    event, params
                ):
                    yield encode_sse(event)

            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            try:
                self._sinks.remove(sink)
            except ValueError:
                pass

    async def _start_run(self, input: Any, run_id: str) -> None:
        if self._active_run is not None:
            await self._active_run.abort()

        self._active_run_id = run_id
        self._root_lifecycle_terminal = None
        run_error: Exception | None = None
        self._publish_lifecycle("running")
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="The v3 streaming protocol on Pregel is experimental.",
                category=LangChainBetaWarning,
            )
            run = await self._graph.astream_events(
                input,
                {
                    "configurable": {
                        "thread_id": self._thread_id,
                        "run_id": run_id,
                    }
                },
                version="v3",
            )
        self._active_run = run

        try:
            async for raw_event in run:
                if self._is_root_lifecycle(raw_event, "completed"):
                    self._root_lifecycle_terminal = "completed"
                elif self._is_root_lifecycle(raw_event, "failed"):
                    self._root_lifecycle_terminal = "failed"
                elif self._is_root_lifecycle(raw_event, "interrupted"):
                    self._root_lifecycle_terminal = "interrupted"
                self._publish(raw_event)
        except Exception as error:
            run_error = error
            logger.exception(error)
        finally:
            self._ensure_root_lifecycle_terminal(error=run_error)
            if self._active_run is run:
                self._active_run = None
            if self._active_run_id == run_id:
                self._active_run_id = None
            if self._active_run_task is asyncio.current_task():
                self._active_run_task = None

    def _emit(self, event: ProtocolEvent) -> None:
        if event.get("type") != "event":
            event = {**event, "type": "event"}
        event = {**event, "seq": self._next_seq()}
        serializable = sanitize_event(normalize_event(event))
        self._buffer.append(serializable)
        chunk = encode_sse(serializable)

        for sink in self._sinks:
            if matches_subscription(serializable, sink.params):
                sink.queue.put_nowait(chunk)

    def _publish(self, event: ProtocolEvent) -> None:
        if event.get("type") != "event":
            event = {**event, "type": "event"}
        serializable = sanitize_event(normalize_event(event))
        pending = [serializable, *synthesize_tools_events(
            serializable,
            announced=self._announced_tool_calls,
            finished=self._finished_tool_calls,
        )]
        for item in pending:
            self._emit(item)
