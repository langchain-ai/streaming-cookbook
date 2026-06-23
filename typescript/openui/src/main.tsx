/**
 * Entry point: React root plus the OpenUI component kit styles (the kit
 * ships plain CSS imported through the bundler).
 *
 * @module main
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import "./styles.css";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
