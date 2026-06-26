import { createDeepAgent } from "deepagents";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import { getOrCreateSandboxForThread, SECURITY_INSTRUCTIONS } from "./sandbox.js";

/**
 * Real-world framing: an automated "code review crew".
 *
 * A project is checked out into a per-thread sandbox (the seeded `todo-api`
 * sample — `package.json`, `README.md`, `src/index.js`, `src/store.js`,
 * `src/router.js` => 5 files). The orchestrator lists the project files,
 * then fans out one `file-reviewer` subagent per file so every file is
 * reviewed in parallel. Once the reviewers report back, the orchestrator
 * synthesizes a single overview for the human.
 *
 * The frontend uses the `@langchain/react` subagent discovery API to render
 * one card per reviewer and lets the user drill into what each one is doing.
 */
export async function agent(runtime: LangGraphRunnableConfig) {
  const threadId = runtime.configurable?.thread_id as string;
  const backend = await getOrCreateSandboxForThread(threadId);

  return createDeepAgent({
    model: "anthropic:claude-haiku-4-5",
    backend,
    systemPrompt: `You are the lead engineer running an automated code review for a Node.js project that lives in /app. The project is a small REST API for managing todos.

Your job is to orchestrate a review crew — you do NOT review files yourself. Follow this exact procedure for every user request:

1. Call your filesystem tools to list every source file under /app, ignoring \`node_modules\`, lockfiles, and hidden files. The seeded project has 5 reviewable files: package.json, README.md, src/index.js, src/store.js, and src/router.js.
2. Write one short sentence stating how many files you found and that you are dispatching one reviewer per file.
3. In the VERY NEXT tool-calling turn, spawn exactly one \`file-reviewer\` subagent per file using multiple task() calls in that single turn so the reviews run in parallel. Each task description must name the single file that reviewer owns (e.g. "Review /app/src/store.js"). Never give one reviewer more than one file. Never spawn a reviewer for node_modules.
4. Do not ask the user any questions. Do not delegate in multiple rounds unless a reviewer failed.
5. After every reviewer returns, write one concise overview (a few sentences plus an optional short bullet list) that summarizes the project's overall health, the most important findings, and the top recommended next steps. Then stop.

${SECURITY_INSTRUCTIONS}`,
    subagents: [
      {
        name: "file-reviewer",
        description:
          "Delegate the review of exactly ONE file in /app. The task description must contain the absolute path of the single file to review. Use one file-reviewer per file so reviews run in parallel.",
        systemPrompt: `You are a senior code reviewer. You have been assigned exactly ONE file in /app. Read only that file from the sandbox, then review it.

Return a short, skimmable review of just that file:
- One sentence describing the file's purpose.
- 2-4 bullet points covering correctness/bugs, security, readability, or maintainability. Call out concrete issues with line-level specifics where useful, or confirm the file looks healthy.
- One bullet with the single most valuable improvement you would make.

Be concise. No preamble, no follow-up questions, and do not review or read any other file or delegate further work.`,
      },
    ],
  }).withConfig({
    recursionLimit: 200,
  });
}
