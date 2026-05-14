"""Simple tool-calling graph: model → tools → model (loop).

A single ReAct-style loop with search and calculator tools.
"""

from __future__ import annotations

from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from .shared import calculator, model, search_web

_model_with_tools = model.bind_tools([search_web, calculator])
_tool_node = ToolNode([search_web, calculator])

_system_message = SystemMessage(
    content=(
        "You are a helpful assistant. Use tools when needed. "
        "Keep answers concise."
    )
)


async def _agent(state: MessagesState) -> dict:
    response = await _model_with_tools.ainvoke([_system_message, *state["messages"]])
    return {"messages": [response]}


def _route(state: MessagesState) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END


graph = (
    StateGraph(MessagesState)
    .add_node("agent", _agent)
    .add_node("tools", _tool_node)
    .add_edge(START, "agent")
    .add_conditional_edges("agent", _route, ["tools", END])
    .add_edge("tools", "agent")
    .compile()
)
