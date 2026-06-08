import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:9123",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
