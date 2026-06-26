import { Client } from "@langchain/langgraph-sdk";
const client = new Client({ apiUrl: "http://127.0.0.1:2024" });
const thread = await client.threads.create();
const stream = client.runs.stream(thread.thread_id, "deep_agent_code_review", {
  input: { messages: [{ type: "human", content: "Review the todo-api project." }] },
  streamMode: ["updates"],
});
const dispatched = new Set();
const start = Date.now();
for await (const ev of stream) {
  if (Date.now() - start > 70000) { console.log("...stop 70s"); break; }
  if (ev.event === "error") { console.log("ERROR", JSON.stringify(ev.data)); break; }
  if (ev.event === "updates" && ev.data) {
    for (const [, val] of Object.entries(ev.data)) {
      for (const c of val?.messages?.flatMap?.(m => m.tool_calls ?? []) ?? []) {
        if (c.name === "task") { const d = JSON.stringify(c.args?.description); if(!dispatched.has(d)){dispatched.add(d);console.log("DISPATCH", d);} }
      }
    }
  }
}
console.log("dispatched reviewers:", dispatched.size);
