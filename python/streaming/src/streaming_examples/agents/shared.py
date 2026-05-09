from __future__ import annotations

import ast
import json
import operator
import os
import time
from typing import Annotated

from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool

from streaming_examples.shared.env import load_root_env

load_root_env()

model_name = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

model = ChatAnthropic(
    model=model_name,
    thinking={"type": "enabled", "budget_tokens": 1024},
)


@tool
def search_web(query: Annotated[str, "Search query."]) -> str:
    """Search the web for information."""
    time.sleep(0.3)
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


_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval_math(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_math(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
        return _OPERATORS[type(node.op)](_eval_math(node.left), _eval_math(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPERATORS:
        return _OPERATORS[type(node.op)](_eval_math(node.operand))
    raise ValueError("unsupported expression")


@tool
def calculator(expression: Annotated[str, "Math expression to evaluate."]) -> str:
    """Evaluate a math expression."""
    time.sleep(0.1)
    try:
        tree = ast.parse(expression, mode="eval")
        return str(_eval_math(tree))
    except Exception:
        return f"Error evaluating: {expression}"
