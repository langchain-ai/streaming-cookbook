import { useEffect, useMemo, useState } from "react";

import {
  A2uiSurface,
  basicCatalog,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9";
import {
  MessageProcessor,
  type SurfaceModel,
} from "@a2ui/web_core/v0_9";
import { useExtension, useStream } from "@langchain/react";

import { processA2UIMessage } from "./utils";
import type { A2UIStreamEvent } from "./agent";

/**
 * Sample prompt for generating a team directory UI.
 * Demonstrates A2UI capabilities including lists, cards, images, and buttons.
 */
const SAMPLE_PROMPT =
  "Build a team directory like the A2UI samples (contact list + profile card): a bold page title, a row of three small stat cards, then a vertical List of teammate cards driven by a JSON array at e.g. /teammates (each object: name, title, imageUrl, email). In the list row template, bind Text and Image with RELATIVE paths only (name, title, imageUrl) — never /name at root. Each row: avatar Image (url bound to imageUrl), name/title Text, primary View button. Use plain text in headings (no # characters). Below, a featured profile Card with Divider, Icon rows, and Message + Schedule buttons; use variant primary on the main CTA so labels stay readable.";

/**
 * Main application component that renders a generative UI using A2UI and LangChain streaming.
 *
 * This component connects to a LangGraph agent via streaming, processes A2UI messages,
 * and renders the generated UI surfaces. It handles user input, streams responses from
 * the agent, and updates the UI in real-time as A2UI messages are received.
 *
 * @returns The rendered application with input composer and generated surface display.
 */
export function App() {
  /**
   * Current input content in the prompt textarea.
   * Initialized with SAMPLE_PROMPT for demonstration purposes.
   */
  const [content, setContent] = useState(SAMPLE_PROMPT);

  /**
   * Collection of all A2UI stream events received from the agent.
   * Used for debugging and tracking message count.
   */
  const [events, setEvents] = useState<A2UIStreamEvent[]>([]);

  /**
   * Array of rendered A2UI surfaces generated from stream events.
   * Updated automatically as the agent sends new UI messages.
   */
  const [surfaces, setSurfaces] = useState<
    SurfaceModel<ReactComponentImplementation>[]
  >([]);

  /**
   * Memoized MessageProcessor instance that handles A2UI message parsing.
   * Creates a single instance per component lifecycle to maintain state.
   *
   * The processor:
   * - Parses A2UI v0.9 messages from the stream
   * - Manages surface creation and updates
   * - Handles user actions (button clicks, form submissions)
   * - Updates the surfacesMap when actions are dispatched
   */
  const processor = useMemo(() => {
    let instance: MessageProcessor<ReactComponentImplementation>;
    instance = new MessageProcessor([basicCatalog], (action) => {
      for (const surfaceId of instance.model.surfacesMap.keys()) {
        instance.processMessages(processA2UIMessage(surfaceId, action));
      }
      setSurfaces(Array.from(instance.model.surfacesMap.values()));
    });
    return instance;
  }, []);

  /**
   * LangChain streaming connection to the local LangGraph agent.
   * Connects to http://localhost:2024 with assistant ID "agent".
   */
  const stream = useStream({
    assistantId: "agent",
    apiUrl: "http://localhost:2024",
  });

  /**
   * Extracts A2UI-specific events from the stream using the "a2ui" extension key.
   * This hook filters the stream for messages with custom channel name "a2ui".
   */
  const a2uiEvent = useExtension<A2UIStreamEvent>(stream, "a2ui");

  /**
   * Synchronizes React state with the processor's surfacesMap whenever
   * surfaces are created or deleted. Sets up subscriptions for surface lifecycle events.
   */
  useEffect(() => {
    const syncSurfaces = () => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()));
    };

    const createdSub = processor.onSurfaceCreated(syncSurfaces);
    const deletedSub = processor.onSurfaceDeleted(syncSurfaces);
    syncSurfaces();

    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  /**
   * Clears all surfaces and events when a new stream starts loading.
   * This ensures a fresh UI state for each new conversation turn.
   */
  useEffect(() => {
    if (!stream.isLoading) return;

    for (const surfaceId of processor.model.surfacesMap.keys()) {
      processor.model.deleteSurface(surfaceId);
    }
    setEvents([]);
    setSurfaces([]);
  }, [processor, stream.isLoading]);

  /**
   * Processes incoming A2UI messages from the stream extension.
   * Each message is fed into the MessageProcessor and appended to events history.
   */
  useEffect(() => {
    if (a2uiEvent == null) return;

    processor.processMessages([a2uiEvent.message]);
    setEvents((current) => [...current, a2uiEvent]);
  }, [a2uiEvent, processor]);

  /**
   * Submits the current prompt content to the LangGraph agent.
   * Clears the input field after submission if content is valid and not already loading.
   */
  function submitPrompt() {
    const nextContent = content.trim();
    if (nextContent.length === 0 || stream.isLoading) return;

    void stream.submit({
      messages: [{ content: nextContent, type: "human" }],
    });
    setContent("");
  }

  return (
    <main className="a2ui-shell">
      <section className="hero-card">
        <div className="eyebrow">LangChain streaming + A2UI</div>
        <h1>Generative UI Renderer</h1>
        <p>
          A ReAct Agent streams A2UI v0.9 messages through a LangGraph{" "}
          <code>custom:a2ui</code> channel. React consumes that extension with{" "}
          <code>useExtension</code>, feeds the messages into{" "}
          <code>MessageProcessor</code>, and renders the generated surface.
        </p>
      </section>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt();
        }}
      >
        <textarea
          aria-label="A2UI prompt"
          onChange={(event) => setContent(event.target.value)}
          placeholder="Ask the agent for a product dashboard, trip planner, checklist..."
          rows={6}
          value={content}
        />
        <div className="composer-row">
          <button disabled={content.trim() === "" || stream.isLoading} type="submit">
            {stream.isLoading ? "Generating UI..." : "Generate A2UI"}
          </button>
          <span>{events.length} A2UI messages processed</span>
        </div>
      </form>

      <section className="surface-card" aria-label="Generated A2UI surface">
        <div className="section-heading">
          <div>
            <span>Rendered Surface</span>
            <h2>{stream.isLoading ? "Streaming from agent" : "Generated UI"}</h2>
          </div>
          <code>custom:a2ui</code>
        </div>

        {surfaces.length === 0 ? (
          <div className={`empty-state${stream.isLoading ? " loading" : ""}`}>
            {stream.isLoading ? (
              <div className="loading-text">
                <div className="spinner" />
                <span>Generating UI...</span>
              </div>
            ) : (
              "Start a run to render a native React surface from A2UI JSON."
            )}
          </div>
        ) : null}

        <div className="surface-list">
          {surfaces.map((surface) => (
            <A2uiSurface key={surface.id} surface={surface} />
          ))}
        </div>
      </section>
    </main>
  );
}
