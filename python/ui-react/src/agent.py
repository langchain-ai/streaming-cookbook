"""React reconnect demo agent (Python port of typescript/ui-react/src/agent.mts).

Serves the same wire-shape as the JS sibling so the existing Vite/React
frontend in `typescript/ui-react/` can talk to a Python `langgraph dev`
server on port 2024 unchanged.

The JS version attaches a `MemorySaver` checkpointer; the Python sibling
intentionally omits it because `langgraph-api` provides persistence and
rejects graphs that bake in a custom checkpointer.
"""

from __future__ import annotations

from deepagents import create_deep_agent

SYSTEM_PROMPT = """You are demoing a React reconnect scenario for LangGraph streaming.

Do not call tools. Answer directly in eight short bullets with clear labels for
"before refresh", "during refresh", and "after reconnect". Keep each bullet
specific enough that the response streams for a few seconds in the browser."""

graph = create_deep_agent(
    model="gpt-4o-mini",
    system_prompt=SYSTEM_PROMPT,
)
