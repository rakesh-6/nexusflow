import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_URL = "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Forward API and real-time traffic to the Express server, so the browser
    // sees one address and the login cookie stays first-party (PRD §26.2).
    proxy: {
      "/api": API_URL,
      "/socket.io": { target: API_URL, ws: true },
    },
  },
});
