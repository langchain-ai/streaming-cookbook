/**
 * Stable tool contracts for the four dashboard panel agents.
 *
 * DATA_MODE controls whether the execute bodies use deterministic mocks,
 * live provider adapters, or an explicitly enabled live-to-mock fallback.
 * Tool names, schemas, and display-ready return shapes stay constant.
 *
 * @module tools
 */

import { tool } from "langchain";
import { z } from "zod/v4";

import {
  getLiveCommitActivity,
  getLiveConversionFunnel,
  getLiveDaySchedule,
  getLiveGithubRepos,
  getLiveProductTrends,
  getLiveRecentActivity,
  getLiveStripeBalance,
  getLiveStripeCharges,
  getLiveStripeRevenue,
  getLiveStripeSubscriptions,
  getLiveTopEvents,
  getLiveUpcomingEvents,
  runDataSource,
} from "./data-sources/index.js";

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Local calendar date (yyyy-mm-dd) for `daysAgo` days before today.
 * Built from local date components — `toISOString()` would shift the
 * calendar day for any machine east of UTC.
 */
const isoDay = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Local wall-clock datetime, deliberately timezone-less (no trailing Z):
 * the panel agents display these literally as "the user's local time",
 * which is exactly what a 10:00 meeting mock means.
 */
const isoAt = (days: number, hour: number, minutes = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minutes, 0, 0);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  );
};

/**
 * Deterministic "organic" series: growth trend + weekly seasonality.
 * No randomness, so repeated demo runs chart the same curves. The weekday
 * comes from the same local Date used for the label — re-parsing an ISO
 * date string would compute UTC-midnight weekdays and slide the weekend
 * dips onto weekdays in some timezones.
 */
const series = (days: number, base: number, growth: number, swing: number): number[] =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const weekday = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
    const weekend = weekday >= 5 ? -swing : 0;
    const wave = Math.sin(i / 2.7) * swing * 0.4;
    return Math.max(0, Math.round(base + i * growth + wave + weekend));
  });

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

const getStripeBalance = tool(
  async () =>
    runDataSource("stripe", getLiveStripeBalance, () => ({
      available: [{ amount: 12_845.03, currency: "USD" }],
      pending: [{ amount: 2_409.75, currency: "USD" }],
    })),
  {
    name: "get_stripe_balance",
    description:
      "Current Stripe account balance. Returns { available: [{amount, currency}], pending: [{amount, currency}] }. Amounts are normalized currency units ready for display.",
    schema: z.object({}),
  }
);

const CHARGES = [
  { customer: "Acme Corp", amount: 49_900, status: "succeeded", description: "Scale plan — annual" },
  { customer: "Globex", amount: 9_900, status: "succeeded", description: "Growth plan — monthly" },
  { customer: "Initech", amount: 2_900, status: "succeeded", description: "Starter plan — monthly" },
  { customer: "Umbrella Health", amount: 49_900, status: "succeeded", description: "Scale plan — annual" },
  { customer: "Hooli", amount: 9_900, status: "refunded", description: "Growth plan — monthly" },
  { customer: "Stark Industries", amount: 119_000, status: "succeeded", description: "Enterprise — annual" },
  { customer: "Wayne Enterprises", amount: 9_900, status: "succeeded", description: "Growth plan — monthly" },
  { customer: "Pied Piper", amount: 2_900, status: "failed", description: "Starter plan — monthly" },
  { customer: "Wonka Digital", amount: 9_900, status: "succeeded", description: "Growth plan — monthly" },
  { customer: "Tyrell Corp", amount: 49_900, status: "succeeded", description: "Scale plan — annual" },
  { customer: "Aperture Labs", amount: 2_900, status: "succeeded", description: "Starter plan — monthly" },
  { customer: "Cyberdyne", amount: 9_900, status: "succeeded", description: "Growth plan — monthly" },
];

const getStripeCharges = tool(
  async ({ limit }) => {
    const resultLimit = limit ?? 10;
    return runDataSource(
      "stripe",
      () => getLiveStripeCharges(resultLimit),
      () => ({
        data: CHARGES.slice(0, resultLimit).map((c, i) => ({
          id: `ch_3Q${(1000 + i).toString(36)}`,
          ...c,
          amount: c.amount / 100,
          currency: "USD",
          created: `${isoDay(i)}T1${i % 10}:24:00`,
        })),
      })
    );
  },
  {
    name: "get_stripe_charges",
    description:
      "Recent Stripe charges, newest first. Returns { data: [{id, customer, amount, currency, status, description, created}] }. Amounts are normalized currency units; status is succeeded | refunded | failed.",
    schema: z.object({
      limit: z.number().int().min(1).max(12).optional().describe("Max charges to return (default 10)"),
    }),
  }
);

const getStripeRevenue = tool(
  async ({ days }) => {
    const n = days ?? 30;
    return runDataSource(
      "stripe",
      () => getLiveStripeRevenue(n),
      () => {
        const daily = series(n, 180_000, 2_400, 35_000);
        return {
          currency: "USD",
          daily: daily.map((amount, i) => ({
            date: isoDay(n - 1 - i),
            amount: amount / 100,
          })),
        };
      }
    );
  },
  {
    name: "get_stripe_revenue",
    description:
      "Daily gross revenue for the last N days. Returns { currency, daily: [{date, amount}] } oldest first. Amounts are normalized currency units ready for charting.",
    schema: z.object({
      days: z.number().int().min(7).max(90).optional().describe("Window in days (default 30)"),
    }),
  }
);

const getStripeSubscriptions = tool(
  async () =>
    runDataSource("stripe", getLiveStripeSubscriptions, () => ({
      totalActive: 412,
      currency: "USD",
      mrr: 58_400,
      churn30d: 1.8,
      byPlan: [
        { plan: "Starter", count: 218, mrr: 6_322 },
        { plan: "Growth", count: 152, mrr: 15_048 },
        { plan: "Scale", count: 36, mrr: 14_970 },
        { plan: "Enterprise", count: 6, mrr: 22_060 },
      ],
    })),
  {
    name: "get_stripe_subscriptions",
    description:
      "Active subscription summary. Returns { totalActive, mrr, churn30d, byPlan: [{plan, count, mrr}] }. MRR values are normalized currency units; churn30d is a percentage.",
    schema: z.object({}),
  }
);

export const stripeTools = [
  getStripeBalance,
  getStripeCharges,
  getStripeRevenue,
  getStripeSubscriptions,
];

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------

const getProductTrends = tool(
  async ({ event, days }) => {
    const n = days ?? 14;
    const name = event ?? "$pageview";
    return runDataSource(
      "posthog",
      () => getLiveProductTrends(name, n),
      () => {
        const base = name === "$pageview" ? 4_200 : 950;
        const data = series(n, base, base / 40, base / 6);
        return {
          event: name,
          labels: data.map((_, i) => isoDay(n - 1 - i)),
          data,
        };
      }
    );
  },
  {
    name: "get_product_trends",
    description:
      "Daily counts for one product event. Returns { event, labels: [dates oldest first], data: [numbers] }. labels and data are parallel arrays sized for charting.",
    schema: z.object({
      event: z.string().optional().describe('Event name, e.g. "$pageview" or "signup" (default "$pageview")'),
      days: z.number().int().min(7).max(90).optional().describe("Window in days (default 14)"),
    }),
  }
);

const getTopEvents = tool(
  async ({ limit }) => {
    const resultLimit = limit ?? 6;
    return runDataSource(
      "posthog",
      () => getLiveTopEvents(resultLimit),
      () => ({
        events: [
          { name: "$pageview", count: 61_204, change7d: 8.2 },
          { name: "dashboard_viewed", count: 18_330, change7d: 12.5 },
          { name: "signup", count: 1_842, change7d: 4.1 },
          { name: "report_exported", count: 1_366, change7d: -2.3 },
          { name: "invite_sent", count: 912, change7d: 17.8 },
          { name: "billing_upgraded", count: 188, change7d: 6.4 },
        ].slice(0, resultLimit),
      })
    );
  },
  {
    name: "get_top_events",
    description:
      "Most frequent product events over the last 30 days. Returns { events: [{name, count, change7d}] }. change7d is the week-over-week percentage change.",
    schema: z.object({
      limit: z.number().int().min(3).max(6).optional().describe("Max events to return (default 6)"),
    }),
  }
);

const getConversionFunnel = tool(
  async () =>
    runDataSource("posthog", getLiveConversionFunnel, () => ({
      window: "last 30 days",
      method: "ordered demo funnel",
      steps: [
        { name: "Visited landing page", count: 48_210, conversionFromPrevious: 100 },
        { name: "Signed up", count: 1_842, conversionFromPrevious: 3.8 },
        { name: "Created first dashboard", count: 1_124, conversionFromPrevious: 61 },
        { name: "Invited a teammate", count: 487, conversionFromPrevious: 43.3 },
        { name: "Upgraded to paid", count: 188, conversionFromPrevious: 38.6 },
      ],
    })),
  {
    name: "get_conversion_funnel",
    description:
      "Signup-to-paid conversion funnel. Returns { window, steps: [{name, count, conversionFromPrevious}] }. conversionFromPrevious is a percentage of the previous step.",
    schema: z.object({}),
  }
);

export const posthogTools = [getProductTrends, getTopEvents, getConversionFunnel];

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

const getGithubRepos = tool(
  async () =>
    runDataSource("github", getLiveGithubRepos, () => ({
      repos: [
        { name: "openui", fullName: "thesysdev/openui", language: "TypeScript", stars: 4_812, openIssues: 37, openPRs: 12 },
        { name: "platform-api", fullName: "thesysdev/platform-api", language: "Go", stars: 214, openIssues: 18, openPRs: 6 },
        { name: "web-app", fullName: "thesysdev/web-app", language: "TypeScript", stars: 98, openIssues: 24, openPRs: 9 },
        { name: "docs", fullName: "thesysdev/docs", language: "MDX", stars: 41, openIssues: 8, openPRs: 3 },
        { name: "infra", fullName: "thesysdev/infra", language: "HCL", stars: 12, openIssues: 5, openPRs: 2 },
      ],
    })),
  {
    name: "get_github_repos",
    description:
      "The organization's main repositories. Returns { repos: [{name, fullName, language, stars, openIssues, openPRs}] }.",
    schema: z.object({}),
  }
);

const getRecentActivity = tool(
  async ({ limit }) => {
    const resultLimit = limit ?? 8;
    return runDataSource(
      "github",
      () => getLiveRecentActivity(resultLimit),
      () => ({
        items: [
          { type: "pr", title: "feat: streaming selectors for subagent panels", repo: "openui", state: "open", author: "visharad", updatedAt: `${isoDay(0)}T09:12:00Z` },
          { type: "pr", title: "fix: parser watermark reset on non-append buffers", repo: "openui", state: "merged", author: "mika", updatedAt: `${isoDay(0)}T07:48:00Z` },
          { type: "issue", title: "Renderer drops unresolved refs inside @Each", repo: "openui", state: "open", author: "tobias", updatedAt: `${isoDay(1)}T18:05:00Z` },
          { type: "pr", title: "chore: bump langgraph to 1.4", repo: "platform-api", state: "open", author: "ana", updatedAt: `${isoDay(1)}T15:30:00Z` },
          { type: "issue", title: "Billing webhook retries exhaust queue", repo: "platform-api", state: "closed", author: "dev-bot", updatedAt: `${isoDay(2)}T11:22:00Z` },
          { type: "pr", title: "docs: deep agents event streaming guide", repo: "docs", state: "merged", author: "visharad", updatedAt: `${isoDay(2)}T08:14:00Z` },
          { type: "issue", title: "Flaky e2e: dashboard panel skeleton timing", repo: "web-app", state: "open", author: "ci-bot", updatedAt: `${isoDay(3)}T21:40:00Z` },
          { type: "pr", title: "feat: per-panel error boundaries", repo: "web-app", state: "open", author: "mika", updatedAt: `${isoDay(3)}T16:55:00Z` },
        ].slice(0, resultLimit),
      })
    );
  },
  {
    name: "get_recent_activity",
    description:
      "Recent pull requests and issues across the org, newest first. Returns { items: [{type: 'pr'|'issue', title, repo, state, author, updatedAt}] }.",
    schema: z.object({
      limit: z.number().int().min(3).max(8).optional().describe("Max items to return (default 8)"),
    }),
  }
);

const getCommitActivity = tool(
  async ({ weeks }) => {
    const n = weeks ?? 12;
    return runDataSource(
      "github",
      () => getLiveCommitActivity(n),
      () => {
        const weekly = series(n, 58, 1.5, 14);
        return {
          scope: "demo organization",
          weekly: weekly.map((commits, i) => ({
            weekStart: isoDay((n - i) * 7),
            commits,
          })),
        };
      }
    );
  },
  {
    name: "get_commit_activity",
    description:
      "Org-wide commits per week for the last N weeks. Returns { weekly: [{weekStart, commits}] } oldest first.",
    schema: z.object({
      weeks: z.number().int().min(4).max(26).optional().describe("Window in weeks (default 12)"),
    }),
  }
);

export const githubTools = [getGithubRepos, getRecentActivity, getCommitActivity];

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

const getUpcomingEvents = tool(
  async ({ maxResults }) => {
    const resultLimit = maxResults ?? 7;
    return runDataSource(
      "google-calendar",
      () => getLiveUpcomingEvents(resultLimit),
      () => ({
        events: [
          { id: "ev_1", title: "Leadership sync", start: isoAt(0, 10, 0), end: isoAt(0, 10, 45), attendees: ["you", "COO", "VP Eng"], conferenceLink: "https://meet.example.com/lead-sync" },
          { id: "ev_2", title: "Board deck review", start: isoAt(0, 14, 0), end: isoAt(0, 15, 0), attendees: ["you", "CFO"], location: "War room" },
          { id: "ev_3", title: "1:1 — VP Engineering", start: isoAt(0, 16, 30), end: isoAt(0, 17, 0), attendees: ["you", "VP Eng"] },
          { id: "ev_4", title: "Customer call: Acme Corp renewal", start: isoAt(1, 9, 30), end: isoAt(1, 10, 15), attendees: ["you", "AE", "Acme CTO"], conferenceLink: "https://meet.example.com/acme" },
          { id: "ev_5", title: "Product review — dashboards GA", start: isoAt(1, 13, 0), end: isoAt(1, 14, 0), attendees: ["you", "PM", "Design lead"] },
          { id: "ev_6", title: "Investor update drafting", start: isoAt(2, 11, 0), end: isoAt(2, 12, 0), attendees: ["you"] },
          { id: "ev_7", title: "All hands", start: isoAt(4, 17, 0), end: isoAt(4, 18, 0), attendees: ["company"], conferenceLink: "https://meet.example.com/all-hands" },
        ].slice(0, resultLimit),
      })
    );
  },
  {
    name: "get_upcoming_events",
    description:
      "Upcoming calendar events for the next few days, soonest first. Returns { events: [{id, title, start, end, attendees, location?, conferenceLink?}] }. start/end are RFC3339 datetimes or all-day dates.",
    schema: z.object({
      maxResults: z.number().int().min(3).max(7).optional().describe("Max events to return (default 7)"),
    }),
  }
);

const getDaySchedule = tool(
  async ({ dayOffset }) => {
    const offset = dayOffset ?? 0;
    return runDataSource(
      "google-calendar",
      () => getLiveDaySchedule(offset),
      () => {
        const all = [
          { title: "Leadership sync", start: isoAt(offset, 10, 0), end: isoAt(offset, 10, 45) },
          { title: "Board deck review", start: isoAt(offset, 14, 0), end: isoAt(offset, 15, 0) },
          { title: "1:1 — VP Engineering", start: isoAt(offset, 16, 30), end: isoAt(offset, 17, 0) },
        ];
        return {
          date: isoAt(offset, 0).slice(0, 10),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          freeBlocks: [
            { start: isoAt(offset, 11, 0), end: isoAt(offset, 13, 0) },
            { start: isoAt(offset, 15, 0), end: isoAt(offset, 16, 30) },
          ],
          events: all,
        };
      }
    );
  },
  {
    name: "get_day_schedule",
    description:
      "One day's schedule with free blocks. Returns { date, freeBlocks: [{start, end}], events: [{title, start, end}] }. dayOffset 0 = today, 1 = tomorrow.",
    schema: z.object({
      dayOffset: z.number().int().min(0).max(6).optional().describe("Days from today (default 0 = today)"),
    }),
  }
);

export const calendarTools = [getUpcomingEvents, getDaySchedule];
