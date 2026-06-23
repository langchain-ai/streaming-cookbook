/**
 * Smoke test for the deepagents dashboard.
 *
 * Starts a run against the local LangGraph dev server and consumes it the
 * same way the React client does: discover subagents as the coordinator
 * delegates, then read each subagent's namespace-scoped message stream.
 * Prints per-panel timing/size stats and a producer trace proving the
 * panels stream concurrently.
 *
 * Usage (dev server must be running):
 *   pnpm smoke
 */
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({
  apiUrl: process.env.LANGGRAPH_API_URL ?? "http://localhost:2024",
});
const thread = client.threads.stream({ assistantId: "dashboard" });

const t0 = Date.now();
const at = () => Number(((Date.now() - t0) / 1000).toFixed(1));

type PanelStats = {
  task?: string;
  chars: number;
  deltas: number;
  firstDeltaAt?: number;
  lastDeltaAt?: number;
  firstLine?: string;
  done: boolean;
};
const stats: Record<string, PanelStats> = {};
const trace: string[] = [];

const consumeSubagent = async (sub: {
  name: string;
  callId: string;
  taskInput: Promise<string>;
  output: Promise<unknown>;
  messages: AsyncIterable<{ text: AsyncIterable<string> }>;
}): Promise<void> => {
  const label = `${sub.name}#${sub.callId.slice(0, 6)}`;
  const slot: PanelStats = (stats[label] = { chars: 0, deltas: 0, done: false });
  console.log(`[${at()}s] discovered subagent ${label}`);
  sub.taskInput
    .then((task) => {
      slot.task = task.slice(0, 90);
    })
    .catch(() => {});
  sub.output
    .then(() => {
      slot.done = true;
      console.log(`[${at()}s] ${label} done (${slot.chars} chars)`);
    })
    .catch((error: unknown) => {
      console.log(`[${at()}s] ${label} ERRORED: ${String(error).slice(0, 120)}`);
    });
  let text = "";
  for await (const msg of sub.messages) {
    text = "";
    for await (const delta of msg.text) {
      text += delta;
      slot.chars += delta.length;
      slot.deltas += 1;
      slot.firstDeltaAt ??= at();
      slot.lastDeltaAt = at();
      trace.push(sub.name.slice(0, 2));
    }
    slot.firstLine = text.split("\n")[0]?.slice(0, 80);
  }
};

const consumers: Promise<void>[] = [];

// Discover subagents for as long as the run is producing them.
const discovery = (async () => {
  for await (const sub of thread.subagents) {
    consumers.push(consumeSubagent(sub));
  }
})();

await thread.run.start({
  input: {
    messages: [
      {
        role: "user",
        content:
          "Build my dashboard: revenue and payments, product analytics, engineering activity, and my schedule for the next few days.",
      },
    ],
  },
});

const finalState = (await thread.output) as { messages?: Array<{ content?: unknown }> };
console.log(`[${at()}s] run finished, waiting for message tails...`);
// Subagent message iterables are thread-scoped; give their tails a moment,
// then stop waiting on the still-open discovery iterator.
await Promise.race([
  Promise.allSettled(consumers),
  new Promise((resolve) => setTimeout(resolve, 4000)),
]);
void discovery;

const last = finalState.messages?.at(-1);
console.log("\ncoordinator summary:", typeof last?.content === "string" ? last.content : JSON.stringify(last?.content)?.slice(0, 200));

console.log("\nper-panel stats:");
for (const [label, s] of Object.entries(stats)) {
  console.log(
    `  ${label.padEnd(24)} task=${JSON.stringify(s.task ?? "?")}\n` +
      `  ${"".padEnd(24)} deltas=${s.deltas} chars=${s.chars} window=${s.firstDeltaAt}s..${s.lastDeltaAt}s done=${s.done}\n` +
      `  ${"".padEnd(24)} firstLine=${JSON.stringify(s.firstLine ?? "")}`
  );
}

// Interleaving proof: concurrent panels produce a mixed producer trace and
// overlapping [firstDeltaAt, lastDeltaAt] windows; sequential panels would
// produce contiguous blocks.
const step = Math.max(1, Math.floor(trace.length / 100));
console.log(`\ndownsampled producer trace (${trace.length} deltas):`);
console.log("  " + trace.filter((_, i) => i % step === 0).join(""));
console.log("distinct producers:", new Set(trace).size);

const windows = Object.values(stats)
  .filter((s) => s.firstDeltaAt !== undefined)
  .map((s) => [s.firstDeltaAt!, s.lastDeltaAt!] as const)
  .sort((a, b) => a[0] - b[0]);
// A window overlaps the run-so-far if it starts before the latest end seen
// among all earlier windows (not just its immediate predecessor).
let maxEnd = -Infinity;
let overlapping = 0;
for (const [start, end] of windows) {
  if (start <= maxEnd) overlapping += 1;
  maxEnd = Math.max(maxEnd, end);
}
console.log(`overlapping stream windows: ${overlapping}/${Math.max(0, windows.length - 1)}`);

const panelCount = Object.keys(stats).length;
const allDone = Object.values(stats).every((s) => s.done && s.chars > 0);
const concurrent = panelCount < 2 || (new Set(trace).size >= 2 && overlapping >= 1);
const pass = panelCount >= 2 && allDone && concurrent;
console.log(
  pass
    ? "SMOKE PASS"
    : `SMOKE FAIL (panels=${panelCount} allDone=${allDone} concurrent=${concurrent})`
);
process.exit(pass ? 0 : 1);
