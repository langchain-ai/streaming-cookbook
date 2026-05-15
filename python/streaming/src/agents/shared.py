"""Shared model instance and tools used across streaming examples."""

from __future__ import annotations

import asyncio
import json
import os

from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool
from pydantic import BaseModel, Field

MODEL_NAME = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

model = ChatAnthropic(
    model=MODEL_NAME,
    thinking={"type": "enabled", "budget_tokens": 1024},
)


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
                    "snippet": f"Found info about {query}.",
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
        # Restricted eval — only literal arithmetic; no builtins.
        return str(eval(expression, {"__builtins__": {}}, {}))
    except Exception as exc:  # noqa: BLE001
        return f"Error evaluating: {expression} ({exc})"
