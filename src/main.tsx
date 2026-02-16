import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// Service worker cleanup is now handled in index.html (inline script)

// Initialize Web Vitals field-data collector (lightweight, non-blocking)
import { initVitalsCollector } from "./lib/vitals-collector";
import { initLCPDebug } from "./lib/lcp-debug";
if (typeof window !== 'undefined') {
  // Defer to avoid blocking initial render
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      initVitalsCollector();
      initLCPDebug();
    });
  } else {
    setTimeout(() => {
      initVitalsCollector();
      initLCPDebug();
    }, 0);
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
