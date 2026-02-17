import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// v7 - Deferred analytics: gtag removed from <head>, loaded after mount

// === STEP 1: Install boot error handlers BEFORE anything else ===
import {
  initBootDiagnostics,
  installBootErrorHandlers,
  validateEnv,
  verifyBuildIntegrity,
  markMounted,
  logBootDebug,
} from "./lib/boot-diagnostics";

// Initialize diagnostics immediately
try {
  initBootDiagnostics();
  installBootErrorHandlers();
  logBootDebug();
} catch (e) {
  console.error('[BOOT_FAIL] Diagnostics init failed:', e);
}

// === STEP 2: Validate environment ===
try {
  const envOk = validateEnv();
  if (!envOk) {
    console.error('[BOOT_FAIL] Environment validation failed');
  }
} catch (e) {
  console.error('[BOOT_FAIL] Env validation threw:', e);
}

// === STEP 3: Web Vitals — deferred, non-blocking ===
import { initVitalsCollector } from "./lib/vitals-collector";
import { initLCPDebug } from "./lib/lcp-debug";
if (typeof window !== 'undefined') {
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

// === STEP 4: Mount React with error protection ===
try {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error('[BOOT_FAIL] #root element not found');
  }

  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </AppErrorBoundary>
    </React.StrictMode>
  );

  // Mark successful mount
  markMounted();

  // === STEP 5: Load deferred analytics AFTER mount ===
  // This was previously in index.html <head> and caused TDZ errors on iOS Safari
  import("./lib/deferred-analytics").then(m => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => m.initDeferredAnalytics());
    } else {
      setTimeout(() => m.initDeferredAnalytics(), 1500);
    }
  }).catch(e => {
    console.warn('[BOOT] Analytics load failed (non-fatal):', e);
  });

  // === STEP 6: Verify build integrity (async, non-blocking) ===
  verifyBuildIntegrity().catch(() => {});
} catch (e) {
  console.error('[BOOT_FAIL] React mount failed:', e);
  // Show recovery UI
  const recovery = document.getElementById('boot-recovery');
  if (recovery) {
    recovery.className = 'active';
    const errMsg = document.getElementById('boot-error-msg');
    if (errMsg) {
      errMsg.textContent = 'Mount error: ' + (e instanceof Error ? e.message : String(e));
    }
  }
}
