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
import type { ThreadState } from "@langchain/langgraph-sdk";
import { getBranchContext } from "@langchain/langgraph-sdk/ui";

/** Thread states used by branching; values constrained so `getBranchContext` accepts this array. */
type ThreadHistoryState = ThreadState<Record<string, unknown>>;

type CheckpointEvent = {
  method?: string;
  params?: {
    data?: {
      id?: unknown;
      parent_id?: unknown;
    };
  };
};

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
  parentCheckpointId?: string;
  branch?: string;
  branchOptions?: string[];
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
 * Convert raw message data from history API to proper BaseMessage instances.
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

/** Last checkpoint in the branch with non-empty messages (streaming synthetics often have empty values). */
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

  // Bind to the LangGraph stream
  const stream = useStream({
    assistantId: "agent",
    apiUrl: "http://localhost:2024",
    threadId,
  });

  const checkpointEvents = useChannel(stream, ["checkpoints"], undefined, {
    replay: false,
  }) as CheckpointEvent[];

  const checkpointHistory = useMemo(
    () => mergeCheckpointEventsIntoHistory(history, checkpointEvents),
    [checkpointEvents, history]
  );

  // Fetch checkpoint history from server
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
          getLatestCheckpointId(checkpointEvents) ??
          statesForBranching[0]?.checkpoint?.checkpoint_id;

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

  // Refresh history when streaming completes
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

  const messages = useMemo(() => {
    // While any run is in flight (including fork/regenerate), always mirror the
    // stream. Until history refreshes after the run, branch head checkpoints
    // lag behind live checkpoint events, which would otherwise keep stale
    // branch messages on screen with no token-by-token updates.
    if (stream.isLoading) {
      return streamMessages;
    }
    if (branchMessages.length > 0) {
      return branchMessages;
    }
    return streamMessages;
  }, [branchMessages, stream.isLoading, streamMessages]);

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
      const branchOptionsKey = branchMetadata?.branchOptions?.join(",");
      if (branchOptionsKey) {
        if (alreadyShownBranches.has(branchOptionsKey)) {
          branchMetadata = undefined;
        }
        alreadyShownBranches.add(branchOptionsKey);
      }

      const parentCheckpointId = firstSeenState?.parent_checkpoint?.checkpoint_id
      if (!parentCheckpointId) {
        continue;
      }

      byMessageId.set(id, {
        parentCheckpointId,
        branch: branchMetadata?.branch,
        branchOptions: branchMetadata?.branchOptions,
      });
    }

    return byMessageId;
  }, [branchContext.branchByCheckpoint, messages, history]);

  // Build branches list from branchContext
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

  // Switch to a different branch
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

  // Submit new prompt — anchor to the viewed branch tip so forks keep prior turns.
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
      <PageBottomAutoScroll isLoading={stream.isLoading} messages={messages} />
    </BranchingContext.Provider>
  );
}

function PageBottomAutoScroll({
  isLoading,
  messages,
}: {
  isLoading: boolean;
  messages: BaseMessage[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  return <div aria-hidden="true" ref={bottomRef} />;
}

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

function mergeCheckpointEventsIntoHistory(
  history: ThreadHistoryState[],
  checkpointEvents: CheckpointEvent[]
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

/** Minimal ThreadState for checkpoints observed only via stream events (not yet in getHistory). */
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

function getLatestCheckpointId(checkpointEvents: CheckpointEvent[]) {
  for (let index = checkpointEvents.length - 1; index >= 0; index -= 1) {
    const id = checkpointEvents[index].params?.data?.id;
    if (typeof id === "string") return id;
  }
  return undefined;
}

export function useBranchingDemo() {
  const context = useContext(BranchingContext);
  if (context == null) {
    throw new Error("useBranchingDemo must be used inside BranchingProvider");
  }
  return context;
}

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
