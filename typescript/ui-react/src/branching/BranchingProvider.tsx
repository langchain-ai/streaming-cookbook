import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { BaseMessage, ToolMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  useChannel,
  useMessageMetadata,
  useMessages,
  useStream,
} from "@langchain/react";
import type { CheckpointsEvent } from "@langchain/protocol";
import type { ThreadState } from "@langchain/langgraph-sdk";
import { getBranchContext } from "@langchain/langgraph-sdk/ui";

/** Thread states used by branching; values constrained so `getBranchContext` accepts this array. */
type ThreadHistoryState = ThreadState<Record<string, unknown>>;

/**
 * A Branch represents a conversation lineage.
 */
export type Branch = {
  /** Checkpoint ID that identifies this branch point */
  checkpointId: string;
  /** Human-readable label */
  label: string;
};

export interface BranchMetadata {
  /**
   * Parent checkpoint ID for the historical state where this message first appears.
   * Used to relate displayed messages to the checkpoint tree returned by LangGraph history.
   */
  parentCheckpointId?: string;
  /**
   * Human-readable branch name for the checkpoint associated with this message,
   * as computed by LangGraph branching context (see {@link getBranchContext}).
   */
  branch?: string;
  /**
   * Names of every sibling lineage at this fork (including the active one), derived from SDK
   * {@link getBranchContext} `branchOptions`. Powers branch switching and fork-control deduping.
   */
  siblingBranches?: string[];
}

type BranchingContextValue = {
  /** All branches derived from checkpoint history */
  branches: Branch[];
  /** The currently active branch */
  activeBranch: string;
  /** Switch to a different branch */
  switchBranch: (branch: string) => void;
  /** Fork from a checkpoint, optionally replacing the next human message */
  forkFrom: (checkpointId: string | undefined, content?: string) => void;
  /** Reset to a fresh conversation */
  resetConversation: () => void;
  /** Submit a new prompt */
  submitPrompt: (content: string) => void;
  /** Whether streaming is active */
  isLoading: boolean;
  /** Any error */
  error: unknown;
  /** Current thread ID */
  threadId: string;
  /** Messages to display */
  messages: BaseMessage[];
  /** Metadata recovered from persisted history */
  historyMetadata: Map<string, BranchMetadata>;
  /** Refresh history from server */
  refreshHistory: () => Promise<void>;
  /** Streaming client used by message metadata hooks */
  stream: ReturnType<typeof useStream>;
};

const BranchingContext = createContext<BranchingContextValue | undefined>(
  undefined
);

/**
 * BranchingProvider
 *
 * Demonstrates how the Agent Streaming Protocol makes branching a first-class
 * concept by using getBranchContext from the SDK.
 */
export function BranchingProvider({ children }: { children: ReactNode }) {
  const [threadId, setThreadId] = useState<string>(crypto.randomUUID());
  const [history, setHistory] = useState<ThreadHistoryState[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>("");
  const shouldSelectForkHeadRef = useRef(false);
  /** Latest checkpoint id from stream events (buffer may clear before history refresh when replay is off). */
  const lastStreamCheckpointIdRef = useRef<string | undefined>(undefined);

  // Bind to the LangGraph stream
  const stream = useStream({
    assistantId: "agent",
    apiUrl: "http://localhost:2024",
    threadId,
  });

  const checkpointEvents = useChannel(stream, ["checkpoints"], undefined, {
    replay: false,
  }) as CheckpointsEvent[];

  const checkpointHistory = useMemo(
    () => mergeCheckpointEventsIntoHistory(history, checkpointEvents),
    [checkpointEvents, history]
  );

  useEffect(() => {
    const id = getLatestCheckpointId(checkpointEvents);
    if (typeof id === "string") lastStreamCheckpointIdRef.current = id;
  }, [checkpointEvents]);

  /**
   * Fetch checkpoint history from server
   */
  const refreshHistory = useCallback(async () => {
    if (!stream.threadId) return;
    try {
      const states = await stream.client.threads.getHistory(stream.threadId!, { limit: 100 });
      const statesForBranching = states as ThreadHistoryState[];
      setHistory(statesForBranching);
      if (shouldSelectForkHeadRef.current) {
        shouldSelectForkHeadRef.current = false;
        const mergedStates = mergeCheckpointEventsIntoHistory(
          statesForBranching,
          checkpointEvents
        );
        const latestCheckpointId =
          lastStreamCheckpointIdRef.current ??
          getLatestCheckpointId(checkpointEvents) ??
          pickLatestCheckpointIdFromHistory(statesForBranching);
        lastStreamCheckpointIdRef.current = undefined;

        if (latestCheckpointId) {
          const forkBranch = findBranchForCheckpoint(latestCheckpointId, mergedStates);
          if (forkBranch != null) {
            setActiveBranch(forkBranch);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
      setHistory([]);
    }
  }, [checkpointEvents, stream.client, stream.threadId]);

  /**
   * Refresh history when streaming completes
   */
  useEffect(() => {
    if (!stream.isLoading) {
      void refreshHistory();
    }
  }, [refreshHistory, stream.isLoading]);

  // Use getBranchContext from SDK to manage branches
  const branchContext = useMemo(() => {
    return getBranchContext(activeBranch, checkpointHistory);
  }, [activeBranch, checkpointHistory]);

  const streamMessages = useMessages(stream);

  const branchMessages = useMemo(
    () => messagesFromBranchHistory(branchContext.flatHistory),
    [branchContext.flatHistory]
  );

  /** Resume runs from whatever branch the UI is displaying (SDK default is thread “latest”). */
  const branchTipCheckpointId =
    branchContext.threadHead?.checkpoint?.checkpoint_id;

  /**
   * Messages shown in the transcript for the active branch (`activeBranch`).
   *
   * While a run is streaming (`stream.isLoading`), prefers live streamed messages so token deltas
   * and checkpoints match LangGraph. Checkpoint-derived branch history can lag behind the stream
   * until {@link refreshHistory} completes; using branch-only messages during that gap would freeze
   * the transcript.
   *
   * When idle, uses `branchMessages` when non-empty (from `branchContext.flatHistory` via
   * {@link messagesFromBranchHistory}); otherwise falls back to `streamMessages` (e.g. before history
   * loads or when the branch slice has no turns yet).
   *
   * @returns {@link BaseMessage} instances in display order for the thread.
   */
  const messages = useMemo(() => {
    if (stream.isLoading) {
      return streamMessages;
    }
    if (branchMessages.length > 0) {
      return branchMessages;
    }
    return streamMessages;
  }, [branchMessages, stream.isLoading, streamMessages]);

  /**
   * Build history metadata from messages and history.
   * @returns The history metadata
   */
  const historyMetadata = useMemo(() => {
    const byMessageId = new Map<string, BranchMetadata>();
    const alreadyShownBranches = new Set<string>();

    for (const message of messages) {
      const id = message.id;
      if (!id) continue;

      let firstSeenState: ThreadHistoryState | undefined;
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const state = history[index];
        const rawMessages =
          state.values != null && !Array.isArray(state.values)
            ? state.values.messages
            : undefined;
        const messageIds = historyToMessages(rawMessages).map(
          (historyMessage) => historyMessage.id
        );
        if (messageIds.includes(id)) {
          firstSeenState = state;
          break;
        }
      }

      const checkpointId = firstSeenState?.checkpoint?.checkpoint_id;
      const branchData =
        checkpointId == null
          ? undefined
          : branchContext.branchByCheckpoint[checkpointId];

      let branchMetadata =
        branchData?.branch == null || branchData.branch.length === 0
          ? undefined
          : branchData;
      const siblingBranchesKey = branchMetadata?.branchOptions?.join(",");
      if (siblingBranchesKey) {
        if (alreadyShownBranches.has(siblingBranchesKey)) {
          branchMetadata = undefined;
        }
        alreadyShownBranches.add(siblingBranchesKey);
      }

      const parentCheckpointId = firstSeenState?.parent_checkpoint?.checkpoint_id
      if (!parentCheckpointId) {
        continue;
      }

      byMessageId.set(id, {
        parentCheckpointId,
        branch: branchMetadata?.branch,
        siblingBranches: branchMetadata?.branchOptions,
      });
    }

    return byMessageId;
  }, [branchContext.branchByCheckpoint, messages, history]);

  /**
   * Build branches list from branchContext
   * @returns The branches list
   */
  const branches = useMemo<Branch[]>(() => {
    const seen = new Set<string>();
    const result: Branch[] = [];

    // Collect all unique branches
    for (const checkpointId of Object.keys(branchContext.branchByCheckpoint)) {
      const branchData = branchContext.branchByCheckpoint[checkpointId];
      for (const branchName of branchData?.branchOptions ?? []) {
        if (!seen.has(branchName)) {
          seen.add(branchName);
          result.push({ checkpointId, label: branchName });
        }
      }
    }

    if (result.length === 0) {
      result.push({ checkpointId: "", label: "main" });
    }

    return result;
  }, [branchContext.branchByCheckpoint]);

  /**
   * Switch to a different branch
   * @param branch - The branch name
   */
  const switchBranch = useCallback((branch: string) => {
    setActiveBranch(branch === "main" ? "" : branch);
  }, []);

  const forkFrom = useCallback(
    (checkpointId: string | undefined, content?: string) => {
      if (!checkpointId || stream.isLoading) return;

      void stream.submit(
        content == null
          ? undefined
          : { messages: [{ content, type: "human" }] },
        { forkFrom: { checkpointId } }
      );

      shouldSelectForkHeadRef.current = true;
      setTimeout(() => void refreshHistory(), 1000);
    },
    [refreshHistory, stream]
  );

  // Reset to fresh conversation
  const resetConversation = useCallback(() => {
    setThreadId(crypto.randomUUID());
    setHistory([]);
    setActiveBranch("");
  }, []);

  /**
   * Submit new prompt — anchor to the viewed branch tip
   * so forks keep prior turns.
   */
  const submitPrompt = useCallback(
    (content: string) => {
      const nextContent = content.trim();
      if (nextContent.length === 0 || stream.isLoading) return;

      void stream.submit(
        { messages: [{ content: nextContent, type: "human" }] },
        branchTipCheckpointId != null
          ? { forkFrom: { checkpointId: branchTipCheckpointId } }
          : undefined
      );
    },
    [branchTipCheckpointId, stream]
  );

  const value = useMemo<BranchingContextValue>(
    () => ({
      branches,
      activeBranch,
      switchBranch,
      forkFrom,
      resetConversation,
      submitPrompt,
      isLoading: stream.isLoading,
      error: stream.error,
      threadId,
      messages,
      historyMetadata,
      refreshHistory,
      stream,
    }),
    [
      branches,
      activeBranch,
      switchBranch,
      forkFrom,
      resetConversation,
      submitPrompt,
      stream.isLoading,
      stream.error,
      stream,
      threadId,
      messages,
      historyMetadata,
      refreshHistory,
    ]
  );

  return (
    <BranchingContext.Provider value={value}>
      {children}
    </BranchingContext.Provider>
  );
}

/**
 * Find the branch for a checkpoint.
 * @param checkpointId - The checkpoint ID
 * @param history - The thread history states
 * @returns The branch name
 */
function findBranchForCheckpoint(
  checkpointId: string | undefined,
  history: ThreadHistoryState[]
) {
  if (!checkpointId) return undefined;

  const queue = [""];
  const seen = new Set(queue);

  while (queue.length > 0) {
    const branch = queue.shift()!;
    const branchContext = getBranchContext(branch, history) as {
      branchByCheckpoint: Record<
        string,
        { branch?: string; branchOptions?: string[] }
      >;
    };

    const checkpointBranch = branchContext.branchByCheckpoint[checkpointId];
    if (checkpointBranch != null) {
      return checkpointBranch.branch ?? branch;
    }

    for (const branchData of Object.values(branchContext.branchByCheckpoint)) {
      for (const branchOption of branchData.branchOptions ?? []) {
        if (!seen.has(branchOption)) {
          seen.add(branchOption);
          queue.push(branchOption);
        }
      }
    }
  }

  return undefined;
}

/**
 * Merge checkpoint events into history.
 * @param history - The thread history states
 * @param checkpointEvents - The checkpoint events
 * @returns The merged thread history states
 */
function mergeCheckpointEventsIntoHistory(
  history: ThreadHistoryState[],
  checkpointEvents: CheckpointsEvent[]
) {
  const byCheckpoint = new Map<string, ThreadHistoryState>();
  for (const state of history) {
    const checkpointId = state.checkpoint?.checkpoint_id;
    if (checkpointId != null) {
      byCheckpoint.set(checkpointId, state);
    }
  }

  const liveStates: ThreadHistoryState[] = [];
  for (const event of checkpointEvents) {
    if (event.method !== "checkpoints") continue;

    const id = event.params?.data?.id;
    if (typeof id !== "string" || byCheckpoint.has(id)) continue;

    const parentId = event.params?.data?.parent_id;
    const state = syntheticThreadStateFromCheckpointEvent(id, parentId);
    byCheckpoint.set(id, state);
    liveStates.unshift(state);
  }

  return [...liveStates, ...history];
}

/**
 * Minimal ThreadState for checkpoints observed only via stream events (not yet in getHistory).
 * @param checkpointId - The checkpoint ID
 * @param parentId - The parent checkpoint ID
 * @returns The synthetic thread state
 */
function syntheticThreadStateFromCheckpointEvent(
  checkpointId: string,
  parentId: unknown
): ThreadHistoryState {
  const checkpoint = {
    thread_id: "",
    checkpoint_ns: "",
    checkpoint_id: checkpointId,
    checkpoint_map: undefined,
  };
  return {
    values: {},
    next: [],
    checkpoint,
    metadata: undefined,
    created_at: undefined,
    parent_checkpoint:
      typeof parentId === "string"
        ? {
          thread_id: "",
          checkpoint_ns: "",
          checkpoint_id: parentId,
          checkpoint_map: undefined,
        }
        : undefined,
    tasks: [],
  };
}

/**
 * Get the latest checkpoint ID from the checkpoint events.
 * @param checkpointEvents - The checkpoint events
 * @returns The latest checkpoint ID
 */
function getLatestCheckpointId(checkpointEvents: CheckpointsEvent[]) {
  for (let index = checkpointEvents.length - 1; index >= 0; index -= 1) {
    const id = checkpointEvents[index].params?.data?.id;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/**
 * History order is not guaranteed; pick the likely thread tip for branch resolution.
 * @param states - The thread history states
 * @returns The latest checkpoint ID
 */
function pickLatestCheckpointIdFromHistory(
  states: ThreadHistoryState[]
): string | undefined {
  let bestId: string | undefined;
  let bestTime = -Infinity;
  for (const state of states) {
    const id = state.checkpoint?.checkpoint_id;
    if (typeof id !== "string") continue;
    const time =
      typeof state.created_at === "string"
        ? Date.parse(state.created_at)
        : typeof state.created_at === "number"
          ? state.created_at
          : NaN;
    const t = Number.isFinite(time) ? time : 0;
    if (
      bestId == null ||
      t > bestTime ||
      (t === bestTime && id > bestId)
    ) {
      bestTime = t;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Use message metadata for branching.
 * @param messageId - The message ID
 * @returns The message metadata
 */
export function useBranchingMessageMetadata(messageId: string | null | undefined) {
  const { historyMetadata, stream } = useBranchingDemo();
  const liveMetadata = useMessageMetadata(stream, messageId ?? undefined);
  const fallbackMetadata = historyMetadata.get(messageId ?? "");

  return {
    ...fallbackMetadata,
    parentCheckpointId:
      fallbackMetadata?.parentCheckpointId ?? liveMetadata?.parentCheckpointId,
  };
}

/**
 * Convert raw message data from history API to proper BaseMessage instances.
 * @param messages - The raw message data
 * @returns The BaseMessage instances
 */
function historyToMessages(messages: unknown): BaseMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => {
    const type = typeof m === 'object' && m != null ? m.type : undefined;
    if (type === 'tool') {
      return new ToolMessage({ ...m });
    }
    if (type === 'ai') {
      return new AIMessage({ ...m, content: m.content_blocks ?? m.content });
    }
    if (type === 'human') {
      return new HumanMessage({ ...m });
    }
    if (type === 'system') {
      return new SystemMessage({ ...m });
    }

    throw new Error(`Unknown message type: ${type}`);
  })
}

/**
 * Last checkpoint in the branch with non-empty messages (streaming synthetics often have empty values).
 * @param flatHistory - The flat history
 * @returns The messages
 */
function messagesFromBranchHistory(flatHistory: ThreadHistoryState[]): BaseMessage[] {
  for (let index = flatHistory.length - 1; index >= 0; index -= 1) {
    const state = flatHistory[index];
    const raw =
      state.values != null && !Array.isArray(state.values)
        ? state.values.messages
        : undefined;
    return historyToMessages(raw) ?? [];
  }
  return [];
}

export function useBranchingDemo() {
  const context = useContext(BranchingContext);
  if (context == null) {
    throw new Error("useBranchingDemo must be used inside BranchingProvider");
  }
  return context;
}
