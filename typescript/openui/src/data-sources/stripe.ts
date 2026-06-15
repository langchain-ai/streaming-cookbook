import {
  asArray,
  asNumber,
  asRecord,
  asString,
  fetchJson,
  requiredEnv,
} from "./runtime.js";

type QueryPair = readonly [string, string];

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  "bhd",
  "jod",
  "kwd",
  "omr",
  "tnd",
]);

const currencyAmount = (amount: unknown, currency: string): number => {
  const exponent = ZERO_DECIMAL_CURRENCIES.has(currency)
    ? 0
    : THREE_DECIMAL_CURRENCIES.has(currency)
      ? 3
      : 2;
  return asNumber(amount) / 10 ** exponent;
};

const stripeGet = async (
  path: string,
  query: QueryPair[] = []
): Promise<Record<string, unknown>> => {
  const url = new URL(`https://api.stripe.com${path}`);
  for (const [key, value] of query) url.searchParams.append(key, value);

  return fetchJson(url, {
    headers: {
      Authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`,
    },
  });
};

const stripeList = async (
  path: string,
  query: QueryPair[] = [],
  maxPages = 20
): Promise<Record<string, unknown>[]> => {
  const collected: Record<string, unknown>[] = [];
  let startingAfter = "";

  for (let page = 0; page < maxPages; page += 1) {
    const params: QueryPair[] = [...query, ["limit", "100"]];
    if (startingAfter) params.push(["starting_after", startingAfter]);
    const response = await stripeGet(path, params);
    const rows = asArray(response.data).map(asRecord);
    collected.push(...rows);

    if (response.has_more !== true || rows.length === 0) break;
    startingAfter = asString(rows.at(-1)?.id);
    if (!startingAfter) break;
  }

  return collected;
};

const unixSeconds = (date: Date): string =>
  String(Math.floor(date.getTime() / 1000));

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

export const getLiveStripeBalance = async (): Promise<unknown> => {
  const balance = await stripeGet("/v1/balance");
  const normalize = (entry: unknown) => {
    const item = asRecord(entry);
    const currency = asString(item.currency, "usd").toLowerCase();
    return {
      amount: currencyAmount(item.amount, currency),
      currency: currency.toUpperCase(),
    };
  };

  return {
    available: asArray(balance.available).map(normalize),
    pending: asArray(balance.pending).map(normalize),
  };
};

export const getLiveStripeCharges = async (
  limit: number
): Promise<unknown> => {
  const response = await stripeGet("/v1/charges", [
    ["limit", String(limit)],
    ["expand[]", "data.customer"],
  ]);

  return {
    data: asArray(response.data).map((value) => {
      const charge = asRecord(value);
      const currency = asString(charge.currency, "usd").toLowerCase();
      const customer = asRecord(charge.customer);
      const billing = asRecord(charge.billing_details);
      const created = asNumber(charge.created);
      const refunded = charge.refunded === true || asNumber(charge.amount_refunded) > 0;
      const succeeded = charge.paid === true && asString(charge.failure_code) === "";

      return {
        id: asString(charge.id),
        customer:
          asString(customer.name) ||
          asString(customer.email) ||
          asString(billing.name) ||
          asString(billing.email) ||
          asString(charge.customer, "Unknown customer"),
        amount: currencyAmount(charge.amount, currency),
        currency: currency.toUpperCase(),
        status: refunded ? "refunded" : succeeded ? "succeeded" : "failed",
        description: asString(charge.description, "Stripe charge"),
        created: created ? new Date(created * 1000).toISOString() : "",
      };
    }),
  };
};

export const getLiveStripeRevenue = async (
  days: number
): Promise<unknown> => {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const charges = await stripeList("/v1/charges", [
    ["created[gte]", unixSeconds(from)],
  ]);
  const configuredCurrency = process.env.STRIPE_CURRENCY?.trim().toLowerCase();
  const currency =
    configuredCurrency ||
    asString(charges.find((charge) => charge.paid === true)?.currency, "usd");
  const totals = new Map<string, number>();

  for (let index = 0; index < days; index += 1) {
    const day = new Date(from);
    day.setUTCDate(from.getUTCDate() + index);
    totals.set(dateKey(day), 0);
  }

  for (const charge of charges) {
    if (charge.paid !== true || asString(charge.currency) !== currency) continue;
    const created = asNumber(charge.created);
    if (!created) continue;
    const key = dateKey(new Date(created * 1000));
    if (!totals.has(key)) continue;
    const netMinor = asNumber(charge.amount) - asNumber(charge.amount_refunded);
    totals.set(key, (totals.get(key) ?? 0) + currencyAmount(netMinor, currency));
  }

  return {
    currency: currency.toUpperCase(),
    daily: [...totals].map(([date, amount]) => ({
      date,
      amount: Number(amount.toFixed(2)),
    })),
  };
};

const monthlyAmount = (item: Record<string, unknown>, currency: string): number => {
  const price = asRecord(item.price);
  const recurring = asRecord(price.recurring);
  const interval = asString(recurring.interval);
  const intervalCount = Math.max(1, asNumber(recurring.interval_count, 1));
  const quantity = Math.max(1, asNumber(item.quantity, 1));
  const amount = currencyAmount(
    price.unit_amount ?? price.unit_amount_decimal,
    currency
  ) * quantity;

  if (interval === "year") return amount / (12 * intervalCount);
  if (interval === "week") return amount * (52 / 12) / intervalCount;
  if (interval === "day") return amount * (365 / 12) / intervalCount;
  return amount / intervalCount;
};

export const getLiveStripeSubscriptions = async (): Promise<unknown> => {
  const active = await stripeList("/v1/subscriptions", [
    ["status", "all"],
    ["expand[]", "data.items.data.price.product"],
  ]);
  const current = active.filter((subscription) =>
    ["active", "trialing"].includes(asString(subscription.status))
  );
  const currency =
    process.env.STRIPE_CURRENCY?.trim().toLowerCase() ||
    asString(current.at(0)?.currency, "usd");
  const byPlan = new Map<string, { count: number; mrr: number }>();
  let mrr = 0;

  for (const subscription of current) {
    if (asString(subscription.currency, currency) !== currency) continue;
    for (const rawItem of asArray(asRecord(subscription.items).data)) {
      const item = asRecord(rawItem);
      const price = asRecord(item.price);
      const product = asRecord(price.product);
      const name =
        asString(product.name) ||
        asString(price.nickname) ||
        asString(product.id) ||
        "Other";
      const itemMrr = monthlyAmount(item, currency);
      const entry = byPlan.get(name) ?? { count: 0, mrr: 0 };
      entry.count += Math.max(1, asNumber(item.quantity, 1));
      entry.mrr += itemMrr;
      byPlan.set(name, entry);
      mrr += itemMrr;
    }
  }

  const cutoff = Date.now() / 1000 - 30 * 24 * 60 * 60;
  const canceled30d = active.filter(
    (subscription) =>
      asString(subscription.status) === "canceled" &&
      asNumber(subscription.canceled_at) >= cutoff
  ).length;
  const churnBase = current.length + canceled30d;

  return {
    totalActive: current.length,
    currency: currency.toUpperCase(),
    mrr: Number(mrr.toFixed(2)),
    churn30d: churnBase
      ? Number(((canceled30d / churnBase) * 100).toFixed(1))
      : 0,
    byPlan: [...byPlan.entries()]
      .map(([plan, value]) => ({
        plan,
        count: value.count,
        mrr: Number(value.mrr.toFixed(2)),
      }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 6),
  };
};
