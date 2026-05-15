"""Research pipeline: researcher subgraph -> analyst subgraph.

Two subgraphs with separate tool sets wired sequentially. Demonstrates
how `astream_events(version="v3")` surfaces subgraph events through
nested namespaces.
"""

from __future__ import annotations

import asyncio
import json
from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, Field

from agents.shared import model, search_web


class _SummarizeArgs(BaseModel):
    text: str
    format: Literal["bullets", "prose"]


@tool("summarize", args_schema=_SummarizeArgs)
async def summarize(text: str, format: Literal["bullets", "prose"]) -> str:
    """Summarize text into bullets or prose."""
    await asyncio.sleep(0.2)
    if format == "bullets":
        lines = [f"- {s.strip()}" for s in text.split(".") if s.strip()]
    else:
        lines = [text]
    return json.dumps({"summary": "\n".join(lines)})


class _ScoreRisksArgs(BaseModel):
    risks: list[str] = Field(default_factory=list)


@tool("score_risks", args_schema=_ScoreRisksArgs)
async def score_risks(risks: list[str]) -> str:
    """Score a list of risks by severity."""
    await asyncio.sleep(0.15)
    scored = [
        {"risk": risk, "severity": "high" if i % 2 == 0 else "medium"}
        for i, risk in enumerate(risks)
    ]
    return json.dumps({"scored": scored})


# --- Researcher subgraph ---------------------------------------------------
_researcher_model = model.bind_tools([search_web, summarize])
_researcher_tools = ToolNode([search_web, summarize])


async def _researcher(state: MessagesState) -> dict:
    response = await _researcher_model.ainvoke(
        [
            SystemMessage(
                content=(
                    "You are a research agent. Search for the topic, then "
                    "summarize findings as bullets."
                )
            ),
            *state["messages"],
        ]
    )
    return {"messages": [response]}


def _researcher_route(state: MessagesState) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END


researcher_graph = (
    StateGraph(MessagesState)
    .add_node("researcher", _researcher)
    .add_node("tools", _researcher_tools)
    .add_edge(START, "researcher")
    .add_conditional_edges("researcher", _researcher_route, ["tools", END])
    .add_edge("tools", "researcher")
    .compile()
)


# --- Analyst subgraph ------------------------------------------------------
_analyst_model = model.bind_tools([score_risks])
_analyst_tools = ToolNode([score_risks])


async def _analyst(state: MessagesState) -> dict:
    response = await _analyst_model.ainvoke(
        [
            SystemMessage(
                content=(
                    "You are a risk analyst. Read the research, identify "
                    "3 risks, and score them."
                )
            ),
            *state["messages"],
        ]
    )
    return {"messages": [response]}


def _analyst_route(state: MessagesState) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END


analyst_graph = (
    StateGraph(MessagesState)
    .add_node("analyst", _analyst)
    .add_node("tools", _analyst_tools)
    .add_edge(START, "analyst")
    .add_conditional_edges("analyst", _analyst_route, ["tools", END])
    .add_edge("tools", "analyst")
    .compile()
)


# --- Parent pipeline -------------------------------------------------------
graph = (
    StateGraph(MessagesState)
    .add_node("researcher", researcher_graph)
    .add_node("analyst", analyst_graph)
    .add_edge(START, "researcher")
    .add_edge("researcher", "analyst")
    .add_edge("analyst", END)
    .compile()
)
