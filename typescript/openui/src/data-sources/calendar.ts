import {
  asArray,
  asNumber,
  asRecord,
  asString,
  execJson,
  fetchJson,
  requiredEnv,
} from "./runtime.js";

type CalendarTransport = "auto" | "api" | "gog";
type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

let cachedAccessToken:
  | { token: string; expiresAt: number }
  | undefined;

const calendarTransport = (): CalendarTransport => {
  const value = process.env.GOOGLE_CALENDAR_TRANSPORT ?? "auto";
  if (!["auto", "api", "gog"].includes(value)) {
    throw new Error("GOOGLE_CALENDAR_TRANSPORT must be auto, api, or gog");
  }
  return value as CalendarTransport;
};

const hasGoogleApiCredentials = (): boolean =>
  Boolean(
    process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
      (process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim() &&
        process.env.GOOGLE_REFRESH_TOKEN?.trim())
  );

const googleAccessToken = async (): Promise<string> => {
  const direct = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (direct) return direct;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const body = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: requiredEnv("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const response = await fetchJson<Record<string, unknown>>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const token = asString(response.access_token);
  if (!token) throw new Error("Google OAuth refresh did not return an access token");
  cachedAccessToken = {
    token,
    expiresAt: Date.now() + Math.max(60, asNumber(response.expires_in, 3600) - 60) * 1000,
  };
  return token;
};

const googleCalendarGet = async (
  timeMin: Date,
  timeMax: Date,
  maxResults: number
): Promise<Record<string, unknown>[]> => {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events`
  );
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(maxResults));

  const response = await fetchJson<Record<string, unknown>>(url, {
    headers: { Authorization: `Bearer ${await googleAccessToken()}` },
  });
  return asArray(response.items).map(asRecord);
};

const extractGogEvents = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.map(asRecord);
  const record = asRecord(value);
  for (const key of ["events", "items", "results", "data"]) {
    if (Array.isArray(record[key])) return asArray(record[key]).map(asRecord);
  }
  return [];
};

const gogCalendarGet = async (
  timeMin: Date,
  timeMax: Date,
  maxResults: number
): Promise<Record<string, unknown>[]> => {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const args = [
    "calendar",
    "events",
    calendarId,
    "--from",
    timeMin.toISOString(),
    "--to",
    timeMax.toISOString(),
    "--max",
    String(maxResults),
    "--json",
    "--results-only",
    "--no-input",
  ];
  const account = process.env.GOG_ACCOUNT?.trim();
  if (account) args.push("--account", account);
  return extractGogEvents(await execJson<unknown>("gog", args));
};

const calendarEvents = async (
  timeMin: Date,
  timeMax: Date,
  maxResults: number
): Promise<Record<string, unknown>[]> => {
  const transport = calendarTransport();
  if (transport === "api" || (transport === "auto" && hasGoogleApiCredentials())) {
    return googleCalendarGet(timeMin, timeMax, maxResults);
  }
  return gogCalendarGet(timeMin, timeMax, maxResults);
};

const eventDate = (
  event: Record<string, unknown>,
  edge: "start" | "end"
): string => {
  const value = event[edge];
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return asString(record.dateTime) || asString(record.date);
};

const normalizeEvent = (event: Record<string, unknown>) => {
  const attendees = asArray(event.attendees)
    .map((value) => {
      if (typeof value === "string") return value;
      const attendee = asRecord(value);
      return asString(attendee.displayName) || asString(attendee.email);
    })
    .filter(Boolean);
  const conference = asArray(asRecord(event.conferenceData).entryPoints)
    .map(asRecord)
    .find((entry) => asString(entry.entryPointType) === "video");

  return {
    id: asString(event.id),
    title: asString(event.summary) || asString(event.title, "Busy"),
    start: eventDate(event, "start"),
    end: eventDate(event, "end"),
    attendees,
    ...(asString(event.location) ? { location: asString(event.location) } : {}),
    ...(asString(event.hangoutLink) || asString(conference?.uri)
      ? {
          conferenceLink:
            asString(event.hangoutLink) || asString(conference?.uri),
        }
      : {}),
  };
};

const zonedParts = (date: Date, timeZone: string): DateParts => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
};

const timeZoneOffset = (date: Date, timeZone: string): number => {
  const parts = zonedParts(date, timeZone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) - date.getTime()
  );
};

const zonedDate = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date => {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(target - timeZoneOffset(new Date(target), timeZone));
  result = new Date(target - timeZoneOffset(result, timeZone));
  return result;
};

const targetDay = (
  dayOffset: number,
  timeZone: string
): { year: number; month: number; day: number } => {
  const today = zonedParts(new Date(), timeZone);
  const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const parseClock = (value: string, fallbackHour: number): [number, number] => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return [fallbackHour, 0];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return [fallbackHour, 0];
  return [hour, minute];
};

export const getLiveUpcomingEvents = async (
  maxResults: number
): Promise<unknown> => {
  const from = new Date();
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  const events = await calendarEvents(from, to, maxResults);
  return { events: events.map(normalizeEvent) };
};

export const getLiveDaySchedule = async (
  dayOffset: number
): Promise<unknown> => {
  const timeZone =
    process.env.GOOGLE_CALENDAR_TIME_ZONE?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = targetDay(dayOffset, timeZone);
  const start = zonedDate(day.year, day.month, day.day, 0, 0, timeZone);
  const endDay = targetDay(dayOffset + 1, timeZone);
  const end = zonedDate(endDay.year, endDay.month, endDay.day, 0, 0, timeZone);
  const events = await calendarEvents(start, end, 100);
  const normalized = events.map(normalizeEvent);
  const [startHour, startMinute] = parseClock(
    process.env.CALENDAR_WORKDAY_START ?? "09:00",
    9
  );
  const [endHour, endMinute] = parseClock(
    process.env.CALENDAR_WORKDAY_END ?? "18:00",
    18
  );
  const workStart = zonedDate(
    day.year,
    day.month,
    day.day,
    startHour,
    startMinute,
    timeZone
  );
  const workEnd = zonedDate(
    day.year,
    day.month,
    day.day,
    endHour,
    endMinute,
    timeZone
  );
  const busy = events
    .filter((event) => asString(event.transparency) !== "transparent")
    .map((event) => ({
      start: new Date(eventDate(event, "start")),
      end: new Date(eventDate(event, "end")),
    }))
    .filter(
      (block) =>
        Number.isFinite(block.start.getTime()) &&
        Number.isFinite(block.end.getTime()) &&
        block.end > workStart &&
        block.start < workEnd
    )
    .map((block) => ({
      start: new Date(Math.max(block.start.getTime(), workStart.getTime())),
      end: new Date(Math.min(block.end.getTime(), workEnd.getTime())),
    }))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: Array<{ start: Date; end: Date }> = [];

  for (const block of busy) {
    const last = merged.at(-1);
    if (last && block.start <= last.end) {
      if (block.end > last.end) last.end = block.end;
    } else {
      merged.push(block);
    }
  }

  const freeBlocks: Array<{ start: string; end: string }> = [];
  let cursor = workStart;
  for (const block of merged) {
    if (block.start.getTime() - cursor.getTime() >= 30 * 60 * 1000) {
      freeBlocks.push({
        start: cursor.toISOString(),
        end: block.start.toISOString(),
      });
    }
    if (block.end > cursor) cursor = block.end;
  }
  if (workEnd.getTime() - cursor.getTime() >= 30 * 60 * 1000) {
    freeBlocks.push({ start: cursor.toISOString(), end: workEnd.toISOString() });
  }

  return {
    date: `${day.year}-${String(day.month).padStart(2, "0")}-${String(
      day.day
    ).padStart(2, "0")}`,
    timeZone,
    freeBlocks,
    events: normalized.map(({ title, start: eventStart, end: eventEnd }) => ({
      title,
      start: eventStart,
      end: eventEnd,
    })),
  };
};
