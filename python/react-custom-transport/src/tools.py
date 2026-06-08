"""Mock tools for demonstrating message and tool-call streaming."""

from __future__ import annotations

import asyncio
import json

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class _SearchArgs(BaseModel):
    query: str = Field(description="Search query.")


@tool("search_web", args_schema=_SearchArgs)
async def search_web(query: str) -> str:
    """Search the web for information."""
    await asyncio.sleep(0.3)
    return json.dumps(
        {
            "results": [
                {
                    "title": f"Result for: {query}",
                    "snippet": (
                        f"LangGraph streaming sends token deltas on the "
                        f"messages channel and tool lifecycle events on tools."
                    ),
                }
            ]
        }
    )


class _CalcArgs(BaseModel):
    expression: str = Field(description="Math expression to evaluate.")


@tool("calculator", args_schema=_CalcArgs)
async def calculator(expression: str) -> str:
    """Evaluate a math expression."""
    await asyncio.sleep(0.1)
    try:
        return str(eval(expression, {"__builtins__": {}}, {}))
    except Exception as exc:  # noqa: BLE001
        return f"Error evaluating: {expression} ({exc})"
