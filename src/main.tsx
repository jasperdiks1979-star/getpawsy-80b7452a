import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// Initialize Web Vitals field-data collector (lightweight, non-blocking)
import { initVitalsCollector } from "./lib/vitals-collector";
if (typeof window !== 'undefined') {
  // Defer to avoid blocking initial render
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => initVitalsCollector());
  } else {
    setTimeout(() => initVitalsCollector(), 0);
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
