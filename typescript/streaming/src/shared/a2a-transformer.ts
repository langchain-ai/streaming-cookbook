/**
 * A2A stream transformer — emits A2A protocol-compliant streaming events.
 *
 * Uses the official `@a2a-js/sdk` types to ensure emitted events satisfy
 * `TaskStatusUpdateEvent` and `TaskArtifactUpdateEvent` shapes.
 *
 * Events are surfaced via a remote {@link StreamChannel} named `"a2a"`:
 *   - In-process consumers iterate `run.extensions.a2a` directly.
 *   - Remote SDK clients subscribe via `thread.subscribe("custom:a2a")`.
 */

import {
  AIMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import type { ProtocolEvent, StreamTransformer } from "@langchain/langgraph";
import { StreamChannel } from "@langchain/langgraph";
import type {
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "@a2a-js/sdk";

type A2AStreamEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

/** LangGraph may emit `[payload, meta]` or a bare protocol dict for `messages`. */
function unpackMessagesPayload(raw: unknown): { payload: unknown } | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    return { payload: raw[0] };
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return { payload: raw };
  }
  return null;
}

/**
 * Interpret LangGraph `messages` channel payloads where `event === "content-block-delta"` (`MessagesData`).
 *
 * Shape follows the **Agent Streaming Protocol** (`agent-protocol/streaming/protocol.cddl`;
 * generated TS in `agent-protocol/streaming/js/protocol.ts`). Each event carries `delta`:
 * **ContentBlockDelta** — append deltas (`text-delta`, `reasoning-delta`, `data-delta`) or
 * **block-delta**, which shallow-merges `fields` onto the active content block (tool-call argument
 * streaming and other merge semantics per the spec).
 *
 * A2A artifacts surface assistant-visible **text** (`text-delta`, plus legacy `{ type: "text", text }`
 * shapes); tool streams carried as `block-delta` (`tool_call_chunk`, `input_json_delta`, …) are skipped.
 */
function interpretContentBlockDelta(data: Record<string, unknown>): {
  skipArtifact: boolean;
  textChunk?: string;
} {
  const delta = data.delta as Record<string, unknown> | undefined;
  if (!delta || typeof delta !== "object") {
    return { skipArtifact: false };
  }

  if (delta.type === "block-delta") {
    const fields = delta.fields as Record<string, unknown> | undefined;
    if (!fields || typeof fields !== "object") {
      return { skipArtifact: false };
    }
    const ft = fields.type as string | undefined;
    if (
      ft === "tool_call_chunk" ||
      ft === "tool_use" ||
      ft === "tool_call" ||
      ft === "input_json_delta"
    ) {
      return { skipArtifact: true };
    }
    if (
      (ft === "text" || ft === "text-delta") &&
      typeof fields.text === "string"
    ) {
      return { skipArtifact: false, textChunk: fields.text };
    }
    return { skipArtifact: false };
  }

  const dt = delta.type as string | undefined;
  if (
    (dt === "text" || dt === "text-delta") &&
    typeof delta.text === "string"
  ) {
    return { skipArtifact: false, textChunk: delta.text };
  }

  return { skipArtifact: false };
}

export const createA2ATransformer = (): StreamTransformer<{
  a2a: StreamChannel<A2AStreamEvent>;
}> => {
  const a2a = StreamChannel.remote<A2AStreamEvent>("a2a");
  let started = false;

  let activeNode: string | undefined;
  let activeRole: string | undefined;
  let isToolCall = false;
  let accumulatedText = "";
  let artifactIndex = 0;

  /** Track which top-level subgraphs have been announced. */
  const announcedNodes = new Set<string>();

  const contextId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  const makeStatusEvent = (
    state: TaskStatusUpdateEvent["status"]["state"],
    text: string,
    final: boolean
  ): TaskStatusUpdateEvent => ({
    kind: "status-update",
    contextId,
    taskId,
    final,
    status: {
      state,
      message: {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text }],
      },
      timestamp: new Date().toISOString(),
    },
  });

  const makeArtifactEvent = (
    text: string,
    lastChunk: boolean
  ): TaskArtifactUpdateEvent => ({
    kind: "artifact-update",
    contextId,
    taskId,
    lastChunk,
    append: !lastChunk,
    artifact: {
      artifactId: `${activeNode ?? "agent"}-response-${artifactIndex}`,
      name: `${activeNode ?? "agent"}-response`,
      parts: [{ kind: "text", text }],
    },
  });

  return {
    init: () => ({ a2a }),

    process(event: ProtocolEvent) {
      if (!started) {
        started = true;
        a2a.push(
          makeStatusEvent("working", "Agent started processing", false)
        );
      }

      const ns = event.params.namespace ?? [];

      if (ns.length >= 1) {
        const segment = ns[0];
        const nodeName = segment.split(":")[0];
        if (!announcedNodes.has(nodeName)) {
          announcedNodes.add(nodeName);
          a2a.push(makeStatusEvent("working", `${nodeName} started`, false));
        }
      }

      if (event.method === "messages") {
        const unpacked = unpackMessagesPayload(event.params.data);
        if (!unpacked) {
          return true;
        }

        const { payload } = unpacked;

        if (AIMessageChunk.isInstance(payload)) {
          return true;
        }

        if (AIMessage.isInstance(payload)) {
          if (payload.tool_calls?.length) {
            return true;
          }
          const segment = ns[0] ?? "agent";
          activeNode = segment.split(":")[0];
          const text = payload.text.trim();
          if (text.length > 0) {
            accumulatedText = text;
            a2a.push(makeArtifactEvent(text, true));
            artifactIndex += 1;
          }
          accumulatedText = "";
          activeNode = undefined;
          activeRole = undefined;
          return true;
        }

        if (typeof payload !== "object" || payload === null) {
          return true;
        }

        const data = payload as Record<string, unknown>;

        if (data.event === "message-start") {
          const segment = ns[0] ?? "agent";
          activeNode = segment.split(":")[0];
          const roleRaw = data.role as string | undefined;
          activeRole =
            roleRaw ??
            (typeof data.tool_call_id === "string" ? "tool" : "ai");
          accumulatedText = "";
          isToolCall = false;
        }

        if (data.event === "content-block-start") {
          const cb = data.content as Record<string, unknown> | undefined;
          if (
            cb?.type === "tool_call_chunk" ||
            cb?.type === "tool_call" ||
            cb?.type === "tool_use"
          ) {
            isToolCall = true;
          }
        }

        if (
          activeRole === "ai" &&
          !isToolCall &&
          data.event === "content-block-delta"
        ) {
          const { skipArtifact, textChunk } = interpretContentBlockDelta(data);
          if (!skipArtifact && textChunk !== undefined) {
            accumulatedText += textChunk;
            a2a.push(makeArtifactEvent(textChunk, false));
          }
        }

        if (
          activeRole === "ai" &&
          data.event === "message-finish" &&
          accumulatedText.length > 0
        ) {
          a2a.push(makeArtifactEvent(accumulatedText, true));
          artifactIndex += 1;
          accumulatedText = "";
          activeNode = undefined;
          activeRole = undefined;
        }

        if (data.event === "message-finish") {
          isToolCall = false;
        }
      }

      return true;
    },

    finalize() {
      a2a.push(
        makeStatusEvent("completed", "Agent finished successfully", true)
      );
    },

    fail(err) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : String(err);

      a2a.push(makeStatusEvent("failed", message, true));
    },
  };
};
