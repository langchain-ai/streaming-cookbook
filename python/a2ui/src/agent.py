"""LangGraph agent that streams A2UI v0.9 generative-UI messages.

Python port of `typescript/a2ui/src/agent.ts`. Builds a ReAct-style
agent via `langchain.agents.create_agent` and attaches a custom
`StreamTransformer` that:

- Accumulates text from `messages` v3 `content-block-delta` events.
- Drains complete `\\n`-delimited lines from the buffer.
- For every line that starts with ``A2UI:``, parses the trailing JSON
  and pushes it onto a `StreamChannel("a2ui")`.

The frontend (unchanged React app in `typescript/a2ui/`) subscribes to
the auto-forwarded ``custom:a2ui`` channel via `useExtension(stream,
"a2ui")` and renders A2UI surfaces from those events.

The exported symbol is ``agent`` so `langgraph.json` can reference
``./src/agent.py:agent`` (matching the JS sibling).
"""

from __future__ import annotations

import json
from typing import Any

from langchain.agents import create_agent
from langgraph.stream import StreamChannel, StreamTransformer


# URL identifier for the A2UI basic component catalog. The catalog
# provides core components: Card, Button, Text, Image, List, Row,
# Column, etc.
BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json"


# System prompt copied verbatim from `typescript/a2ui/src/agent.ts`.
# Drives all A2UI v0.9 emission rules — keep in sync with the JS
# sibling.
INLINE_SYSTEM_PROMPT = f"""You generate creative A2UI v0.9 interfaces for a React demo.

Answer only with newline-delimited A2UI messages. Every A2UI message must be a
complete JSON object on one line prefixed by "A2UI:". Do not use Markdown fences.
Do not write explanatory prose outside A2UI messages.

Use this exact catalog id for createSurface:
{BASIC_CATALOG_ID}

=== CRITICAL COMPONENT STRUCTURE RULES ===
These rules prevent rendering failures. Follow them exactly:

1. Card uses "child": "singleChildId" (STRING, NOT "children" array).
   - For multiple elements inside a Card, wrap them in a Column or Row first.
   - WRONG: {{"component":"Card","children":["a","b"]}}
   - CORRECT: {{"component":"Card","child":"wrapper"}} + {{"id":"wrapper","component":"Column","children":["a","b"]}}

2. Button uses "child": "labelTextId" (STRING, not "label" property).
   - The child must be a Text component with literal string content.
   - WRONG: {{"component":"Button","label":"Click"}}
   - CORRECT: {{"component":"Button","child":"btnLabel"}} + {{"id":"btnLabel","component":"Text","text":"Click"}}

3. Row, Column, List use "children": ["id1", "id2"] (ARRAY).

4. List templates use: "children": {{"componentId": "templateId", "path": "/dataArrayPath"}}
   - Data at path MUST be a JSON array of objects.
   - Inside templates, use RELATIVE paths (no leading /): {{"path": "fieldName"}}
   - WRONG inside template: {{"path": "/name"}}
   - CORRECT inside template: {{"path": "name"}}

5. Image uses "url": {{"path": "relativeOrAbsolutePath"}}

6. TextField/CheckBox/ChoicePicker use "value": {{"path": "/dataPath"}} for two-way binding.

=== INTERACTION RULES ===
- If the user asks for an app, planner, dashboard, form, checklist, or workflow,
  make it interactive by default.
- Use realistic controls: editable TextField values, CheckBox readiness items,
  ChoicePicker priorities, and buttons for next steps.
- Button action context values can point at input data paths. Include the
  important TextField, CheckBox, and ChoicePicker values in the context so the
  host can respond to what the user typed or selected.
- Include a small visible status Text component near the action buttons bound to
  "/__host/latestAction/message", and initialize that path with a friendly
  "No action yet" message. The host app updates this path when buttons fire.

=== WORKING EXAMPLE - Card with Button ===
A2UI: {{"version":"v0.9","createSurface":{{"surfaceId":"generated-ui","catalogId":"{BASIC_CATALOG_ID}"}}}}
A2UI: {{"version":"v0.9","updateComponents":{{"surfaceId":"generated-ui","components":[{{"id":"root","component":"Card","child":"contentCol"}},{{"id":"contentCol","component":"Column","children":["title","actionBtn"]}},{{"id":"title","component":"Text","text":"Welcome","variant":"h2"}},{{"id":"btnLabel","component":"Text","text":"Get Started"}},{{"id":"actionBtn","component":"Button","child":"btnLabel","variant":"primary","action":{{"event":{{"name":"getStarted","context":{{}}}}}}}}]}}}}
A2UI: {{"version":"v0.9","updateDataModel":{{"surfaceId":"generated-ui","path":"/__host/latestAction/message","value":"No action yet"}}}}

=== PROGRESSIVE STREAMING PATTERN ===
Start with createSurface immediately, then emit small complete updates:
1. First: createSurface
2. Then: updateComponents with root + immediate children
3. Then: updateDataModel to populate data
4. Continue adding components and data in small batches
5. Never emit incomplete JSON - wait for complete objects before sending.

After the initial pattern, invent the layout that best fits the user's request
and stream it in small valid A2UI updates."""


def _unwrap_messages(event: dict[str, Any]) -> Any:
    """Unwrap ``(payload, metadata)`` from a `messages` v3 event."""
    data = event.get("params", {}).get("data")
    if isinstance(data, tuple) and len(data) == 2:
        return data[0]
    return data


def _is_a2ui_message(value: Any) -> bool:
    """Return True if `value` is a v0.9 A2UI message dict.

    Mirrors the JS `isA2UIMessage` type guard: requires
    ``version == "v0.9"`` plus at least one of `createSurface`,
    `updateComponents`, `updateDataModel`, or `deleteSurface`.
    """
    if not isinstance(value, dict):
        return False
    if value.get("version") != "v0.9":
        return False
    return any(
        value.get(key) is not None
        for key in (
            "createSurface",
            "updateComponents",
            "updateDataModel",
            "deleteSurface",
        )
    )


class A2UITransformer(StreamTransformer):
    """Parse ``A2UI:``-prefixed lines out of the streaming model output.

    Buffers `content-block-delta` text chunks, splits on newlines, and
    pushes each valid A2UI v0.9 message to the ``a2ui`` `StreamChannel`.
    The mux exposes the channel remotely as ``custom:a2ui`` for the
    React frontend's `useExtension(stream, "a2ui")` hook.
    """

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self._channel: StreamChannel[dict[str, Any]] = StreamChannel("a2ui")
        self._buffer = ""
        self._sequence = 0

    def init(self) -> dict[str, Any]:
        return {"a2ui": self._channel}

    def _emit(self, message: dict[str, Any]) -> None:
        self._sequence += 1
        # Match the JS `A2UIStreamEvent` shape: `{ message, sequence }`.
        self._channel.push({"message": message, "sequence": self._sequence})

    def _emit_line(self, line: str) -> None:
        trimmed = line.strip()
        if not trimmed.startswith("A2UI:"):
            return
        try:
            parsed = json.loads(trimmed[len("A2UI:") :].strip())
        except json.JSONDecodeError:
            # Partial / malformed JSON is expected while the model is
            # still mid-token; silently skip.
            return
        if _is_a2ui_message(parsed):
            self._emit(parsed)

    def _drain_complete_lines(self) -> None:
        # Split on both LF and CRLF; keep the trailing partial segment
        # (if any) in the buffer.
        normalized = self._buffer.replace("\r\n", "\n")
        parts = normalized.split("\n")
        self._buffer = parts.pop()
        for line in parts:
            self._emit_line(line)

    def process(self, event: dict[str, Any]) -> bool:
        if event.get("method") != "messages":
            return True

        payload = _unwrap_messages(event)
        if not isinstance(payload, dict):
            return True

        evt = payload.get("event")

        if evt == "content-block-delta":
            delta = payload.get("delta") or {}
            if (
                isinstance(delta, dict)
                and delta.get("type") == "text-delta"
            ):
                chunk = delta.get("text") or ""
                if chunk:
                    self._buffer += chunk
                    self._drain_complete_lines()

        elif evt == "message-finish":
            if self._buffer.strip():
                self._emit_line(self._buffer)
                self._buffer = ""

        return True


# Model: the JS sibling uses gpt-5.5; this port uses gpt-4o-mini which
# is reliably available. The system prompt drives behaviour, not the
# specific model.
#
# No user-attached checkpointer: langgraph-api supplies its own
# persistence and rejects user-provided checkpointers for graphs
# exposed via `langgraph.json`.
agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[],
    system_prompt=INLINE_SYSTEM_PROMPT,
    transformers=[A2UITransformer],
)
