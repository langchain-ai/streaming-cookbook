import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const LANGGRAPH_UPSTREAM = process.env.LANGGRAPH_PROXY_TARGET ?? "http://127.0.0.1:2024";

// Sandbox create + npm install can exceed default proxy timeouts.
const UPSTREAM_PROXY: ProxyOptions = {
  target: LANGGRAPH_UPSTREAM,
  changeOrigin: true,
  timeout: 600_000,
  proxyTimeout: 600_000,
};

/**
 * The frontend talks to `origin + "/api/langgraph"`. The protocol v2 transport
 * (`@langchain/langgraph-sdk`) also issues some requests against the dev-server
 * root (e.g. `/threads`, `/runs`), so mirror those upstream too.
 */
function createLangGraphViteProxy(): Record<string, ProxyOptions> {
  return {
    "/api/langgraph": {
      ...UPSTREAM_PROXY,
      rewrite: (p) => p.replace(/^\/api\/langgraph/, ""),
    },
    "/threads": UPSTREAM_PROXY,
    "/runs": UPSTREAM_PROXY,
    "/assistants": UPSTREAM_PROXY,
    "/info": UPSTREAM_PROXY,
    "/ok": UPSTREAM_PROXY,
  };
}

export default defineConfig(() => {
  return {
    base: process.env.DEPLOY_BASE || "/",
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        src: path.resolve(import.meta.dirname, "./src"),
      },
    },
    clearScreen: false,
    server: {
      port: 4900,
      cors: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "connect-src 'self' ws: wss: http://127.0.0.1:*",
          "img-src 'self' data: blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "object-src 'none'",
          "base-uri 'self'",
        ].join("; "),
      },
      proxy: createLangGraphViteProxy(),
    },
  };
});
