"""Human-in-the-loop agent using `create_agent` +
`HumanInTheLoopMiddleware`.

The agent exposes a single `send_release_update_email` tool configured
to interrupt before execution. When the model calls that tool the run
pauses, surfaces the pending action via an interrupt, and waits for a
decision (approve / edit / reject) before continuing.

Used by `human_in_the_loop/` examples to demonstrate the same
interrupt/resume lifecycle in-process (via `Command(resume=...)`) and
remotely (via `thread.input.respond(...)`).
"""

from __future__ import annotations

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import BaseModel, Field

from .shared import model


class _SendArgs(BaseModel):
    to: str = Field(description="The email address to send the update to.")
    subject: str = Field(description="A concise subject line.")
    body: str = Field(description="The full email body to review before sending.")


@tool("send_release_update_email", args_schema=_SendArgs)
def send_release_update_email(to: str, subject: str, body: str) -> dict:
    """Send a release or rollout update email to a stakeholder.
    Requires human approval before dispatch.
    """
    return {
        "status": "queued",
        "content": (
            f'Queued a release update email to {to} with subject "{subject}".'
        ),
        "email": {"to": to, "subject": subject, "body": body},
    }


_hitl_middleware = HumanInTheLoopMiddleware(
    interrupt_on={
        "send_release_update_email": {
            "allowed_decisions": ["approve", "edit", "reject"],
            "description": "Review the outbound update before the email is sent.",
        },
    },
    description_prefix="Human review required",
)

agent = create_agent(
    model=model,
    tools=[send_release_update_email],
    middleware=[_hitl_middleware],
    checkpointer=InMemorySaver(),
    system_prompt=(
        "You are a helpful assistant that sends emails on behalf of the user.\n"
        "When the user asks you to send, notify, email, or announce something,\n"
        "you MUST immediately call the send_release_update_email tool. Draft a\n"
        'professional subject and body yourself based on the user\'s request.\n'
        'Use "team@example.com" as the default recipient unless specified.\n'
        "Never ask clarifying questions — just draft and send."
    ),
)
