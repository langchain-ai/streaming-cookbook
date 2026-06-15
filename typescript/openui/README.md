# OpenUI Parallel Dashboard

React and Vite example that turns one dashboard brief into several
independently streaming [OpenUI](https://openui.com) panels. A Deep Agents
coordinator delegates the selected data domains in parallel, while the
frontend discovers each subagent from the standard LangGraph stream and
renders its OpenUI Lang output as soon as it arrives.

## What It Demonstrates

### Backend

- **Parallel Deep Agents delegation:** the coordinator emits every selected
  `task()` call in one model message so Stripe, PostHog, GitHub, and Calendar
  panel agents execute concurrently.
- **One shared OpenUI prompt:** `library.prompt()` runs once when the server
  module loads. Every panel receives the same OpenUI component vocabulary;
  the coordinator's task description supplies the panel-specific objective.
- **Stable data tools:** each panel has provider-specific LangChain tools
  whose JSON contracts remain the same in mock and live modes.
- **Explicit source behavior:** data tools return `_meta.source` as `mock`,
  `live`, or `unavailable`. Live failures only use mock data when
  `live-with-mock-fallback` is explicitly configured.

### Frontend

- **One streaming connection:** one `useStream` instance carries the
  coordinator and every delegated panel.
- **Dynamic panel discovery:** `stream.subagents` determines which panels
  exist; the React layout does not hardcode a fixed set of results.
- **Scoped selectors:** each panel subscribes only to
  `useMessages(stream, snapshot)` and `useToolCalls(stream, snapshot)` for
  its subagent namespace.
- **Independent OpenUI renderers:** every panel feeds its partial OpenUI Lang
  program into its own `<Renderer>`, parser, and store. Tokens from one panel
  do not re-render another panel.
- **Fresh dashboard runs:** every submitted brief creates a new thread and
  replaces the previous dashboard instead of appending unrelated panels.

## Architecture

```text
user brief
    |
    v
Deep Agents coordinator
    | one message with parallel task() calls
    +--------------+--------------+--------------+
    v              v              v              v
Stripe agent   PostHog agent  GitHub agent  Calendar agent
    |              |              |              |
    +--------------+--------------+--------------+
                   |
          one namespaced event stream
                   |
                   v
            stream.subagents
                   |
        useMessages(stream, snapshot)
                   |
                   v
          OpenUI <Renderer> per panel
```

This example intentionally uses the built-in subagent projections rather
than a custom `StreamChannel`. The data already exists as namespace-scoped
model messages, so an extra transformer would duplicate protocol work
without reducing latency.

## Run It

Create the shared environment file and install the TypeScript workspace:

```bash
# From the repository root
cp .env.example .env

cd typescript
pnpm install
pnpm dev:openui
```

Add `OPENAI_API_KEY` to the root `.env`. The command starts the LangGraph dev
server on `http://localhost:2024` and Vite on `http://localhost:5173` or the
next available port.

For non-default ports, set `VITE_LANGGRAPH_API_URL` for the frontend and
`LANGGRAPH_API_URL` for the smoke script.

Open the Vite URL and use **Full dashboard**, **Business only**, **My day**,
or write a custom dashboard brief.

## Data Sources

The default `DATA_MODE=mock` needs no provider credentials. The mock payloads
are deterministic and date-relative so the example is repeatable while still
exercising the full fetch-then-render flow.

Enable live providers independently in the root `.env`:

```bash
STRIPE_DATA_MODE=live
POSTHOG_DATA_MODE=live
GITHUB_DATA_MODE=live
GOOGLE_CALENDAR_DATA_MODE=live
```

Available modes are:

- `mock`: always use deterministic example data.
- `live`: use the provider and return an unavailable result on failure.
- `live-with-mock-fallback`: use mock data after a live failure and include
  the failure reason in `_meta`.

Provider behavior:

- **Stripe:** REST API through `STRIPE_SECRET_KEY`.
- **PostHog:** Query API through a personal key with Query Read access.
  Configure `POSTHOG_FUNNEL_EVENTS` for the events used by your project.
- **GitHub:** `GITHUB_TOKEN` or `GH_TOKEN` when present; otherwise
  `GITHUB_TRANSPORT=auto` uses an authenticated `gh` CLI.
- **Google Calendar:** direct OAuth REST credentials when present; otherwise
  auto mode tries an authenticated `gog` CLI. OAuth requires the
  `https://www.googleapis.com/auth/calendar.readonly` scope.

All credentials remain in the backend environment and must not use a
`VITE_` prefix.

## Important Files

| File | Purpose |
| --- | --- |
| `src/agent.ts` | Deep Agents coordinator, specialist definitions, and shared OpenUI panel prompt. |
| `src/tools.ts` | Stable tool schemas and deterministic mock payloads. |
| `src/data-sources/` | Live Stripe, PostHog, GitHub, and Google Calendar adapters. |
| `src/library.ts` | OpenUI component library used for both prompt generation and rendering. |
| `src/App.tsx` | Thread lifecycle, subagent discovery, scoped selectors, and per-panel renderers. |
| `src/styles.css` | Responsive dashboard shell and source-specific panel layout. |
| `langgraph.json` | Registers the dashboard graph and loads the repository root `.env`. |
| `scripts/smoke.mts` | Verifies concurrent subagent discovery and overlapping panel streams. |
| `scripts/check-app.mts` | Browser-level dashboard generation and rendering check. |

## Verify It

From the TypeScript workspace root:

```bash
pnpm --filter @examples/openui typecheck
pnpm --filter @examples/openui test:data-sources
pnpm --filter @examples/openui build:internal
```

With both development servers running:

```bash
pnpm --filter @examples/openui smoke
pnpm --filter @examples/openui exec tsx scripts/check-app.mts
```

The smoke test should discover the selected panel agents together and report
overlapping stream windows.

## Prompting Structure

The coordinator prompt is responsible only for selecting specialists and
writing distinct, self-contained task descriptions. It does not generate
OpenUI Lang.

Every specialist receives:

1. The same pre-generated OpenUI system prompt.
2. One panel-specific instruction from the coordinator.
3. Only the tools for its data domain.

The panel uses its tools first, then returns one complete OpenUI Lang program.
The program starts with `root`, allowing its renderer to paint before the
model has finished the remaining component and data statements.
