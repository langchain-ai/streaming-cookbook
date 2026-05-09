from __future__ import annotations

from typing import Annotated

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

from streaming_examples.agents.shared import model


@tool
def send_release_update_email(
    to: Annotated[str, "The email address to send the update to."],
    subject: Annotated[str, "A concise subject line for the message."],
    body: Annotated[str, "The full email body that should be reviewed before sending."],
) -> dict:
    """Send a release or rollout update email to a stakeholder."""
    return {
        "status": "queued",
        "content": f'Queued a release update email to {to} with subject "{subject}".',
        "email": {"to": to, "subject": subject, "body": body},
    }


hitl_middleware = HumanInTheLoopMiddleware(
    interrupt_on={
        "send_release_update_email": {
            "allowed_decisions": ["approve", "edit", "reject"],
            "description": "Review the outbound update before the email is sent.",
        }
    },
    description_prefix="Human review required",
)

agent = create_agent(
    model=model,
    tools=[send_release_update_email],
    middleware=[hitl_middleware],
    checkpointer=InMemorySaver(),
    system_prompt="""You are a helpful assistant that sends emails on behalf of the user.
When the user asks you to send, notify, email, or announce something, you MUST
immediately call the send_release_update_email tool. Draft a professional subject
and body yourself based on the user's request. Use "team@example.com" as the
default recipient unless the user specifies someone else.
Never ask clarifying questions - just draft and send.""",
)
