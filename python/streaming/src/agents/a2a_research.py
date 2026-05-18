"""Research pipeline compiled with the A2A stream transformer.

Same researcher + analyst subgraphs as `research_pipeline.py`, but the
parent graph is compiled with `transformers=[A2ATransformer]` so A2A
events flow on every `astream_events(version="v3")` run — including
when the graph is served by `langgraph dev`.
"""

from __future__ import annotations

from langgraph.graph import END, START, MessagesState, StateGraph

from shared.a2a_transformer import A2ATransformer

from agents.research_pipeline import analyst_graph, researcher_graph


graph = (
    StateGraph(MessagesState)
    .add_node("researcher", researcher_graph)
    .add_node("analyst", analyst_graph)
    .add_edge(START, "researcher")
    .add_edge("researcher", "analyst")
    .add_edge("analyst", END)
    .compile(transformers=[A2ATransformer])
)
