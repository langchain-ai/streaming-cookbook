"""Python port of typescript/ui-angular/src/agent.mts.

A one-node ``StateGraph`` that calls ``ChatOpenAI(model="gpt-4o-mini")`` on
the conversation history and appends the assistant's reply to ``messages``.

The graph is served by ``langgraph dev`` on port 2024 so the existing
Angular frontend in ``typescript/ui-angular`` can talk to a Python backend
unchanged.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI
from langgraph.graph import START, MessagesState, StateGraph

llm = ChatOpenAI(model="gpt-4o-mini")


async def agent(state: MessagesState) -> dict:
    """Invoke the LLM on the current messages and return the response."""
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}


graph = (
    StateGraph(MessagesState)
    .add_node("agent", agent)
    .add_edge(START, "agent")
    .compile()
)
