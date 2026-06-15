import {
  calendarTools,
  githubTools,
  posthogTools,
  stripeTools,
} from "../src/tools.ts";

process.env.DATA_MODE = "mock";
delete process.env.STRIPE_DATA_MODE;
delete process.env.POSTHOG_DATA_MODE;
delete process.env.GITHUB_DATA_MODE;
delete process.env.GOOGLE_CALENDAR_DATA_MODE;

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
    _meta?: { provider?: string; source?: string };
  };
  if (parsed._meta?.source !== "mock") {
    throw new Error(`${dataTool.name} did not use mock mode`);
  }
  console.log(
    `${dataTool.name}: ${parsed._meta.provider}/${parsed._meta.source}`
  );
}

console.log("DATA SOURCE TEST PASS");
