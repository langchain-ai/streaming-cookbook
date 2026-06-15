/**
 * DeepAgents dashboard client.
 *
 * One `useStream` connection carries the whole run. Panels are not
 * hardcoded anywhere: the coordinator's parallel `task` calls surface as
 * `stream.subagents` snapshots, and each panel mounts a `useMessages`
 * projection scoped to its subagent's namespace. Four (or N) OpenUI
 * renderers stream concurrently, each isolated to its own store:
 *
 *   stream.subagents ──▶ [snapshot, snapshot, ...]      (discovery)
 *        per panel  ──▶ useMessages(stream, snapshot)   (scoped tokens)
 *                   ──▶ <Renderer response={program}/>  (own parser/store)
 *
 * Re-render isolation comes from two sides:
 *  - the SDK drops subagent token events from the root store, so panel
 *    tokens never re-render the app shell, and
 *  - each <Panel> is memoized on snapshot identity fields, so sparse root
 *    events (coordinator tokens, lifecycle) never re-render the panels.
 *
 * @module App
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { BaseMessage } from "@langchain/core/messages";
import type { SubagentDiscoverySnapshot } from "@langchain/langgraph-sdk/stream";
import { useMessages, useStream, useToolCalls } from "@langchain/react";
import { Renderer, type ActionEvent } from "@openuidev/react-lang";

import { library } from "./library";

/**
 * Hoisted to module scope so `useStream` sees a stable options identity —
 * an inline literal would churn the hook's connection state every render.
 */
const STREAM_OPTIONS = {
  assistantId: "dashboard",
  apiUrl: import.meta.env.VITE_LANGGRAPH_API_URL ?? "http://localhost:2024",
} as const;

/** The stream handle type the selector hooks accept. */
type DashboardStream = Parameters<typeof useMessages>[0];

const SUGGESTIONS = [
  {
    label: "Full dashboard",
    prompt:
      "Build my dashboard: revenue and payments, product analytics, engineering activity, and my schedule for the next few days.",
  },
  {
    label: "Business only",
    prompt:
      "Build a business dashboard with revenue/payments and product analytics for the last 30 days. Skip engineering and calendar.",
  },
  {
    label: "My day",
    prompt:
      "What does my day look like? Show today's schedule with free blocks, plus anything urgent from engineering.",
  },
] as const;

/** Short data-source tag shown in each panel's corner badge. */
const SOURCE_LABELS: Record<string, string> = {
  "stripe-panel": "Stripe",
  "posthog-panel": "PostHog",
  "github-panel": "GitHub",
  "calendar-panel": "Calendar",
  "general-purpose": "Custom",
};

/**
 * Fixed display priority so the bento layout is deterministic regardless of
 * the order the coordinator happens to delegate in — the highest-priority
 * panel lands in the large feature cell.
 */
const PANEL_ORDER = [
  "stripe-panel",
  "posthog-panel",
  "github-panel",
  "calendar-panel",
  "general-purpose",
];
const orderIndex = (name: string): number => {
  const i = PANEL_ORDER.indexOf(name);
  return i === -1 ? PANEL_ORDER.length : i;
};

/** Bento grid-area names by slot; index ≥4 falls back to auto-flow. */
const AREA_LETTERS = ["a", "b", "c", "d"];

/** Concatenated text of a message (string or text content blocks). */
const textOf = (message: BaseMessage): string => {
  const text = (message as { text?: unknown }).text;
  if (typeof text === "string") return text;
  const content: unknown = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      typeof block === "object" &&
      block !== null &&
      "text" in block &&
      typeof block.text === "string"
        ? block.text
        : ""
    )
    .join("");
};

/**
 * The OpenUI Lang program for a panel: the text of the LAST AI message that
 * has any. Panel agents first make tool calls (AI messages with no text),
 * then stream the program as their final message — so while streaming this
 * is the partial program, and once finished it is the complete one.
 *
 * Programs start with `root` (a prompt rule), so a root-prefixed message is
 * preferred over the plain latest text — if a model slips and chats before
 * its tool calls, the chatter can't displace an actual program.
 */
const programFromMessages = (messages: BaseMessage[]): string => {
  let fallback = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.getType() !== "ai") continue;
    const text = textOf(message);
    const trimmed = text.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("root")) return text;
    if (fallback === "") fallback = text;
  }
  return fallback;
};

/** Last AI message text at the root: the coordinator's plain-text summary. */
const summaryFromMessages = (messages: BaseMessage[]): string =>
  programFromMessages(messages);

const readableError = (error: unknown): string => {
  const raw = String(error);
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { message?: unknown };
      if (typeof parsed.message === "string") {
        if (parsed.message.includes("exceeded your current quota")) {
          return "Generation is unavailable because the model quota is exhausted.";
        }
        return parsed.message.split("\n")[0];
      }
    } catch {
      // Fall through to the concise plain-text message.
    }
  }
  return raw.replace(/^Error:\s*/, "").split("\n")[0];
};

/**
 * One dashboard panel, scoped to one subagent.
 *
 * Memoized so the app shell's re-renders (coordinator tokens, lifecycle
 * events, input typing) don't reach the Renderer; the panel's own token
 * traffic arrives through `useMessages`' scoped store subscription instead,
 * which only this component listens to. The `stream` prop is deliberately
 * excluded from the comparator — selector hooks key off the stable stream
 * controller, not the per-render handle object.
 */
const Panel = memo(
  function Panel({
    stream,
    snapshot,
    gridArea,
    runActive,
    runFailed,
    onAction,
  }: {
    stream: DashboardStream;
    snapshot: SubagentDiscoverySnapshot;
    gridArea: string | undefined;
    runActive: boolean;
    runFailed: boolean;
    onAction: (event: ActionEvent) => void;
  }) {
    const messages = useMessages(stream, snapshot);
    const toolCalls = useToolCalls(stream, snapshot);
    const program = programFromMessages(messages);

    // Channel-level status is precise but its tail can race run
    // termination — when the run is over, nothing is streaming. A panel
    // still "running" after a failed run was cut off, not completed.
    const isStreaming = snapshot.status === "running" && runActive;
    const status =
      !runActive && snapshot.status === "running"
        ? runFailed
          ? "error"
          : "complete"
        : snapshot.status;
    const doneTools = toolCalls.filter((call) => call.status !== "running").length;
    const source = SOURCE_LABELS[snapshot.name] ?? snapshot.name;

    // What the corner badge says: fetch progress, then "writing", then the
    // bare source name once the panel is done (keeps finished cards clean).
    const activity =
      status === "error"
        ? "unavailable"
        : status === "running"
          ? toolCalls.length > 0 && doneTools < toolCalls.length
            ? "loading data"
            : "building"
          : null;

    return (
      <section
        className={`panel is-${status}`}
        data-source={snapshot.name}
        style={{ gridArea }}
      >
        <div className="panel-badge" data-status={status}>
          {status === "running" && <span className="spinner" aria-hidden />}
          <span className="panel-source">{source}</span>
          {activity && <span className="panel-activity">{activity}</span>}
        </div>
        {program !== "" ? (
          <div className="panel-body">
            <Renderer
              response={program}
              library={library}
              isStreaming={isStreaming}
              onAction={onAction}
            />
          </div>
        ) : (
          <div className="panel-skeleton">
            {snapshot.error ? (
              <p className="panel-error">{snapshot.error}</p>
            ) : (
              <>
                <div className="skeleton-bar wide" />
                <div className="skeleton-bar" />
                <div className="skeleton-bar wide" />
                <p className="skeleton-task">Building the {source} panel…</p>
              </>
            )}
          </div>
        )}
      </section>
    );
  },
  (prev, next) =>
    prev.snapshot.id === next.snapshot.id &&
    prev.snapshot.status === next.snapshot.status &&
    prev.snapshot.taskInput === next.snapshot.taskInput &&
    prev.snapshot.error === next.snapshot.error &&
    prev.snapshot.namespace.join("/") === next.snapshot.namespace.join("/") &&
    prev.gridArea === next.gridArea &&
    prev.runActive === next.runActive &&
    prev.runFailed === next.runFailed &&
    prev.onAction === next.onAction
);

/**
 * The dashboard for one thread. Remounted (fresh thread, fresh panels) when
 * the parent bumps its `key`.
 */
function Dashboard({
  initialPrompt,
  onGenerate,
  onReset,
}: {
  initialPrompt: string | null;
  onGenerate: (prompt: string) => void;
  onReset: () => void;
}) {
  const [prompt, setPrompt] = useState<string>(
    initialPrompt ?? SUGGESTIONS[0].prompt,
  );
  const stream = useStream(STREAM_OPTIONS);
  const initialSubmissionRef = useRef<string | null>(null);

  // A generated dashboard owns one fresh LangGraph thread. App remounts this
  // component for every composer submission, then this effect starts that
  // first and only dashboard run on the new stream controller.
  useEffect(() => {
    if (
      initialPrompt === null ||
      initialSubmissionRef.current === initialPrompt
    ) {
      return;
    }
    initialSubmissionRef.current = initialPrompt;
    void stream.submit({
      messages: [{ content: initialPrompt, type: "human" as const }],
    });
  }, [initialPrompt, stream]);

  // Stable action callback: panels keep one function identity forever; the
  // ref always points at the current stream handle.
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const onAction = useCallback((event: ActionEvent) => {
    if (event.type === "continue_conversation") {
      const context = event.params?.context;
      const text =
        typeof context === "string" && context !== ""
          ? context
          : event.humanFriendlyMessage;
      if (text) {
        void streamRef.current.submit({
          messages: [{ content: text, type: "human" as const }],
        });
      }
    } else if (
      event.type === "open_url" &&
      typeof event.params?.url === "string"
    ) {
      window.open(event.params.url, "_blank", "noopener");
    }
  }, []);

  const generate = (text: string) => {
    if (stream.isLoading || text.trim() === "") return;
    onGenerate(text.trim());
  };

  // Top-level panels only (a specialist's own helper streams inside its
  // parent's panel, not as a new tile), ordered for a stable bento layout.
  const panels = [...stream.subagents.values()]
    .filter((snapshot) => snapshot.parentId === null)
    .sort(
      (a, b) =>
        orderIndex(a.name) - orderIndex(b.name) ||
        a.startedAt.getTime() - b.startedAt.getTime()
    );
  const summary = summaryFromMessages(stream.messages);
  const started = initialPrompt !== null || panels.length > 0 || stream.isLoading;
  const gridClass =
    panels.length === 0
      ? "grid"
      : panels.length <= 4
        ? `grid grid-n${panels.length}`
        : "grid grid-many";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div className="brand-copy">
            <div className="brand-title">
              <h1>DeepAgents Dashboard</h1>
              <a
                className="openui-attribution"
                href="https://openui.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Built with OpenUI"
              >
                <span className="openui-attribution-prefix">Built with </span>
                OpenUI
              </a>
            </div>
            <span className="tagline">Stripe · PostHog · GitHub · Calendar</span>
          </div>
        </div>
        <button
          className="ghost new-dashboard"
          onClick={onReset}
          disabled={stream.isLoading}
        >
          New dashboard
        </button>
      </header>

      <form
        className="command-panel"
        onSubmit={(event) => {
          event.preventDefault();
          generate(prompt);
        }}
      >
        <label className="prompt-field">
          <span className="prompt-label">Dashboard brief</span>
          <textarea
            aria-label="Dashboard brief"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                generate(prompt);
              }
            }}
            placeholder="What should this dashboard show?"
            disabled={stream.isLoading}
            rows={2}
          />
        </label>

        <div className="command-footer">
          <div className="presets" aria-label="Dashboard templates">
            <span className="presets-label">Start with</span>
            {SUGGESTIONS.map((suggestion) => (
              <button
                type="button"
                key={suggestion.label}
                className={
                  prompt === suggestion.prompt ? "chip chip-active" : "chip"
                }
                disabled={stream.isLoading}
                onClick={() => setPrompt(suggestion.prompt)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
          <div className="command-submit">
            <span className="keyboard-hint">⌘ Enter</span>
            <button
              type="submit"
              className="build-button"
              disabled={stream.isLoading || prompt.trim() === ""}
            >
              <span>
                {stream.isLoading ? "Generating…" : "Generate dashboard"}
              </span>
              {stream.isLoading && (
                <span className="composer-loader" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </form>

      <div className="subbar">
        {stream.error != null ? (
          <span className="run-error">{readableError(stream.error)}</span>
        ) : (
          summary !== "" &&
          !stream.isLoading && <span className="summary">{summary}</span>
        )}
      </div>

      {started ? (
        <main className={gridClass}>
          {panels.length === 0 ? (
            <div className="coordinating">Building your dashboard…</div>
          ) : (
            panels.map((snapshot, index) => (
              <Panel
                key={snapshot.id}
                stream={stream}
                snapshot={snapshot}
                gridArea={panels.length <= 4 ? AREA_LETTERS[index] : undefined}
                runActive={stream.isLoading}
                runFailed={stream.error != null}
                onAction={onAction}
              />
            ))
          )}
        </main>
      ) : (
        <main className="empty">
          <div className="empty-copy">
            <span className="empty-kicker">Start with a brief</span>
            <h2>Build the view you need.</h2>
            <p>
              We'll combine the relevant sources and build the panels in
              parallel.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}

export function App() {
  const [dashboard, setDashboard] = useState<{
    epoch: number;
    initialPrompt: string | null;
  }>({ epoch: 0, initialPrompt: null });

  const generate = useCallback((prompt: string) => {
    setDashboard((current) => ({
      epoch: current.epoch + 1,
      initialPrompt: prompt,
    }));
  }, []);

  const reset = useCallback(() => {
    setDashboard((current) => ({
      epoch: current.epoch + 1,
      initialPrompt: null,
    }));
  }, []);

  return (
    <Dashboard
      key={dashboard.epoch}
      initialPrompt={dashboard.initialPrompt}
      onGenerate={generate}
      onReset={reset}
    />
  );
}
