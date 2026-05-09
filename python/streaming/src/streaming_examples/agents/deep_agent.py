from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from deepagents import create_deep_agent
from langchain.agents.middleware.types import (
    AgentMiddleware,
    ContextT,
    ModelRequest,
    ModelResponse,
    ResponseT,
)
from langchain_core.messages import ToolMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

from streaming_examples.agents.shared import model_name


@tool
def judge_poem_quality(draft_text: Annotated[str, "The full poem text to evaluate."]) -> str:
    """Mandatory gate before you finish: call once with the complete poem.

    Demo implementation — always approves non-empty drafts so streaming examples
    show a tool round-trip without a second LLM.
    """
    if not draft_text.strip():
        return '{"passed": false, "reason": "empty draft"}'
    return '{"passed": true, "score": 1.0, "notes": "Demo judge approves."}'


_JUDGE_MARKER = "Demo judge approves"


class RequireToolsUntilJudgeMiddleware(AgentMiddleware):
    """Require at least one tool call per turn until ``judge_poem_quality`` runs.

    Without this, short poet subagents sometimes reply with plain text and skip the
    judge tool, so ``stream_events`` never surfaces ``judge_poem_quality`` in the
    cookbook script.
    """

    def wrap_model_call(
        self,
        request: ModelRequest[ContextT],
        handler: Callable[[ModelRequest[ContextT]], ModelResponse[ResponseT]],
    ) -> ModelResponse[ResponseT]:
        judge_done = _subagent_judge_finished(request.messages)
        return handler(request.override(tool_choice=None if judge_done else "any"))

    async def awrap_model_call(
        self,
        request: ModelRequest[ContextT],
        handler: Callable[
            [ModelRequest[ContextT]], Awaitable[ModelResponse[ResponseT]]
        ],
    ) -> ModelResponse[ResponseT]:
        judge_done = _subagent_judge_finished(request.messages)
        return await handler(request.override(tool_choice=None if judge_done else "any"))


def _subagent_judge_finished(messages: list[Any]) -> bool:
    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        if getattr(m, "name", None) == "judge_poem_quality":
            return True
        if _JUDGE_MARKER in str(m.content):
            return True
    return False


_SUBAGENT_TOOLS = [judge_poem_quality]
_JUDGE_GATE = RequireToolsUntilJudgeMiddleware()

_FINISH_WITH_JUDGE = """

## Required workflow (do not skip)
1. Draft the poem.
2. Call ``judge_poem_quality`` exactly once with the full poem as ``draft_text``.
3. Only after that tool returns, send the final poem text back to the coordinator.

Your task is incomplete until step 2 runs."""

_SUBAGENT_COMMON = {"tools": _SUBAGENT_TOOLS, "middleware": [_JUDGE_GATE]}

agent = create_deep_agent(
    model=model_name,
    checkpointer=InMemorySaver(),
    subagents=[
        {
            "name": "haiku-drafter",
            "description": "Writes a short haiku about the user's topic.",
            **_SUBAGENT_COMMON,
            "system_prompt": """You are the haiku drafter.

Write exactly one haiku with three lines.
Aim for a simple 5-7-5 rhythm and keep the imagery vivid."""
            + _FINISH_WITH_JUDGE,
        },
        {
            "name": "limerick-writer",
            "description": "Writes a playful limerick about the user's topic.",
            **_SUBAGENT_COMMON,
            "system_prompt": """You are the limerick writer.

Write exactly one limerick with five lines.
Make it light, rhythmic, and fun while staying on the user's topic."""
            + _FINISH_WITH_JUDGE,
        },
        {
            "name": "quatrain-poet",
            "description": "Writes a four-line poem about the user's topic.",
            **_SUBAGENT_COMMON,
            "system_prompt": """You are the quatrain poet.

Write exactly one poem with four lines.
Keep it lyrical, compact, and easy to compare with the other poems."""
            + _FINISH_WITH_JUDGE,
        },
        {
            "name": "fifty-line-poet",
            "description": "Writes a fifty-line poem about the user's topic.",
            **_SUBAGENT_COMMON,
            "system_prompt": """You are the fifty-line poet.

Write exactly one poem with 50 lines.
Keep it lyrical, clear, and much more expansive than the shorter poems."""
            + _FINISH_WITH_JUDGE,
        },
    ],
    system_prompt="""You are the poetry coordinator.

When the user asks for a poem or creative writing, ask all four subagents to work
on the same topic in parallel so the frontend can show four subagents running at
the same time.

In each ``task()`` delegation description, explicitly remind the specialist:
they **must** call ``judge_poem_quality`` with their complete poem before sending
their final text back.

Then return all four results with short labels so the user can compare the haiku,
limerick, quatrain, and fifty-line poem.""",
)
