import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import {
  DemoSelectionProvider,
} from "./shared/index.js";

import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoSelectionProvider>
      <App />
    </DemoSelectionProvider>
  </StrictMode>
);
