import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_URL = "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Prepare every library at start-up. Otherwise Vite discovers some only when
  // a page that uses them first opens, rebuilds its cache mid-session, and the
  // browser can end up with two copies of React ("reading 'useRef' of null").
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router",
      "@tanstack/react-query",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "radix-ui",
      "lucide-react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@tanstack/react-table",
      "@tanstack/react-virtual",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extensions",
      "socket.io-client",
      "zod",
    ],
  },
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
