import { MemorySaver } from "@langchain/langgraph";
import { createDeepAgent, type DeepAgent } from "deepagents";

const checkpointer = new MemorySaver();

export const graph: DeepAgent = createDeepAgent({
  checkpointer,
  model: "gpt-4o-mini",
  systemPrompt: `You are demoing a React reconnect scenario for LangGraph streaming.

Do not call tools. Answer directly in eight short bullets with clear labels for
"before refresh", "during refresh", and "after reconnect". Keep each bullet
specific enough that the response streams for a few seconds in the browser.`,
});
