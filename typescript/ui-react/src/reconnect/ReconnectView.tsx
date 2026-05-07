import { useState } from "react";

import { useReconnectDemo } from "./ReconnectProvider.js";

/**
 * ReconnectDemoView
 *
 * Interactive demo of the reconnect/replay behavior in the Agent Streaming
 * Protocol. Users can start a streamed run, refresh the page mid-stream, and
 * watch the UI reattach to the same thread without losing messages.
 *
 * Key concepts demonstrated:
 * - Thread persistence via sessionStorage
 * - Replay labeling (distinguishing history from live tokens)
 * - Transport-level reconnection without server-side changes
 */
export function ReconnectView() {
  const [content, setContent] = useState(
    "Explain how LangGraph streaming recovers after a browser refresh."
  );
  const {
    didReconnect,
    error,
    isLoading,
    messageRows,
    refreshMidStream,
    resetThread,
    submitPrompt,
    threadId,
  } = useReconnectDemo();

  function handleSubmit() {
    const nextContent = content.trim();
    if (nextContent.length === 0 || isLoading) return;

    submitPrompt(nextContent);
    setContent("");
  }

  return (
    <div className="demo-content">
      <section className="hero-card">
        <div className="eyebrow">langgraph streaming</div>
        <div className="hero-copy">
          <h1>React Reconnect</h1>
          <p>
            Start a streamed LangGraph run, refresh this page while it is still
            loading, and watch the React SDK reattach to the same thread.
          </p>
        </div>
      </section>

      <section className="reconnect-card" aria-label="Reconnect controls">
        <div>
          <span>Thread</span>
          <strong>{threadId.slice(0, 8)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{isLoading ? "Streaming" : "Idle"}</strong>
        </div>
        <div>
          <span>Reconnect</span>
          <strong>{didReconnect ? "Restored" : "Ready"}</strong>
        </div>
        <button
          disabled={!isLoading}
          onClick={refreshMidStream}
          type="button"
        >
          Refresh mid-stream
        </button>
        <button onClick={resetThread} type="button">
          New thread
        </button>
      </section>

      <section className="chat-card" aria-label="Chat messages">
        {didReconnect ? (
          <div className="reconnect-banner">
            Reconnected to the same thread. Messages marked "replayed" were
            already visible before refresh; the rest arrived after the tab came
            back.
          </div>
        ) : null}

        {messageRows.length === 0 ? (
          <div className="empty-state">Start the run, then refresh mid-stream.</div>
        ) : null}

        {messageRows.map(({ id, message, replayed }) => {
          return (
            <div
              className={`message ${message.type === "human" ? "user" : ""}`}
              key={id}
            >
              <span>{message.type === "human" ? "You" : "Assistant"}</span>
              <p>{message.text}</p>
              {didReconnect ? (
                <small>
                  {replayed ? "replayed after refresh" : "live after reconnect"}
                </small>
              ) : null}
            </div>
          );
        })}

        {messageRows.length === 0 && !isLoading && error ? (
          <div className="error">
            Could not reach the LangGraph server. Check that <code>pnpm dev</code>{" "}
            is running, then try again.
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
          placeholder="Ask the agent to explain reconnect and replay..."
          rows={3}
          value={content}
        />
        <button disabled={content.trim() === "" || isLoading} type="submit">
          Start streamed run
        </button>
      </form>
    </div>
  );
}
