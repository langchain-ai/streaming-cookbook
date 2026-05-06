/**
 * Application entry point for the A2UI streaming demo.
 *
 * Bootstraps the React application with:
 * - StrictMode for development-time checks
 * - A2UI markdown rendering context for rich text components
 * - Injected A2UI base styles
 * - Custom application styles
 *
 * @module main
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MarkdownContext } from "@a2ui/react/v0_9";
import { injectStyles } from "@a2ui/react/styles";
import { renderMarkdown } from "@a2ui/markdown-it";

import { App } from "./App.js";

import "./styles.css";

/**
 * Injects base A2UI component styles into the document.
 * Must be called before rendering A2UI surfaces.
 */
injectStyles();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MarkdownContext.Provider value={renderMarkdown}>
      <App />
    </MarkdownContext.Provider>
  </StrictMode>
);
