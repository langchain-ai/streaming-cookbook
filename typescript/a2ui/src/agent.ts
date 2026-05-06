/**
 * LangGraph agent configuration for generating A2UI v0.9 interfaces.
 *
 * This module defines a streaming agent that produces A2UI JSON messages
 * through a custom transformer. The agent uses GPT-5.5 to generate UI
 * descriptions that are parsed and rendered by the React frontend.
 *
 * @module agent
 * @see {@link https://a2ui.org/specification/v0_9} for A2UI specification
 */

import {
  MemorySaver,
  StreamChannel,
  type ProtocolEvent,
  type StreamTransformer,
} from "@langchain/langgraph";
import type { A2uiMessage } from "@a2ui/web_core/v0_9";
import { createAgent } from "langchain";

/**
 * Checkpointer for maintaining conversation state across agent runs.
 * Uses in-memory storage for this demo implementation.
 */
const checkpointer = new MemorySaver();

/**
 * URL identifier for the A2UI basic component catalog.
 * This catalog provides core components: Card, Button, Text, Image, List, Row, Column, etc.
 */
const BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json";

/**
 * System prompt that guides the LLM to generate valid A2UI v0.9 messages.
 *
 * Contains detailed instructions for:
 * - Message format (newline-delimited JSON prefixed with "A2UI:")
 * - Component structure rules (Card, Button, List templates)
 * - Data binding patterns (relative vs absolute paths)
 * - Streaming best practices (small batches, valid JSON only)
 * - The v0.9 basic catalog ID for surface creation
 *
 * This inline prompt approach (Option A) is recommended for its simplicity
 * and effectiveness compared to schema manager generated prompts.
 */
const INLINE_SYSTEM_PROMPT = `You generate creative A2UI v0.9 interfaces for a React demo.

Answer only with newline-delimited A2UI messages. Every A2UI message must be a
complete JSON object on one line prefixed by "A2UI:". Do not use Markdown fences.
Do not write explanatory prose outside A2UI messages.

Use this exact catalog id for createSurface:
${BASIC_CATALOG_ID}

=== CRITICAL COMPONENT STRUCTURE RULES ===
These rules prevent rendering failures. Follow them exactly:

1. Card uses "child": "singleChildId" (STRING, NOT "children" array).
   - For multiple elements inside a Card, wrap them in a Column or Row first.
   - WRONG: {"component":"Card","children":["a","b"]}
   - CORRECT: {"component":"Card","child":"wrapper"} + {"id":"wrapper","component":"Column","children":["a","b"]}

2. Button uses "child": "labelTextId" (STRING, not "label" property).
   - The child must be a Text component with literal string content.
   - WRONG: {"component":"Button","label":"Click"}
   - CORRECT: {"component":"Button","child":"btnLabel"} + {"id":"btnLabel","component":"Text","text":"Click"}

3. Row, Column, List use "children": ["id1", "id2"] (ARRAY).

4. List templates use: "children": {"componentId": "templateId", "path": "/dataArrayPath"}
   - Data at path MUST be a JSON array of objects.
   - Inside templates, use RELATIVE paths (no leading /): {"path": "fieldName"}
   - WRONG inside template: {"path": "/name"}
   - CORRECT inside template: {"path": "name"}

5. Image uses "url": {"path": "relativeOrAbsolutePath"}

6. TextField/CheckBox/ChoicePicker use "value": {"path": "/dataPath"} for two-way binding.

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
A2UI: {"version":"v0.9","createSurface":{"surfaceId":"generated-ui","catalogId":"${BASIC_CATALOG_ID}"}}
A2UI: {"version":"v0.9","updateComponents":{"surfaceId":"generated-ui","components":[{"id":"root","component":"Card","child":"contentCol"},{"id":"contentCol","component":"Column","children":["title","actionBtn"]},{"id":"title","component":"Text","text":"Welcome","variant":"h2"},{"id":"btnLabel","component":"Text","text":"Get Started"},{"id":"actionBtn","component":"Button","child":"btnLabel","variant":"primary","action":{"event":{"name":"getStarted","context":{}}}}]}}
A2UI: {"version":"v0.9","updateDataModel":{"surfaceId":"generated-ui","path":"/__host/latestAction/message","value":"No action yet"}}

=== PROGRESSIVE STREAMING PATTERN ===
Start with createSurface immediately, then emit small complete updates:
1. First: createSurface
2. Then: updateComponents with root + immediate children
3. Then: updateDataModel to populate data
4. Continue adding components and data in small batches
5. Never emit incomplete JSON - wait for complete objects before sending.

After the initial pattern, invent the layout that best fits the user's request
and stream it in small valid A2UI updates.`;

/**
 * Event structure for A2UI messages streamed from the LangGraph agent.
 *
 * Contains the parsed A2UI message and a sequence number for ordering.
 * These events flow through the "a2ui" stream channel to the React client.
 */
export type A2UIStreamEvent = {
  message: A2uiMessage;
  sequence: number;
};

/**
 * Type guard that validates if a value conforms to the A2uiMessage structure.
 *
 * Checks for required version field ("v0.9") and at least one valid message type:
 * createSurface, updateComponents, updateDataModel, or deleteSurface.
 *
 * @param value - The unknown value to check.
 * @returns True if the value is a valid A2uiMessage.
 */
function isA2UIMessage(value: unknown): value is A2uiMessage {
  if (typeof value !== "object" || value == null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === "v0.9" &&
    (candidate.createSurface != null ||
      candidate.updateComponents != null ||
      candidate.updateDataModel != null ||
      candidate.deleteSurface != null)
  );
}

/**
 * Type guard for text-delta event structure.
 */
function isTextDelta(delta: unknown): delta is { type: "text-delta"; text: string } {
  return (
    typeof delta === "object" &&
    delta !== null &&
    "type" in delta &&
    delta.type === "text-delta" &&
    "text" in delta &&
    typeof (delta as Record<string, unknown>).text === "string"
  );
}

/**
 * Type guard for content event structure.
 */
function isContentEvent(content: unknown): content is { type: "text"; text: string } {
  return (
    typeof content === "object" &&
    content !== null &&
    "type" in content &&
    content.type === "text" &&
    "text" in content &&
    typeof (content as Record<string, unknown>).text === "string"
  );
}

/**
 * Extracts text delta from various possible event data structures.
 *
 * Supports multiple message formats:
 * - LangGraph text-delta events: `{ delta: { type: "text-delta", text: "..." } }`
 * - Content events: `{ content: { type: "text", text: "..." } }`
 * - Direct text field: `{ text: "..." }`
 *
 * @param data - Event data from the protocol stream.
 * @returns The extracted text string, or empty string if not found.
 */
function getTextDelta(data: Record<string, unknown>): string {
  if ("delta" in data && isTextDelta(data.delta)) {
    return data.delta.text;
  }

  if ("content" in data && isContentEvent(data.content)) {
    return data.content.text;
  }

  return typeof data.text === "string" ? data.text : "";
}

/**
 * Factory function that creates a stream transformer for parsing A2UI messages.
 *
 * This transformer buffers incoming text chunks, splits them by newlines,
 * and parses each line as a potential A2UI message. Messages prefixed with
 * "A2UI:" are extracted, parsed as JSON, and emitted to the "a2ui" channel.
 *
 * Handles partial lines by maintaining a buffer across chunks until complete
 * lines are available. At message finish, any remaining buffered content is flushed.
 *
 * @returns A StreamTransformer that exposes the "a2ui" channel for A2UI events.
 */
const createA2UITransformer = (): StreamTransformer<{
  a2ui: StreamChannel<A2UIStreamEvent>;
}> => {
  /**
   * Remote stream channel for emitting parsed A2UI events to the client.
   */
  const a2ui = StreamChannel.remote<A2UIStreamEvent>("a2ui");

  /**
   * Buffer for accumulating partial text chunks until complete lines are available.
   */
  let buffer = "";

  /**
   * Monotonically increasing sequence number for ordering A2UI events.
   */
  let sequence = 0;

  /**
   * Emits a valid A2UI message to the stream channel with an incremented sequence number.
   * @param message - The parsed A2uiMessage to emit.
   */
  const emit = (message: A2uiMessage) => {
    sequence += 1;
    a2ui.push({ message, sequence });
  };

  /**
   * Parses a single line for A2UI message prefix and emits valid messages.
   *
   * Lines starting with "A2UI:" have their JSON content extracted and parsed.
   * Invalid JSON or partial messages are silently ignored (expected during streaming).
   *
   * @param line - A single line of text from the stream.
   */
  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("A2UI:")) return;

    try {
      const parsed = JSON.parse(trimmed.slice("A2UI:".length).trim());
      if (isA2UIMessage(parsed)) emit(parsed);
    } catch {
      // Partial lines are expected while the model is still generating JSON.
    }
  };

  /**
   * Drains complete lines from the buffer, leaving any partial line for the next chunk.
   *
   * Splits the buffer on line endings (CRLF or LF), processes all complete lines
   * through emitLine, and retains the last (potentially incomplete) segment in buffer.
   */
  const drainCompleteLines = () => {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) emitLine(line);
  };

  return {
    /**
     * Initializes the transformer and exposes available channels.
     * @returns An object with the "a2ui" stream channel for clients to consume.
     */
    init: () => ({ a2ui }),

    /**
     * Processes protocol events from the LangGraph stream.
     *
     * Handles two event types:
     * - "content-block-delta": Appends text to buffer and drains complete lines
     * - "message-finish": Flushes any remaining buffered content
     *
     * @param event - The protocol event from the stream.
     * @returns True to continue processing subsequent events.
     */
    process(event: ProtocolEvent) {
      if (event.method !== "messages") return true;

      const data = event.params.data as Record<string, unknown>;
      if (data.event === "content-block-delta") {
        const text = getTextDelta(data);
        if (text.length > 0) {
          buffer += text;
          drainCompleteLines();
        }
      }

      if (data.event === "message-finish" && buffer.trim().length > 0) {
        emitLine(buffer);
        buffer = "";
      }

      return true;
    },
  };
};

/**
 * Agent state type. This agent maintains no custom state - surfaces are
 * ephemeral and recreated on each run.
 */
export type A2UIAgentState = Record<string, never>;

/**
 * Agent update type. The agent accepts human messages as input.
 */
export type A2UIAgentUpdate =
  | { type: "human"; content: string }
  | { type: "ai"; content: string };

/**
 * Default LangGraph agent configured for A2UI generative UI streaming.
 *
 * Uses Option A (inline system prompt) which is the recommended default
 * for its simplicity and effectiveness. The agent:
 *
 * - Runs on GPT-5.5 via OpenAI
 * - Uses in-memory checkpointing for conversation state
 * - Applies the A2UI transformer to parse generative UI messages
 * - Emits structured A2UI v0.9 messages on the "a2ui" channel
 *
 * @see {@link https://langchain-ai.github.io/langgraphjs/concepts/agent/} for createAgent documentation
 */
export const agent = createAgent({
  checkpointer,
  model: "openai:gpt-5.5",
  streamTransformers: [createA2UITransformer],
  systemPrompt: INLINE_SYSTEM_PROMPT,
});
