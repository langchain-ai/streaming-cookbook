import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "langchain";

const checkpointer = new MemorySaver();

export const agent = createAgent({
  checkpointer,
  model: "openai:gpt-5-mini",
});
