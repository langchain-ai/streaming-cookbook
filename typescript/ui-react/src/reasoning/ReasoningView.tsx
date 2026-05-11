import { useState } from "react";

import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { useMessages, useStream } from "@langchain/react";

import { ThinkingBubble } from "./ThinkingBubble.js";

function AssistantBlocks({
  message,
  isStreaming,
}: {
  message: AIMessage;
  isStreaming: boolean;
}) {
  const reasoningJoined = message.contentBlocks
    .filter(
      (block) =>
        block.type === "reasoning" &&
        (isStreaming || block.reasoning.trim().length > 0)
    )
    .map((block) => (block.type === "reasoning" ? block.reasoning : ""))
    .join("");

  const hasReasoning = reasoningJoined.length > 0 || (isStreaming && !message.text.trim());
  const hasText = message.text.trim().length > 0;
  const isReasoningPhase = isStreaming && !hasText;
  return (
    <div className="reasoning-ai-response">
      {hasReasoning ? (
        <ThinkingBubble
          isStreaming={isReasoningPhase}
          reasoning={reasoningJoined}
        />
      ) : null}
      {hasText ? (
        <div className="reasoning-text-bubble">
          <p>{message.text}</p>
          {isStreaming && hasText ? (
            <span className="reasoning-cursor">▊</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Streams an assistant turn where the model separates reasoning summaries from the final answer,
 * surfaced on {@link AIMessage.contentBlocks} (`reasoning` vs `text`).
 */
export function ReasoningView() {
  const [content, setContent] = useState(
    "Walk me through how you would estimate 17 × 24 mentally, then give the final number."
  );
  const [threadId, setThreadId] = useState<string | null>(null);

  const stream = useStream({
    assistantId: "agent",
    apiUrl: "http://localhost:2024",
    onThreadId: setThreadId,
    threadId,
  });
  const messages = useMessages(stream);

  function handleSubmit() {
    const nextContent = content.trim();
    if (nextContent.length === 0 || stream.isLoading) return;
    void stream.submit({
      messages: [{ content: nextContent, type: "human" }],
    });
    setContent("");
  }

  return (
    <div className="demo-content">
      <section className="hero-card">
        <div className="eyebrow">langgraph streaming</div>
        <div className="hero-copy">
          <h1>Reasoning tokens</h1>
          <p>
            Watch reasoning summaries stream in a collapsible panel while the final answer
            fills in separately—powered by typed{" "}
            <code className="reasoning-inline-code">contentBlocks</code> on{" "}
            <code className="reasoning-inline-code">AIMessage</code>.
          </p>
        </div>
      </section>

      <section className="reconnect-card reasoning-meta-card" aria-label="Thread controls">
        <div>
          <span>Thread</span>
          <strong>{(stream.threadId ?? "new").slice(0, 8)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{stream.isLoading ? "Streaming" : "Idle"}</strong>
        </div>
        <button onClick={() => setThreadId(null)} type="button">
          New thread
        </button>
      </section>

      <section className="chat-card" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            Ask a question that benefits from step-by-step reasoning.
          </div>
        ) : null}

        {messages.map((message, index) => {
          const key = message.id ?? `message-${index}`;
          if (HumanMessage.isInstance(message)) {
            return (
              <div className="message user" key={key}>
                <span>You</span>
                <p>{message.text}</p>
              </div>
            );
          }
          if (AIMessage.isInstance(message)) {
            const isLast = index === messages.length - 1;
            const streaming = stream.isLoading && isLast;
            return (
              <div className="message" key={key}>
                <span>Assistant</span>
                <AssistantBlocks isStreaming={streaming} message={message} />
              </div>
            );
          }
          return null;
        })}

        {messages.length === 0 && !stream.isLoading && stream.error ? (
          <div className="error">
            Could not reach the LangGraph server. Check that <code>pnpm dev</code> is running,
            your OpenAI key is set for the reasoning model, then try again.
          </div>
        ) : null}
      </section>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <textarea
          aria-label="Message"
          onChange={(event) => setContent(event.target.value)}
          placeholder="Ask something that needs visible reasoning…"
          rows={3}
          value={content}
        />
        <button disabled={content.trim() === "" || stream.isLoading} type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
