import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { queryClient } from "./lib/queryClient";
import { routes } from "./routes";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error('index.html is missing <div id="root">');

// The browser router follows the address bar; routes.tsx lists every page.
const router = createBrowserRouter(routes);

// StrictMode runs extra checks during development to catch common React mistakes.
// QueryClientProvider shares one cache of API data with every page.
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
