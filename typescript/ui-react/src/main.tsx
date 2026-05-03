import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

import "./styles.css";
import { ReconnectProvider } from "./reconnect.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReconnectProvider>
      <App />
    </ReconnectProvider>
  </StrictMode>
);
