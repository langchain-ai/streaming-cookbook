import { useEffect, useMemo, useState } from "react";

import { HumanMessage, type AIMessage, type BaseMessage } from "langchain";
import {
  HttpAgentServerAdapter,
  StreamProvider,
  useStreamContext,
} from "@langchain/react";

import {
  createThreadId,
  ensureThreadReady,
  readThreadId,
} from "./threads.js";

const API_URL = `${window.location.origin}/api`;

const EXAMPLE_PROMPT =
  "Search the web for LangGraph streaming, then calculate 42 * 17.";

function messageLabel(message: {
  type: string;
  name?: string;
}) {
  if (message.type === "human") return "You";
  if (message.type === "tool") return `Tool · ${message.name ?? "result"}`;
  if (message.type === "ai") return "Assistant";
  return message.type;
}

function formatToolArgs(args: Record<string, unknown>) {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  if (entries.length === 1) return String(entries[0]?.[1] ?? "");
  return JSON.stringify(args);
}

function summarizeToolCalls(messages: BaseMessage[]) {
  const resultIds = new Set<string>();
  for (const message of messages) {
    if (message.type !== "tool" || !("tool_call_id" in message)) continue;
    const id = message.tool_call_id;
    if (typeof id === "string") resultIds.add(id);
  }

  let count = 0;
  let running = 0;
  for (const message of messages) {
    if (message.type !== "ai" || !("tool_calls" in message)) continue;
    const toolCalls = message.tool_calls;
    if (!Array.isArray(toolCalls)) continue;
    for (const call of toolCalls) {
      count += 1;
      const id = call.id;
      if (typeof id === "string" && !resultIds.has(id)) running += 1;
    }
  }
  return { count, running };
}

function AppShell({
  threadId,
  onNewThread,
  threadWasReset,
}: {
  threadId: string;
  onNewThread: () => void;
  threadWasReset: boolean;
}) {
  const stream = useStreamContext();
  const [content, setContent] = useState(EXAMPLE_PROMPT);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const messages = useMemo(
    () => stream.messages.filter((message) => message != null),
    [stream.messages]
  );

  const { count: toolCallCount, running: activeToolCalls } = useMemo(
    () => summarizeToolCalls(messages),
    [messages]
  );

  function handleSubmit() {
    const nextContent = content.trim();
    if (nextContent.length === 0 || stream.isLoading) return;

    setContent("");
    void stream.submit({
      messages: [new HumanMessage(nextContent)],
    });
  }

  return (
    <main className={`chat-shell ${theme === "light" ? "light" : ""}`}>
      <button
        aria-label={
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        className="theme-toggle"
        onClick={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
        type="button"
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>

      <section className="hero-card">
        <div className="framework-logo" aria-label="React logo" role="img">
          <svg viewBox="-11.5 -10.23174 23 20.46348">
            <circle cx="0" cy="0" fill="currentColor" r="2.05" />
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <ellipse rx="11" ry="4.2" />
              <ellipse rx="11" ry="4.2" transform="rotate(60)" />
              <ellipse rx="11" ry="4.2" transform="rotate(120)" />
            </g>
          </svg>
        </div>
        <div className="eyebrow">python custom transport</div>
        <div className="hero-copy">
          <h1>React + LocalThreadSession</h1>
          <p>
            Each browser tab keeps its own thread id. Watch assistant tokens and
            tool calls stream over <code>messages</code> and <code>tools</code>{" "}
            channels via <code>InMemorySaver</code> checkpoints at{" "}
            <code>/threads/&lt;id&gt;/…</code>.
          </p>
        </div>
      </section>

      {threadWasReset ? (
        <section className="notice-card" aria-live="polite">
          Server memory was cleared. Started a fresh thread for this tab.
        </section>
      ) : null}

      <section className="meta-card" aria-label="Stream status">
        <div>
          <span>Thread</span>
          <strong>{threadId.slice(0, 8)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{stream.isLoading ? "Streaming" : "Idle"}</strong>
        </div>
        <div>
          <span>Tool calls</span>
          <strong>
            {toolCallCount}
            {activeToolCalls > 0 ? ` (${activeToolCalls} running)` : ""}
          </strong>
        </div>
        <div className="meta-actions">
          <button onClick={onNewThread} type="button">
            New thread
          </button>
        </div>
      </section>

      <section className="chat-card" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            Send the example prompt to stream assistant tokens, tool calls, and
            tool results from the Python backend.
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div
            className={`message ${message.type === "human" ? "user" : ""} ${message.type === "tool" ? "tool" : ""
              }`}
            key={message.id ?? index}
          >
            <span>{messageLabel(message)}</span>
            {message.type === "ai" &&
              (message as AIMessage).tool_calls &&
              (message as AIMessage).tool_calls!.length > 0 ? (
              <ul className="tool-call-list">
                {(message as AIMessage).tool_calls!.map((toolCall, toolIndex) => (
                  <li key={toolCall.id ?? `${index}-${toolIndex}`}>
                    <strong>{toolCall.name}</strong>
                    {formatToolArgs(toolCall.args as Record<string, unknown>)
                      ? `(${formatToolArgs(toolCall.args as Record<string, unknown>)})`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {message.text ? <p>{message.text}</p> : null}
          </div>
        ))}

        {messages.length === 0 && !stream.isLoading && stream.error ? (
          <div className="error">
            Could not reach the Python protocol server. Start it with{" "}
            <code>uv run python src/main.py</code>, then try again.
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
          placeholder="Ask for a web search, a calculation, or both..."
          rows={3}
          value={content}
        />
        <button
          disabled={content.trim() === "" || stream.isLoading}
          type="submit"
        >
          Send
        </button>
      </form>
    </main>
  );
}

export function App() {
  const [threadId, setThreadId] = useState(readThreadId);
  const [threadReady, setThreadReady] = useState(false);
  const [threadWasReset, setThreadWasReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setThreadReady(false);
    setThreadWasReset(false);
    void ensureThreadReady(API_URL, threadId)
      .then((result) => {
        if (cancelled) return;
        if (result.threadId !== threadId) {
          setThreadId(result.threadId);
        }
        setThreadWasReset(result.reset);
        setThreadReady(true);
      })
      .catch(() => {
        if (!cancelled) setThreadReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const transport = useMemo(
    () =>
      new HttpAgentServerAdapter({
        apiUrl: API_URL,
        threadId,
        paths: {
          commands: `/threads/${threadId}/commands`,
          stream: `/threads/${threadId}/stream`,
        },
      }),
    [threadId]
  );

  function handleNewThread() {
    const nextThreadId = createThreadId();
    setThreadId(nextThreadId);
  }

  if (!threadReady) {
    return (
      <main className="chat-shell">
        <div className="empty-state">
          Preparing thread {threadId.slice(0, 8)}…
        </div>
      </main>
    );
  }

  return (
    <StreamProvider
      key={threadId}
      threadId={threadId}
      transport={transport}
    >
      <AppShell
        onNewThread={handleNewThread}
        threadId={threadId}
        threadWasReset={threadWasReset}
      />
    </StreamProvider>
  );
}
