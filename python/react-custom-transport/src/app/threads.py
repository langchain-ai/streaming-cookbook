"""Thread state helpers backed by the graph checkpointer.

Implements the LangGraph SDK thread state wire-shape consumed by
``client.threads.getState`` / ``updateState`` (``GET|POST /threads/:id/state``),
aligned with the Agent Protocol thread model in ``agent-protocol/openapi.json``.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import BaseMessage
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import StateSnapshot

LocalProtocolGraph = CompiledStateGraph

# Empty thread bootstrap must write through ``__start__`` so conditional edges
# are not evaluated on an empty ``messages`` list. Non-empty updates on an
# existing checkpoint use ``agent`` when the client omits ``as_node``.
INITIAL_UPDATE_NODE = "__start__"
DEFAULT_UPDATE_NODE = "agent"


def thread_config(thread_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": thread_id}}


def thread_has_checkpoint(snapshot: StateSnapshot) -> bool:
    configurable = snapshot.config.get("configurable", {})
    checkpoint_id = configurable.get("checkpoint_id")
    return isinstance(checkpoint_id, str) and bool(checkpoint_id)


def _serialize_value(value: Any) -> Any:
    if isinstance(value, BaseMessage):
        return value.model_dump()
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    return value


def serialize_thread_state(snapshot: StateSnapshot, thread_id: str) -> dict[str, Any]:
    """Serialize a LangGraph ``StateSnapshot`` to the SDK ``ThreadState`` shape."""
    configurable = snapshot.config.get("configurable", {})
    checkpoint_id = configurable.get("checkpoint_id")
    checkpoint_ns = configurable.get("checkpoint_ns", "")

    tasks: list[dict[str, Any]] = []
    for task in snapshot.tasks or ():
        if not isinstance(task, dict):
            continue
        tasks.append(
            {
                "id": task.get("id"),
                "name": task.get("name"),
                "error": task.get("error"),
                "interrupts": task.get("interrupts") or [],
                "checkpoint": task.get("checkpoint"),
                "state": task.get("state"),
            }
        )

    return {
        "values": _serialize_value(snapshot.values or {}),
        "next": list(snapshot.next or ()),
        "tasks": tasks,
        "checkpoint": {
            "thread_id": thread_id,
            "checkpoint_id": checkpoint_id,
            "checkpoint_ns": checkpoint_ns,
        },
        "metadata": dict(snapshot.metadata or {}),
        "created_at": None,
        "parent_checkpoint": None,
    }


async def get_thread_state(graph: LocalProtocolGraph, thread_id: str) -> dict[str, Any]:
    snapshot = await graph.aget_state(thread_config(thread_id))
    if not thread_has_checkpoint(snapshot):
        raise KeyError(thread_id)
    return serialize_thread_state(snapshot, thread_id)


def _parse_before_cursor(
    thread_id: str, before: Any
) -> dict[str, Any] | None:
    if before is None:
        return None
    if isinstance(before, str):
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_id": before,
            }
        }
    if isinstance(before, dict):
        configurable = before.get("configurable")
        if not isinstance(configurable, dict):
            configurable = before
        checkpoint_id = configurable.get("checkpoint_id")
        if not isinstance(checkpoint_id, str):
            return None
        cursor: dict[str, Any] = {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_id": checkpoint_id,
            }
        }
        checkpoint_ns = configurable.get("checkpoint_ns")
        if isinstance(checkpoint_ns, str):
            cursor["configurable"]["checkpoint_ns"] = checkpoint_ns
        return cursor
    return None


async def get_thread_history(
    graph: LocalProtocolGraph,
    thread_id: str,
    *,
    limit: int = 10,
    before: Any = None,
) -> list[dict[str, Any]]:
    try:
        await get_thread_state(graph, thread_id)
    except KeyError:
        raise KeyError(thread_id) from None

    history: list[dict[str, Any]] = []
    before_config = _parse_before_cursor(thread_id, before)
    async for snapshot in graph.aget_state_history(
        thread_config(thread_id),
        before=before_config,
        limit=limit,
    ):
        history.append(serialize_thread_state(snapshot, thread_id))
    return history


def _resolve_update_node(
    *,
    as_node: str | None,
    values: dict[str, Any] | None,
    has_checkpoint: bool,
) -> str:
    if as_node:
        return as_node

    messages = (values or {}).get("messages")
    if not messages:
        return INITIAL_UPDATE_NODE
    if not has_checkpoint:
        return INITIAL_UPDATE_NODE
    return DEFAULT_UPDATE_NODE


async def update_thread_state(
    graph: LocalProtocolGraph,
    thread_id: str,
    *,
    values: dict[str, Any] | None = None,
    checkpoint: dict[str, Any] | None = None,
    as_node: str | None = None,
) -> dict[str, Any]:
    config = thread_config(thread_id)
    if checkpoint and isinstance(checkpoint.get("checkpoint_id"), str):
        config = {
            "configurable": {
                **config["configurable"],
                "checkpoint_id": checkpoint["checkpoint_id"],
                **(
                    {"checkpoint_ns": checkpoint["checkpoint_ns"]}
                    if isinstance(checkpoint.get("checkpoint_ns"), str)
                    else {}
                ),
            }
        }

    snapshot = await graph.aget_state(config)
    resolved_values = values if values is not None else {"messages": []}
    resolved_as_node = _resolve_update_node(
        as_node=as_node,
        values=resolved_values,
        has_checkpoint=thread_has_checkpoint(snapshot),
    )

    await graph.aupdate_state(
        config,
        resolved_values,
        as_node=resolved_as_node,
    )
    snapshot = await graph.aget_state(thread_config(thread_id))
    return serialize_thread_state(snapshot, thread_id)
