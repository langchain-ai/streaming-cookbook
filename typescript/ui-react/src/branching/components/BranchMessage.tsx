import { BaseMessage } from "@langchain/core/messages";

import { BranchSwitcher } from "./BranchSwitcher.js";
import { useBranchingMessageMetadata } from "../BranchingProvider.js";

export function BranchingMessage({
  editingId,
  isLoading,
  message,
  onCancelEdit,
  onEdit,
  onRegenerate,
  onSelectBranch,
  setEditingId,
  index,
}: {
  editingId: string | null;
  isLoading: boolean;
  message: BaseMessage;
  onCancelEdit: () => void;
  onEdit: (checkpointId: string | undefined, content: string) => void;
  onRegenerate: (checkpointId: string | undefined) => void;
  onSelectBranch: (branch: string) => void;
  setEditingId: (id: string | null) => void;
  index: number;
}) {
  const metadata = useBranchingMessageMetadata(message.id);
  const isHuman = message.type === "human";
  const isEditing = editingId === message.id;

  if (isEditing) {
    return (
      <form
        className="message edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const nextContent = String(data.get("content") ?? "").trim();
          if (nextContent) onEdit(metadata.parentCheckpointId, nextContent);
        }}
      >
        <textarea defaultValue={message.text} name="content" rows={3} />
        <div className="edit-actions">
          <button className="secondary" onClick={onCancelEdit} type="button">
            Cancel
          </button>
          <button disabled={isLoading || !metadata.parentCheckpointId} type="submit">
            Save fork
          </button>
        </div>
        <small className="edit-hint">
          Editing forks from this message's parent checkpoint.
        </small>
      </form>
    );
  }

  return (
    <div className={`message ${isHuman ? "user" : ""}`}>
      <div className="message-header">
        <span>{isHuman ? "You" : "Assistant"}</span>
        <div className="message-actions">
          <BranchSwitcher metadata={metadata} onSelectBranch={onSelectBranch} />
          {isHuman ? (
            <button
              className="edit-btn"
              disabled={isLoading || !metadata.parentCheckpointId}
              onClick={() => setEditingId(message.id!)}
              type="button"
            >
              Edit
            </button>
          ) : (
            <button
              className="regenerate-btn"
              disabled={isLoading || !metadata.parentCheckpointId || index === 0}
              onClick={() => onRegenerate(metadata.parentCheckpointId)}
              type="button"
              title="Generate a new response to the same question"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>
      <p>{message.text}</p>
    </div>
  );
}
