"""ReAct agent with search and calculator tools.

Demonstrates token-by-token message streaming and tool lifecycle events
over the Agent Streaming Protocol via ``LocalThreadSession``.
"""

from __future__ import annotations

from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from tools import calculator, search_web

_llm = ChatOpenAI(model="gpt-4o-mini")
_model_with_tools = _llm.bind_tools([search_web, calculator])
_tool_node = ToolNode([search_web, calculator])

_system_message = SystemMessage(
    content=(
        "You are a helpful assistant with search_web and calculator tools. "
        "Use tools when the user asks for lookup or math. Keep final answers concise."
    )
)


async def _agent(state: MessagesState) -> dict:
    response = await _model_with_tools.ainvoke(
        [_system_message, *state["messages"]]
    )
    return {"messages": [response]}


def _route(state: MessagesState) -> Literal["tools", "__end__"]:
    messages = state.get("messages") or []
    if not messages:
        return END
    last = messages[-1]
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
    .compile(checkpointer=InMemorySaver())
)
