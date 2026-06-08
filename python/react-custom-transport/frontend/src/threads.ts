import { Client } from "@langchain/langgraph-sdk/client";

const STORAGE_KEY = "python-react-custom-transport-thread";

export function readThreadId(): string {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function writeThreadId(threadId: string) {
  sessionStorage.setItem(STORAGE_KEY, threadId);
}

export function createThreadId(): string {
  const id = crypto.randomUUID();
  writeThreadId(id);
  return id;
}

/** Create the thread row server-side so hydrate does not 404. */
export async function ensureThreadExists(apiUrl: string, threadId: string) {
  const client = new Client({ apiUrl });
  try {
    await client.threads.getState(threadId);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status !== 404) throw error;
    await client.threads.updateState(threadId, { values: { messages: [] } });
  }
}

export type EnsureThreadReadyResult = {
  threadId: string;
  reset: boolean;
};

/**
 * Ensure a thread exists on the server. If the stored id cannot be created
 * (e.g. after a backend restart with incompatible in-memory state), mint a
 * fresh thread id and try again.
 */
export async function ensureThreadReady(
  apiUrl: string,
  threadId: string
): Promise<EnsureThreadReadyResult> {
  try {
    await ensureThreadExists(apiUrl, threadId);
    return { threadId, reset: false };
  } catch {
    const freshThreadId = createThreadId();
    await ensureThreadExists(apiUrl, freshThreadId);
    return { threadId: freshThreadId, reset: true };
  }
}
