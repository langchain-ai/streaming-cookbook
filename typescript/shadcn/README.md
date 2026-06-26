# Code Review Crew — shadcn + Deep Agents

A self-contained chat application built with the new [shadcn/ui chat components](https://ui.shadcn.com/docs/changelog) (June 2026) and `@langchain/react`, on top of a `createDeepAgent` orchestrator.

It frames a tangible, real-world workflow: **automated code review**. A deep agent checks a small project into a per-thread filesystem sandbox, detects how many files it contains, and spins up **one specialist reviewer subagent per file** so the whole codebase is reviewed in parallel. You can click any reviewer to watch what it is doing live, and the lead engineer (the orchestrator) writes a final overview.

## What it shows

- **Deep agent orchestration** — `createDeepAgent` lists the project files, then fans out one `file-reviewer` subagent per file in a single turn so the reviews run in parallel.
- **Filesystem sandbox** — the agent operates on a seeded `todo-api` project (`package.json`, `README.md`, `src/index.js`, `src/store.js`, `src/router.js` = 5 files) inside a per-thread sandbox.
- **Subagent discovery** — the frontend uses the `@langchain/react` subagent API (`stream.subagents`, `useMessages`, `useToolCalls`) to render one card per reviewer and drill into each one's live transcript.
- **New shadcn chat components** — `MessageScroller`, `Message`, `Bubble`, and `Marker` build the conversation, with the `shimmer` and `scroll-fade` utilities for live status and edge fades.

## Layout

- **Left** — the conversation with the lead engineer (`MessageScroller` + `Message` + `Bubble`), with `Marker` rows for status ("Dispatched 5 reviewers", "Synthesizing the overview…").
- **Right** — the **Review crew** panel: one card per reviewer with file name, language, status, and the latest activity. Click a card to open a dialog with that reviewer's full live transcript.

## Agent

The backing LangGraph agent lives at `src/server/agent.ts` and is registered as the `deep_agent_code_review` graph in `langgraph.json`. Its sandbox helper (`src/server/sandbox.ts`) seeds the `todo-api` project into a per-thread sandbox.

It only requires `ANTHROPIC_API_KEY` (read from the repo-root `.env`). The sandbox is a local filesystem backend (deepagents' `LocalShellBackend`) that maps `/app` to a per-thread directory under your OS temp dir — no LangSmith account or remote service required.

## Setup

This package loads the shared repo-root `.env` (via `langgraph.json`). From the repository root:

```bash
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
cd typescript && pnpm install
```

Frontend connection defaults can be overridden with a local `.env` in this folder, but are optional:

```bash
VITE_LANGGRAPH_API_URL=http://localhost:2024       # default proxies through Vite to the dev server
VITE_LANGGRAPH_ASSISTANT_ID=deep_agent_code_review # matches langgraph.json
```

## Run

From this folder, start the Vite client and the LangGraph dev server together:

```bash
pnpm dev
```

This runs `dev:client` (Vite on port `4900`) and `dev:server` (`langgraphjs dev` on port `2024`) in parallel; Vite proxies `/api/langgraph` to the dev server.

Open [http://localhost:4900](http://localhost:4900).

## shadcn chat components used

| Component                                                                                     | Source file                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `MessageScroller`, `MessageScrollerContent`, `MessageScrollerButton`                          | `src/components/ui/message-scroller.tsx`      |
| `Message`, `MessageAvatar`, `MessageBody`, `MessageHeader`, `MessageContent`, `MessageFooter` | `src/components/ui/message.tsx`               |
| `Bubble`, `BubbleFooter`                                                                      | `src/components/ui/bubble.tsx`                |
| `Marker`                                                                                      | `src/components/ui/marker.tsx`                |
| `PromptInput` (+ subcomponents)                                                               | `src/components/ai-elements/prompt-input.tsx` |
| `shimmer`, `scroll-fade` utilities                                                            | `src/globals.css`                             |

Components live in `src/components/` and are owned by this package (shadcn registry style — copy-paste, not a `node_modules` import).

## Vite path alias

Components use bare `src/` imports (e.g. `import { cn } from "src/lib/utils"`). `vite.config.ts` maps `src` → `./src` to resolve these in both dev and production builds.
