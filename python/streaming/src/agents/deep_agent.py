"""Deep agent with multiple poem-writing subagents.

Used by `subagents/` and `subagent_status/` to demonstrate observing a
fan-out of subagents — both in-process (via the `subagents` projection)
and remotely (via the SDK client's `thread.subagents`).
"""

from __future__ import annotations

from deepagents import create_deep_agent

from agents.shared import MODEL_NAME

agent = create_deep_agent(
    model=MODEL_NAME,
    subagents=[
        {
            "name": "haiku-drafter",
            "description": "Writes a short haiku about the user's topic.",
            "system_prompt": (
                "You are the haiku drafter.\n\n"
                "Write exactly one haiku with three lines.\n"
                "Aim for a simple 5-7-5 rhythm and keep imagery vivid."
            ),
        },
        {
            "name": "limerick-writer",
            "description": "Writes a playful limerick about the user's topic.",
            "system_prompt": (
                "You are the limerick writer.\n\n"
                "Write exactly one limerick with five lines.\n"
                "Make it light, rhythmic, and fun, staying on the topic."
            ),
        },
        {
            "name": "quatrain-poet",
            "description": "Writes a four-line poem about the user's topic.",
            "system_prompt": (
                "You are the quatrain poet.\n\n"
                "Write exactly one poem with four lines.\n"
                "Keep it lyrical and compact for easy comparison."
            ),
        },
        {
            "name": "fifty-line-poet",
            "description": "Writes a fifty-line poem about the user's topic.",
            "system_prompt": (
                "You are the fifty-line poet.\n\n"
                "Write exactly one poem with 50 lines.\n"
                "Keep it lyrical, clear, and more expansive than the others."
            ),
        },
    ],
    system_prompt=(
        "You are the poetry coordinator.\n\n"
        "When the user asks for a poem or creative writing, dispatch ALL four "
        "subagents in parallel on the same topic so the frontend can show "
        "four subagents running at once.\n\n"
        "Then return all four results with short labels so the user can "
        "compare the haiku, limerick, quatrain, and fifty-line poem."
    ),
)
