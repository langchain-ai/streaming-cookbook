/**
 * The deep agent behind the dashboard — one coordinator, four panel
 * specialists, zero custom graph code.
 *
 *     user prompt
 *          │
 *          ▼
 *     coordinator          (deepagents' built-in `task` tool)
 *          │
 *          ├──▶ task("stripe-panel", …)     ─┐  all four task calls go out in
 *          ├──▶ task("posthog-panel", …)     │  ONE message, so the subagents
 *          ├──▶ task("github-panel", …)      │  run in the same superstep and
 *          └──▶ task("calendar-panel", …)   ─┘  stream tokens CONCURRENTLY
 *
 * Every event a subagent emits is namespaced `tools:<task_call_id>` by the
 * LangGraph protocol. The client never demultiplexes by hand: it discovers
 * panels through `stream.subagents` and scopes a `useMessages(stream, panel)`
 * projection to each one. Each panel's OpenUI Lang program streams straight
 * from its own model call into its own renderer.
 *
 * @module agent
 */

import { createDeepAgent, type SubAgent } from "deepagents";

import { library, promptOptions } from "./library.js";
import {
  calendarTools,
  githubTools,
  posthogTools,
  stripeTools,
} from "./tools.js";

// Two model dials. The coordinator only routes (emit parallel task calls,
// then one summary sentence), so a fast mini model handles it and shaves the
// front-cost that gates every panel. Panels generate strict OpenUI Lang and
// stay on the frontier model — each is pinned below so it can never fall
// back to the coordinator's mini default.
const COORDINATOR_MODEL = "openai:gpt-5.4-mini";
const PANEL_MODEL = "openai:gpt-5.5";

/**
 * One byte-identical system prompt for every panel. The coordinator's task
 * description supplies the panel-specific objective; the selected tool set
 * supplies its data domain.
 *
 * `library.prompt()` runs once when this module loads. The resulting string
 * is reused by every subagent, keeping the model prefix stable for provider
 * prompt caching.
 */
const PANEL_SYSTEM_PROMPT = library.prompt({
  ...promptOptions,
  examples: [],
  preamble:
    "Build one panel of a live executive dashboard. Follow the coordinator's " +
    "task exactly and stay within the data available from your tools.",
  additionalRules: [
    ...(promptOptions.additionalRules ?? []),
    "Use your available data tools before writing the panel. If no tools are available, disclose that live data is unavailable.",
    "Inspect each tool result's `_meta.source`. Label mock data as demo data, and if the source is unavailable show the provider error instead of inventing metrics.",
    "Return the complete OpenUI Lang program and nothing else: no prose, Markdown fences, or commentary.",
    "Emit the `root` statement on the first line so rendering can start immediately.",
    "Build one compact Card with a CardHeader, one takeaway of at most 35 words, and one primary chart, table, or list.",
    "Do not combine multiple primary visualizations or repeat the same metric in several places.",
    "Show no more than 6 visible rows or list items.",
    "Chart Series data must be numeric arrays, never strings.",
    "Do not use FollowUpBlock or FollowUpItem.",
  ],
});

const subagents: SubAgent[] = [
  {
    name: "stripe-panel",
    model: PANEL_MODEL,
    description:
      "Builds the revenue & payments panel from Stripe data: balance, MRR and " +
      "subscriptions, daily revenue trend, recent charges.",
    systemPrompt: PANEL_SYSTEM_PROMPT,
    tools: stripeTools,
  },
  {
    name: "posthog-panel",
    model: PANEL_MODEL,
    description:
      "Builds the product analytics panel from PostHog data: usage trends, " +
      "top events, signup-to-paid conversion funnel.",
    systemPrompt: PANEL_SYSTEM_PROMPT,
    tools: posthogTools,
  },
  {
    name: "github-panel",
    model: PANEL_MODEL,
    description:
      "Builds the engineering activity panel from GitHub data: repositories, " +
      "open PRs and issues, weekly commit activity.",
    systemPrompt: PANEL_SYSTEM_PROMPT,
    tools: githubTools,
  },
  {
    name: "calendar-panel",
    model: PANEL_MODEL,
    description:
      "Builds the schedule panel from Google Calendar data: upcoming events " +
      "and today's agenda with free blocks.",
    systemPrompt: PANEL_SYSTEM_PROMPT,
    tools: calendarTools,
  },
  // deepagents always auto-registers a "general-purpose" subagent (with ALL
  // of the coordinator's tools) and advertises it to the model — the only
  // way to disable that is to shadow the name. This shadow turns a stray
  // delegation into a valid OpenUI panel instead of a broken tile of prose.
  {
    name: "general-purpose",
    model: PANEL_MODEL,
    description:
      "Fallback panel builder for dashboard content outside the four " +
      "specialist domains. Prefer the specialists whenever they fit.",
    systemPrompt: PANEL_SYSTEM_PROMPT,
    tools: [],
  },
];

const COORDINATOR_PROMPT = `You orchestrate a live executive dashboard. Each panel is built by a
specialist agent whose output streams straight onto the user's screen while
it is being generated.

Available specialists: stripe-panel (revenue & payments), posthog-panel
(product analytics), github-panel (engineering activity), calendar-panel
(schedule). Pick the ones the request calls for — a broad "build my
dashboard" request means all four.

Rules:
1. Delegate IMMEDIATELY. Do not write todos, do not use the filesystem, do
   not answer the request yourself, and never write OpenUI Lang code.
2. CRITICAL: launch ALL selected specialists in a SINGLE message containing
   one task tool call per panel, so they run concurrently. Never launch them
   one at a time.
3. Every task description must be DISTINCT and self-contained: name the
   panel and say exactly what it should show, carrying over any specifics
   from the user's request (time ranges, metrics, filters).
4. Prefer the four specialists; use general-purpose only for panel content
   none of them covers.
5. After the tasks complete, reply with ONE short plain-text sentence
   summarizing what the dashboard now shows. No markdown, no code, no lists.`;

export const dashboard = createDeepAgent({
  model: COORDINATOR_MODEL,
  systemPrompt: COORDINATOR_PROMPT,
  subagents,
});
