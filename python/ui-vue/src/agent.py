"""Python port of typescript/ui-vue/src/agent.mts.

A single-node StateGraph that invokes ChatOpenAI(model="gpt-4o-mini") on
the running message history and appends the response. Exposed as `graph`
for `langgraph.json` to load.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph

llm = ChatOpenAI(model="gpt-4o-mini")


async def agent_node(state: MessagesState) -> dict:
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}


graph = (
    StateGraph(MessagesState)
    .add_node("agent", agent_node)
    .add_edge(START, "agent")
    .add_edge("agent", END)
    .compile()
)
