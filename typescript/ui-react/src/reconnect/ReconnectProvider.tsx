import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { BaseMessage } from "@langchain/core/messages";
import { useMessages, useStream } from "@langchain/react";

/**
 * Bump this key whenever the persisted shape changes or when old demo thread
 * state should be ignored. That avoids reconnecting to a stale thread created
 * by an earlier version of the example.
 */
const STORAGE_KEY = "langchain-ui-react-reconnect";

type StoredReconnectState = {
  /**
   * Message ids that were already visible before a refresh. After reload we use
   * this list to label replayed history separately from new live tokens.
   */
  messageIds: string[];
  /**
   * True only for reloads intentionally triggered by the demo button. A normal
   * page load should not claim it recovered from a mid-stream disconnect.
   */
  pendingReconnect: boolean;
  /**
   * The important bit: preserving the thread id lets the new browser session
   * subscribe back to the same LangGraph thread instead of starting over.
   */
  threadId: string;
};

type MessageRow = {
  id: string;
  message: BaseMessage;
  /**
   * Presentation-only flag computed from the snapshot saved before refresh.
   */
  replayed: boolean;
};

type ReconnectContextValue = {
  didReconnect: boolean;
  error: unknown;
  isLoading: boolean;
  messageRows: MessageRow[];
  messages: BaseMessage[];
  refreshMidStream: () => void;
  resetThread: () => void;
  submitPrompt: (content: string) => void;
  threadId: string;
};

const ReconnectContext = createContext<ReconnectContextValue | undefined>(
  undefined
);

function readStoredState(): StoredReconnectState {
  /**
   * A first-time visitor gets a fresh thread. Every later reload reuses the
   * stored thread id so the LangGraph server can replay existing thread state.
   */
  const fallback = {
    messageIds: [],
    pendingReconnect: false,
    threadId: crypto.randomUUID(),
  };

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredReconnectState>;

    /**
     * Treat sessionStorage as untrusted. It is browser-controlled state, so each
     * field is validated before we let it influence the streaming client.
     */
    return {
      messageIds: Array.isArray(parsed.messageIds) ? parsed.messageIds : [],
      pendingReconnect: parsed.pendingReconnect === true,
      threadId:
        typeof parsed.threadId === "string"
          ? parsed.threadId
          : fallback.threadId,
    };
  } catch {
    return fallback;
  }
}

function writeStoredState(state: StoredReconnectState) {
  /**
   * sessionStorage survives page refreshes but is scoped to the tab. That makes
   * it perfect for this demo: reload recovery works without leaking state across
   * unrelated tabs or browser sessions.
   */
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getMessageId(message: { id?: string | null }, index: number) {
  /**
   * Most streamed messages have ids. The index fallback keeps the UI stable for
   * any synthetic or provider-specific message that does not.
   */
  return message.id ?? `message-${index}`;
}

export function ReconnectProvider({ children }: { children: ReactNode }) {
  /**
   * Read once on mount. The value is intentionally stable for the lifetime of
   * this React tree; changing threads is modeled as clearing storage and
   * reloading the app.
   */
  const initialState = useMemo(readStoredState, []);

  /**
   * Snapshot of what the user had already seen before pressing
   * "Refresh mid-stream". When the page returns, any matching ids are marked as
   * replayed catch-up history.
   */
  const [lastReloadIds, setLastReloadIds] = useState(
    () => new Set(initialState.messageIds)
  );

  /**
   * This is UI state, not protocol state. It lets the page explain that the
   * current render followed an intentional reconnect scenario.
   */
  const [didReconnect, setDidReconnect] = useState(
    initialState.pendingReconnect
  );

  /**
   * Bind the React SDK to the preserved thread id. This is the core reconnect
   * behavior: after reload, the hook attaches to the same remote thread and
   * hydrates/streams its messages instead of creating a new conversation.
   */
  const stream = useStream({
    assistantId: "agent",
    apiUrl: "http://localhost:2024",
    threadId: initialState.threadId,
  });

  /**
   * useMessages subscribes to the messages projection, which is the token-level
   * stream users expect in a chat UI. It is preferable to rendering values state
   * directly because values snapshots can arrive only after full supersteps.
   */
  const messages = useMessages(stream);

  /**
   * App.tsx does not need to know how replay labels are computed. It receives
   * rows that are already annotated for display.
   */
  const messageRows = useMemo(
    () =>
      messages.map((message, index) => {
        const id = getMessageId(message, index);
        return {
          id,
          message,
          replayed: didReconnect && lastReloadIds.has(id),
        };
      }),
    [didReconnect, lastReloadIds, messages]
  );

  useEffect(() => {
    /**
     * Persist progress continuously while messages stream. If the user refreshes
     * manually during a run, we still have a recent enough snapshot to reconnect
     * to the same thread and avoid presenting the recovered page as a fresh chat.
     */
    writeStoredState({
      messageIds: messages.map(getMessageId),
      pendingReconnect: didReconnect && stream.isLoading,
      threadId: initialState.threadId,
    });
  }, [didReconnect, initialState.threadId, stream.isLoading, messages]);

  function submitPrompt(content: string) {
    const nextContent = content.trim();
    if (nextContent.length === 0 || stream.isLoading) return;

    /**
     * A new run is not a reconnect anymore. Clear the replay labels so the next
     * answer reads as a normal live stream until the user refreshes mid-run.
     */
    setDidReconnect(false);
    setLastReloadIds(new Set());

    /**
     * The input shape matches the LangGraph message state. The SDK handles the
     * command and subscribes to the resulting message stream for this thread.
     */
    void stream.submit({
      messages: [{ content: nextContent, type: "human" }],
    });
  }

  function refreshMidStream() {
    /**
     * Save one final snapshot immediately before forcing the reload. On the next
     * mount, `pendingReconnect` tells the UI to show the reconnect banner and the
     * message ids let us label replayed history.
     */
    writeStoredState({
      messageIds: messages.map(getMessageId),
      pendingReconnect: true,
      threadId: initialState.threadId,
    });
    window.location.reload();
  }

  function resetThread() {
    /**
     * Clearing storage gives the demo a brand-new thread on the next mount. This
     * is useful after testing a reconnect and wanting a clean run.
     */
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  const value = useMemo<ReconnectContextValue>(
    () => ({
      didReconnect,
      error: stream.error,
      isLoading: stream.isLoading,
      messageRows,
      messages,
      refreshMidStream,
      resetThread,
      submitPrompt,
      threadId: initialState.threadId,
    }),
    [
      didReconnect,
      initialState.threadId,
      messageRows,
      messages,
      stream.error,
      stream.isLoading,
    ]
  );

  /**
   * Keep the anchor outside the app shell so it truly represents the bottom of
   * the page, including the composer below the chat transcript.
   */
  return (
    <ReconnectContext.Provider value={value}>
      {children}
      <PageBottomAutoScroll isLoading={stream.isLoading} messages={messages} />
    </ReconnectContext.Provider>
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
    /**
     * Token deltas update the last message in place, so the dependency is the
     * whole messages array from the SDK. Loading changes also matter because a
     * final hydration/update can land just as the run settles.
     */
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  return <div aria-hidden="true" ref={bottomRef} />;
}

export function useReconnectDemo() {
  const context = useContext(ReconnectContext);
  if (context == null) {
    /**
     * Fail loudly during development if a component is moved outside the
     * provider. Silent fallbacks would hide reconnect bugs in this demo.
     */
    throw new Error("useReconnectDemo must be used inside ReconnectProvider");
  }
  return context;
}
