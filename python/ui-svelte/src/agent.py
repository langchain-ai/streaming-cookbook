"""Single-node agent graph for the ui-svelte cookbook example.

Python parity for ``typescript/ui-svelte/src/agent.mts``: one ``StateGraph``
node that invokes ``ChatOpenAI(model="gpt-4o-mini")`` on the conversation
messages and returns the assistant response.
"""

from langchain_openai import ChatOpenAI
from langgraph.graph import START, MessagesState, StateGraph

llm = ChatOpenAI(model="gpt-4o-mini")


async def agent(state: MessagesState) -> dict:
    """Invoke the chat model on the current message history."""
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}


graph = (
    StateGraph(MessagesState)
    .add_node("agent", agent)
    .add_edge(START, "agent")
    .compile()
)
