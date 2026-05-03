from __future__ import annotations

import json
import time
from typing import Annotated, Literal

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from streaming_examples.agents.shared import model, search_web


@tool
def summarize(
    text: Annotated[str, "Text to summarize."],
    format: Annotated[Literal["bullets", "prose"], "Output format."],
) -> str:
    """Summarize text into bullets or prose."""
    time.sleep(0.2)
    lines = (
        [f"- {part.strip()}" for part in text.split(".") if part.strip()]
        if format == "bullets"
        else [text]
    )
    return json.dumps({"summary": "\n".join(lines)})


@tool
def score_risks(risks: Annotated[list[str], "Risks to score."]) -> str:
    """Score a list of risks by severity."""
    time.sleep(0.15)
    return json.dumps(
        {
            "scored": [
                {"risk": risk, "severity": "high" if i % 2 == 0 else "medium"}
                for i, risk in enumerate(risks)
            ]
        }
    )


def route_tools(state: MessagesState) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


researcher_model = model.bind_tools([search_web, summarize])
researcher_tools = ToolNode([search_web, summarize])


def call_researcher(state: MessagesState) -> dict:
    response = researcher_model.invoke(
        [
            SystemMessage(
                "You are a research agent. Search for the topic, then summarize findings as bullets."
            ),
            *state["messages"],
        ]
    )
    return {"messages": [response]}


researcher_graph = (
    StateGraph(MessagesState)
    .add_node("researcher", call_researcher)
    .add_node("tools", researcher_tools)
    .add_edge(START, "researcher")
    .add_conditional_edges("researcher", route_tools, ["tools", END])
    .add_edge("tools", "researcher")
    .compile()
)

analyst_model = model.bind_tools([score_risks])
analyst_tools = ToolNode([score_risks])


def call_analyst(state: MessagesState) -> dict:
    response = analyst_model.invoke(
        [
            SystemMessage(
                "You are a risk analyst. Read the research, identify 3 risks, and score them."
            ),
            *state["messages"],
        ]
    )
    return {"messages": [response]}


analyst_graph = (
    StateGraph(MessagesState)
    .add_node("analyst", call_analyst)
    .add_node("tools", analyst_tools)
    .add_edge(START, "analyst")
    .add_conditional_edges("analyst", route_tools, ["tools", END])
    .add_edge("tools", "analyst")
    .compile()
)

graph = (
    StateGraph(MessagesState)
    .add_node("researcher", researcher_graph)
    .add_node("analyst", analyst_graph)
    .add_edge(START, "researcher")
    .add_edge("researcher", "analyst")
    .add_edge("analyst", END)
    .compile()
)
