import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

const checkpointer = new MemorySaver();

const modelName = "gpt-5-mini"
const model = new ChatOpenAI({
  model: process.env.OPENAI_REASONING_MODEL ?? modelName,
  reasoning: { effort: "medium", summary: "auto" },
});

export const agent = createAgent({
  checkpointer,
  model,
});

// non reasoning agent
export const basicAgent = createAgent({
  checkpointer,
  model: modelName,
});
