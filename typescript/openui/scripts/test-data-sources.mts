import {
  calendarTools,
  githubTools,
  posthogTools,
  stripeTools,
} from "../src/tools.ts";
import { runDataSource } from "../src/data-sources/runtime.ts";

delete process.env.STRIPE_SECRET_KEY;
delete process.env.POSTHOG_PERSONAL_API_KEY;
delete process.env.POSTHOG_PROJECT_ID;
delete process.env.GITHUB_TOKEN;
delete process.env.GH_TOKEN;
delete process.env.GOOGLE_ACCESS_TOKEN;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.GOOGLE_REFRESH_TOKEN;

// Avoid picking up locally authenticated CLIs during this deterministic test.
process.env.GITHUB_TRANSPORT = "token";
process.env.GOOGLE_CALENDAR_TRANSPORT = "api";

const liveResult = JSON.parse(
  await runDataSource(
    "stripe",
    async () => ({ value: "live" }),
    () => ({ value: "mock" })
  )
) as { value?: string; _meta?: { source?: string } };
if (liveResult.value !== "live" || liveResult._meta?.source !== "live") {
  throw new Error("runDataSource did not preserve a successful live result");
}

const fallbackResult = JSON.parse(
  await runDataSource(
    "stripe",
    async () => {
      throw new Error("test provider failure");
    },
    () => ({ value: "mock" })
  )
) as {
  value?: string;
  _meta?: { source?: string; fallbackReason?: string };
};
if (
  fallbackResult.value !== "mock" ||
  fallbackResult._meta?.source !== "mock" ||
  fallbackResult._meta.fallbackReason !== "test provider failure"
) {
  throw new Error("runDataSource did not fall back after a provider failure");
}

const cases = [
  [stripeTools[0], {}],
  [stripeTools[1], { limit: 3 }],
  [stripeTools[2], { days: 7 }],
  [stripeTools[3], {}],
  [posthogTools[0], { event: "$pageview", days: 7 }],
  [posthogTools[1], { limit: 3 }],
  [posthogTools[2], {}],
  [githubTools[0], {}],
  [githubTools[1], { limit: 3 }],
  [githubTools[2], { weeks: 4 }],
  [calendarTools[0], { maxResults: 3 }],
  [calendarTools[1], { dayOffset: 0 }],
] as const;

for (const [dataTool, input] of cases) {
  if (!dataTool) throw new Error("Missing data tool");
  const raw = await dataTool.invoke(input);
  if (typeof raw !== "string") {
    throw new Error(`${dataTool.name} returned a non-string result`);
  }
  const parsed = JSON.parse(raw) as {
    _meta?: {
      provider?: string;
      source?: string;
      fallbackReason?: string;
    };
  };
  if (parsed._meta?.source !== "mock") {
    throw new Error(`${dataTool.name} did not fall back to mock data`);
  }
  if (!parsed._meta.fallbackReason) {
    throw new Error(`${dataTool.name} did not explain its mock fallback`);
  }
  console.log(
    `${dataTool.name}: ${parsed._meta.provider}/${parsed._meta.source}`
  );
}

console.log("DATA SOURCE TEST PASS");
