import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DataProvider = "stripe" | "posthog" | "github" | "google-calendar";
export type DataMode = "mock" | "live" | "live-with-mock-fallback";

type JsonObject = Record<string, unknown>;

const DATA_MODES = new Set<DataMode>([
  "mock",
  "live",
  "live-with-mock-fallback",
]);

const providerEnvPrefix = (provider: DataProvider): string =>
  provider.toUpperCase().replaceAll("-", "_");

const readMode = (provider: DataProvider): DataMode => {
  const raw =
    process.env[`${providerEnvPrefix(provider)}_DATA_MODE`] ??
    process.env.DATA_MODE ??
    "mock";

  if (!DATA_MODES.has(raw as DataMode)) {
    throw new Error(
      `Invalid data mode "${raw}" for ${provider}. Use mock, live, or live-with-mock-fallback.`
    );
  }
  return raw as DataMode;
};

export const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const asRecord = (value: unknown): JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
};

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

export const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
};

const withMeta = (
  value: unknown,
  meta: JsonObject
): JsonObject => ({
  ...(typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : { data: value }),
  _meta: {
    ...meta,
    generatedAt: new Date().toISOString(),
  },
});

export const runDataSource = async (
  provider: DataProvider,
  live: () => Promise<unknown>,
  mock: () => unknown | Promise<unknown>
): Promise<string> => {
  let mode: DataMode;
  try {
    mode = readMode(provider);
  } catch (error) {
    return JSON.stringify(
      withMeta({}, {
        provider,
        source: "unavailable",
        error: errorMessage(error),
      })
    );
  }

  if (mode === "mock") {
    return JSON.stringify(
      withMeta(await mock(), { provider, source: "mock", mode })
    );
  }

  try {
    return JSON.stringify(
      withMeta(await live(), { provider, source: "live", mode })
    );
  } catch (error) {
    const message = errorMessage(error);
    if (mode === "live-with-mock-fallback") {
      return JSON.stringify(
        withMeta(await mock(), {
          provider,
          source: "mock",
          mode,
          fallbackReason: message,
        })
      );
    }

    return JSON.stringify(
      withMeta({}, {
        provider,
        source: "unavailable",
        mode,
        error: message,
      })
    );
  }
};

export const fetchJson = async <T>(
  url: string | URL,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: unknown = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const record = asRecord(body);
    const nestedError = asRecord(record.error);
    const detail =
      asString(nestedError.message) ||
      asString(record.message) ||
      (typeof body === "string" ? body : "");
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`
    );
  }

  return body as T;
};

export const execJson = async <T>(
  command: string,
  args: string[]
): Promise<T> => {
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20_000,
  });

  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`${command} returned invalid JSON`);
  }
};
