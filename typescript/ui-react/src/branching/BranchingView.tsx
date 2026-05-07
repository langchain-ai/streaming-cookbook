import { useState } from "react";

import { useBranchingDemo } from "./BranchingProvider.js";
import { BranchingMessage } from "./components/index.js";

/**
 * BranchingDemoView
 *
 * Interactive demo of conversation branching using the Agent Streaming Protocol.
 * Unlike legacy useStream which hard-codes a fetchStateHistory limit, this demo
 * treats branches as explicit lineage forks with stable identities.
 *
 * Key concepts demonstrated:
 * - Branches are explicit forks, not implicit history entries
 * - Editing any message creates a new branch from that point
 * - Regenerating an assistant response also creates a branch (same input, new output)
 * - Branch switching is state navigation, not stream re-drive
 * - The protocol supports checkpoint commands (run.fork, run.resume)
 *
 * How to use:
 * 1. Have a conversation with the agent
 * 2. Click "Edit" on any of your previous human messages to change the question
 * 3. Click "Regenerate" on any assistant message to get a different answer
 * 4. A new branch is created - you can switch between the original and the fork
 */
export function BranchingView() {
  const [content, setContent] = useState(
    "What are three interesting facts about neural networks?"
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    branches,
    activeBranch,
    switchBranch,
    forkFrom,
    submitPrompt,
    isLoading,
    error,
    messages,
  } = useBranchingDemo();

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
          <h1>React Branching</h1>
          <p>
            Edit any message or regenerate any response to fork the conversation.
            The Agent Streaming Protocol treats branches as explicit checkpoint
            operations, not implicit history limits.
          </p>
        </div>
      </section>

      {/* Status Card */}
      <section className="reconnect-card" aria-label="Status">
        <div>
          <span>Active Branch</span>
          <strong>{activeBranch || "main"}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{isLoading ? "Streaming" : "Idle"}</strong>
        </div>
        <div>
          <span>Messages</span>
          <strong>{messages.length}</strong>
        </div>
        <div>
          <span>Branches</span>
          <strong>{branches.length}</strong>
        </div>
      </section>

      {/* Chat Messages */}
      <section className="chat-card" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            Start a conversation, then edit any message to create a branch.
          </div>
        ) : null}

        {messages.map((message, index) => (
          <BranchingMessage

            index={index}
            editingId={editingId}
            isLoading={isLoading}
            message={message}
            onCancelEdit={() => setEditingId(null)}
            onEdit={(checkpointId, nextContent) => {
              setEditingId(null);
              forkFrom(checkpointId, nextContent);
            }}
            onRegenerate={(checkpointId) => forkFrom(checkpointId)}
            onSelectBranch={switchBranch}
            setEditingId={setEditingId}
          />
        ))}

        {messages.length === 0 && !isLoading && error ? (
          <div className="error">
            Could not reach the LangGraph server. Check that <code>pnpm dev</code>{" "}
            is running, then try again.
          </div>
        ) : null}
      </section>

      {/* Composer */}
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
          placeholder="Ask a question, then edit any message to branch..."
          rows={3}
          value={content}
        />
        <button disabled={content.trim() === "" || isLoading} type="submit">
          Send {activeBranch ? `in "${activeBranch}"` : ""}
        </button>
      </form>
    </div>
  );
}
