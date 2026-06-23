import {
  asArray,
  asNumber,
  asString,
  fetchJson,
  requiredEnv,
} from "./runtime.js";

const sqlString = (value: string): string =>
  `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

const posthogQuery = async (
  query: Record<string, unknown>,
  name: string
): Promise<Record<string, unknown>> => {
  const host = (process.env.POSTHOG_HOST ?? "https://us.posthog.com").replace(
    /\/+$/,
    ""
  );
  const projectId = requiredEnv("POSTHOG_PROJECT_ID");
  const response = await fetchJson<Record<string, unknown>>(
    `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("POSTHOG_PERSONAL_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, name }),
    }
  );

  return response;
};

const posthogHogql = async (
  query: string,
  name: string
): Promise<unknown[][]> => {
  const response = await posthogQuery(
    { kind: "HogQLQuery", query },
    name
  );
  return asArray(response.results).map((row) => asArray(row));
};

const utcDay = (daysAgo: number): string => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

export const getLiveProductTrends = async (
  event: string,
  days: number
): Promise<unknown> => {
  const rows = await posthogHogql(
    `SELECT toDate(timestamp) AS day, count() AS total
FROM events
WHERE event = ${sqlString(event)}
  AND timestamp >= now() - INTERVAL ${days} DAY
GROUP BY day
ORDER BY day ASC`,
    `dashboard trend: ${event}`
  );
  const counts = new Map(
    rows.map((row) => [asString(row[0]), asNumber(row[1])] as const)
  );
  const labels = Array.from({ length: days }, (_, index) =>
    utcDay(days - 1 - index)
  );

  return {
    event,
    labels,
    data: labels.map((label) => counts.get(label) ?? 0),
  };
};

export const getLiveTopEvents = async (
  limit: number
): Promise<unknown> => {
  const rows = await posthogHogql(
    `SELECT
  event,
  count() AS total_30d,
  countIf(timestamp >= now() - INTERVAL 7 DAY) AS current_7d,
  countIf(
    timestamp >= now() - INTERVAL 14 DAY
    AND timestamp < now() - INTERVAL 7 DAY
  ) AS previous_7d
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
GROUP BY event
ORDER BY total_30d DESC
LIMIT ${limit}`,
    "dashboard top events"
  );

  return {
    events: rows.map((row) => {
      const current = asNumber(row[2]);
      const previous = asNumber(row[3]);
      return {
        name: asString(row[0]),
        count: asNumber(row[1]),
        change7d:
          previous > 0
            ? Number((((current - previous) / previous) * 100).toFixed(1))
            : current > 0
              ? 100
              : 0,
      };
    }),
  };
};

const funnelConfig = (): { events: string[]; labels: string[] } => {
  const events = (
    process.env.POSTHOG_FUNNEL_EVENTS ??
    "$pageview,signup,dashboard_created,invite_sent,billing_upgraded"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const configuredLabels = (process.env.POSTHOG_FUNNEL_LABELS ?? "")
    .split(",")
    .map((value) => value.trim());

  if (events.length < 2) {
    throw new Error("POSTHOG_FUNNEL_EVENTS must contain at least two events");
  }

  return {
    events,
    labels: events.map((event, index) => configuredLabels[index] || event),
  };
};

export const getLiveConversionFunnel = async (): Promise<unknown> => {
  const { events, labels } = funnelConfig();
  const response = await posthogQuery(
    {
      kind: "FunnelsQuery",
      dateRange: { date_from: "-30d", date_to: null },
      series: events.map((event, index) => ({
        kind: "EventsNode",
        event,
        name: event,
        custom_name: labels[index],
        math: "total",
      })),
      funnelsFilter: {
        funnelOrderType: "ordered",
        funnelVizType: "steps",
        funnelWindowInterval: 30,
        funnelWindowIntervalUnit: "day",
      },
    },
    "dashboard activation funnel"
  );
  const rawResults = asArray(response.results);
  const rows = (
    rawResults.length === 1 && Array.isArray(rawResults[0])
      ? asArray(rawResults[0])
      : rawResults
  ).map((value) =>
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  );

  return {
    window: "last 30 days",
    method: "PostHog ordered funnel",
    steps: events.map((event, index) => {
      const row = rows[index] ?? {};
      const count = asNumber(row.count);
      const previous =
        index === 0 ? count : asNumber(rows[index - 1]?.count);
      return {
        name: labels[index] || asString(row.name, event),
        event,
        count,
        conversionFromPrevious:
          index === 0
            ? 100
            : previous > 0
              ? Number(((count / previous) * 100).toFixed(1))
              : 0,
      };
    }),
  };
};
