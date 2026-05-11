import { useState } from "react";

export function ThinkingBubble({
  reasoning,
  isStreaming,
}: {
  reasoning: string;
  isStreaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewLength = 120;
  const preview =
    reasoning.length > previewLength
      ? `${reasoning.slice(0, previewLength)}…`
      : reasoning;

  return (
    <div className="thinking-bubble">
      <button
        aria-controls="thinking-panel"
        aria-expanded={expanded}
        className="thinking-header"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span aria-hidden className="thinking-icon">
          {isStreaming ? <span className="thinking-spinner" /> : "💭"}
        </span>
        <span className="thinking-label">
          {isStreaming
            ? reasoning.length > 0
              ? `Thinking (${reasoning.length} chars)`
              : "Thinking…"
            : `Thought process (${reasoning.length} chars)`}
        </span>
        <span className={`thinking-chevron ${expanded ? "expanded" : ""}`}>
          ▶
        </span>
      </button>

      {expanded ? (
        <div className="thinking-content" id="thinking-panel">
          <pre>{reasoning}</pre>
        </div>
      ) : null}

      {!expanded && reasoning.length > 0 ? (
        <div className="thinking-preview">{preview}</div>
      ) : null}
    </div>
  );
}
