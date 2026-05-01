from __future__ import annotations

from langchain_core.messages import AIMessage, SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from streaming_examples.agents.shared import calculator, model, search_web
from streaming_examples.shared.custom_transformers import (
    StatsTransformer,
    ToolActivityTransformer,
)

model_with_tools = model.bind_tools([search_web, calculator])
tool_node = ToolNode([search_web, calculator])
system_message = SystemMessage(
    "You are a helpful assistant. Use tools when needed. Keep answers concise."
)


def call_model(state: MessagesState) -> dict:
    response = model_with_tools.invoke([system_message, *state["messages"]])
    return {"messages": [response]}


def route_tools(state: MessagesState) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


graph = (
    StateGraph(MessagesState)
    .add_node("agent", call_model)
    .add_node("tools", tool_node)
    .add_edge(START, "agent")
    .add_conditional_edges("agent", route_tools, ["tools", END])
    .add_edge("tools", "agent")
    .compile(transformers=[StatsTransformer, ToolActivityTransformer])
)
