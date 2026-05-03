import { useState } from "react";

import { useReconnectDemo } from "./reconnect.js";

export function App() {
  const [content, setContent] = useState(
    "Explain how LangGraph streaming recovers after a browser refresh."
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const {
    didReconnect,
    error,
    isLoading,
    messageRows,
    messages,
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
        {theme === "dark" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              className="moon-shape"
              d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
            />
          </svg>
        )}
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

        {messages.length === 0 ? (
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

        {messages.length === 0 && !isLoading && error ? (
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
    </main>
  );
}
