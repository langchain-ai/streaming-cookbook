# A2UI Generative UI Streaming

React and Vite example that renders A2UI v0.9 declarative UI surfaces from a ReAct Agent streamed through the standard LangGraph dev server. This demo shows how generative UI bridges natural language prompts to structured, interactive React components without writing component code manually.

## What It Demonstrates

### Backend (LangGraph Agent)

- **ReAct Agent with A2UI output**: A ReAct agent configured to generate A2UI v0.9 messages as line-delimited JSON prefixed with `A2UI:`.
- **StreamTransformer projection**: A custom transformer that parses A2UI messages from the LLM output and projects them into a typed `StreamChannel<A2UIStreamEvent>` named `"a2ui"`.
- **Inline system prompt**: A comprehensive prompt that teaches the LLM the A2UI component structure rules, data binding patterns, and streaming best practices.
- **MemorySaver checkpointer**: Maintains conversation state so the agent can refine the UI across multiple user turns.

### Frontend (React + A2UI SDK)

- **`useStream` connection**: Connects to the LangGraph dev server at `http://localhost:2024` with assistant ID `"agent"`.
- **`useExtension` hook**: Subscribes specifically to the `"a2ui"` custom channel to receive only the A2UI projection events.
- **MessageProcessor**: Processes raw A2UI messages into managed surface models with the built-in basic catalog (Card, Button, Text, Image, List, Row, Column, etc.).
- **Action handling**: Captures user interactions (button clicks, form submissions) and injects them back into the surface's data model at `/__host/latestAction`.
- **Real-time rendering**: Surfaces update immediately as new A2UI messages arrive from the stream.

### Key Interactions

1. User types a prompt (e.g., "Build a team directory with contact cards")
2. Agent streams A2UI messages: `createSurface`, `updateComponents`, `updateDataModel`
3. React receives events through `useExtension(stream, "a2ui")`
4. MessageProcessor builds the component tree and data bindings
5. A2uiSurface renders the live React UI
6. User interactions are captured and logged (extensible to actual handlers)

## Architecture Overview

```txt
┌─────────────────┐     streamEvents      ┌──────────────────┐
│  User Prompt    │ ────────────────────> │   ReAct Agent    │
│  (React App)    │                       │  (LangGraph)     │
└─────────────────┘                       │                  │
       ^                                  │  ┌────────────┐  │
       │                                  │  │   GPT-5.5  │  │
       │                                  │  │  generates │  │
       │                                  │  │  A2UI JSON │  │
       │                                  │  └────────────┘  │
       │                                  │                  │
       │         A2UI StreamChannel       │  ┌────────────┐  │
       │         (custom:a2ui)            │  │ createA2UI │  │
       │ <────────────────────────────────│  │Transformer │  │
       │                                  │  └────────────┘  │
       │                                  └──────────────────┘
       │
┌──────┴──────────┐
│   useExtension  │
│     ("a2ui")    │
└────────┬────────┘
         │
┌────────▼─────────┐
│ MessageProcessor │
│ (basicCatalog)   │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  A2uiSurface     │
│  (React Render)  │
└──────────────────┘
```

## Run It

From the TypeScript workspace root:

```bash
pnpm --filter @examples/ui-a2ui dev
```

Or use the workspace convenience script:

```bash
pnpm dev:a2ui
```

The Vite dev server starts on `http://localhost:5173` (or next available port).

### Environment Setup

Ensure your root `.env` file has an OpenAI provider key:

```bash
# From repository root
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-...
```

The LangGraph dev server reads this file via `langgraph.json` configuration.

## Using the Demo

1. **Open the app** in your browser at the Vite URL.
2. **Review the sample prompt** pre-filled in the text area, or clear it and write your own.
3. **Click "Generate A2UI"** to start the stream.
4. **Watch the UI build in real-time** as A2UI messages arrive (the message counter increments with each event).
5. **Interact with the generated surface** - buttons are clickable and actions are logged to the console.
6. **Try different prompts**:
   - "Create a project dashboard with status cards"
   - "Build a todo checklist with strikethrough completed items"
   - "Design a user profile page with avatar and stats"

## Important Files

| File             | Purpose                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `src/agent.mts`  | ReAct Agent definition with A2UI system prompt and `createA2UITransformer` stream transformer    |
| `src/App.tsx`    | Main React component with `useStream`, `useExtension`, `MessageProcessor`, and surface rendering |
| `src/utils.ts`   | Utility for formatting action messages for display                                               |
| `src/main.tsx`   | Vite/React entry point with A2UI style injection                                                 |
| `src/styles.css` | Application shell styling and A2UI surface CSS variables                                         |
| `langgraph.json` | Assistant configuration and environment for the LangGraph dev server                             |

## A2UI System Prompt Highlights

The agent uses an inline system prompt (`INLINE_SYSTEM_PROMPT`) that instructs the LLM on:

- **Message format**: Each line prefixed with `A2UI:`, valid JSON, no Markdown fences
- **Component structure rules**:
  - `Card` uses `"child"` (string), not `"children"` (array)
  - `Button` uses `"child"` pointing to a `Text` component
  - `Row`, `Column`, `List` use `"children"` arrays
  - `List` templates use relative paths (no leading `/`)
  - `Image` uses `"url": {"path": "..."}`
  - Form components use `"value": {"path": "/dataPath"}` for two-way binding
- **Streaming pattern**: Small, valid JSON updates rather than large batches
- **Catalog ID**: References the official basic catalog URL for `createSurface`

## Customization Ideas

- **Add more catalogs**: Import additional A2UI catalogs beyond `basicCatalog` for richer components
- **Implement action handlers**: Replace the console log with actual function calls that respond to button clicks
- **Surface persistence**: Save `surfaces` state to localStorage for page refresh recovery
- **Multi-surface layout**: Render multiple surfaces side-by-side for comparison
- **Custom themes**: Override CSS variables in `.surface-list` for different visual styles
- **Streaming visualization**: Show a timeline of A2UI messages with diff highlighting

## Dependencies

Key packages that make this work:

- `@langchain/react`: React hooks for LangGraph streaming (`useStream`, `useExtension`)
- `@a2ui/react/v0_9`: React components for rendering A2UI surfaces (`A2uiSurface`, `MarkdownContext`)
- `@a2ui/web_core/v0_9`: Core A2UI processing (`MessageProcessor`, `A2uiClientAction`)
- `@a2ui/react/styles`: Base A2UI component styles (`injectStyles`)
- `@a2ui/markdown-it`: Markdown rendering for rich text components
- `langchain`: `createAgent` for building the ReAct Agent
- `@langchain/langgraph`: `StreamChannel`, `StreamTransformer`, `MemorySaver`

## Troubleshooting

| Issue                        | Solution                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| "No A2UI messages processed" | Check that the dev server is running and `langgraph.json` points to the correct agent file |
| Surfaces not rendering       | Verify `@a2ui/react/styles` `injectStyles()` is called in `main.tsx`                       |
| Actions not showing          | Check browser console for "A2UI action dispatched:" logs                                   |
| Invalid JSON errors          | The transformer handles partial lines gracefully; complete JSON should still parse         |
| Styles look wrong            | Ensure CSS variables in `.surface-list` are properly set for your theme                    |

## Learn More

- [A2UI Specification](https://a2ui.org/specification/v0_9) - Full A2UI v0.9 specification
- [LangGraph Streaming Docs](https://langchain-5e9cc07a-preview-cbnews-1777613032-0dd3692.mintlify.app/oss/python/langgraph/streaming/overview) - Protocol, channels, and transformers
- [React SDK Docs](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-react/docs) - `useStream`, `useExtension`, and streaming patterns
