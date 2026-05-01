# Multimodal Storybook

React and Vite example that streams a tiny illustrated bedtime story. The app shows how a frontend can use the new streaming projections to render text, images, audio, and video as separate graph nodes produce them.

## What It Demonstrates

- `@langchain/react` `useStream` against a LangGraph dev server over SSE.
- `stream.subgraphsByNode` to find per-node graph work without parsing namespace strings manually.
- Scoped media hooks such as `useMessages`, `useImages`, `useAudio`, `useVideo`, `useMediaURL`, `useAudioPlayer`, and `useVideoPlayer`.
- A StateGraph that fans out after a storyteller node so visual and audio work can stream in parallel.
- A UI pattern where each page card subscribes only to the subgraphs that belong to that page.

## Prerequisites

Create the shared environment file from the repository root:

```bash
cp .env.example .env
```

Fill in the OpenAI provider key listed in `.env`. The LangGraph dev server loads the root file through `langgraph.json`.

Install from the TypeScript workspace root:

```bash
cd typescript
pnpm install
```

The visualizer uses OpenAI image generation, the narrator uses an audio-capable OpenAI model, and page 2 uses Sora video generation.

## Run

```bash
cd typescript/multimodal
pnpm dev
```

This starts both:

- `langgraphjs dev --no-browser --port 2024`
- `vite`

Other useful commands:

```bash
pnpm dev:agent
pnpm dev:web
pnpm build
pnpm lint
pnpm preview
```

The frontend reads `VITE_API_URL` when set, defaulting to `http://localhost:2024`.

## Graph Shape

`langgraph.json` registers the `bedtime-story` assistant from `src/agent.ts`.

The graph runs:

1. `storyteller`: writes exactly three short paragraphs.
2. `visualizer_0` and `visualizer_2`: generate image pages.
3. `videographer_1`: generates the middle page as a Sora video.
4. `narrator_0`, `narrator_1`, and `narrator_2`: generate audio narration for each page.

Because each node gets its own stream namespace, the UI can attach media hooks to a specific page instead of filtering every raw event globally.

## Important Files

- `src/agent.ts`: graph definition, model calls, image/audio/video node logic, and binary payload cleanup before state persistence.
- `src/App.tsx`: stream setup and page-level subgraph routing.
- `src/components/PageCard.tsx`: scoped image, video, and audio subscriptions for each story page.
- `src/components/PromptForm.tsx`: initial prompt form.
- `src/components/StorybookHeader.tsx`: streaming status and playback controls.
- `src/lib/paragraphs.ts`: derives the title and page text from streamed storyteller output.

## SDK Docs

- [React SDK docs](https://github.com/langchain-ai/langgraphjs/tree/cb/stream-improvements/libs/sdk-react/docs): `useStream`, subgraph state, media hooks, and React streaming UI patterns.
- [Client Streaming SDK docs](https://github.com/langchain-ai/langgraphjs/blob/5e2014ff1a85fc77416a90b5f22fec9e46336d09/libs/sdk/docs): remote stream subscriptions and protocol channels used underneath the React hooks.
