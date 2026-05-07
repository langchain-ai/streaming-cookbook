export function BranchSwitcher({
  metadata,
  onSelectBranch,
}: {
  metadata: {
    branch?: string;
    branchOptions?: string[];
    parentCheckpointId?: string;
  };
  onSelectBranch: (branch: string) => void;
}) {
  const options = metadata.branchOptions ?? [];
  if (options.length === 0) {
    return (
      <span className="branch-pill">
        {metadata.parentCheckpointId ? "main path" : "checkpoint pending"}
      </span>
    );
  }

  const currentBranch = metadata.branch ?? "";
  const currentIndex = Math.max(0, options.indexOf(currentBranch));
  const total = options.length;
  const previousBranch = options[(currentIndex - 1 + total) % total];
  const nextBranch = options[(currentIndex + 1) % total];

  return (
    <div className="branch-switcher">
      <button
        aria-label="Previous branch"
        className="branch-option"
        disabled={total < 2}
        onClick={() => onSelectBranch(previousBranch)}
        type="button"
      >
        {"<"}
      </button>
      <span className="branch-pill">
        Branch {currentIndex + 1} / {total}
      </span>
      <button
        aria-label="Next branch"
        className="branch-option"
        disabled={total < 2}
        onClick={() => onSelectBranch(nextBranch)}
        type="button"
      >
        {">"}
      </button>
    </div>
  );
}
