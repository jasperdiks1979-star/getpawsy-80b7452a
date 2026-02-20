import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// v9 - Fix: removed charts manualChunks entirely (d3 TDZ crash on iOS Safari 18)
// BUILD_MARKER: 2026-02-19T-v9-no-charts-chunk

// === STEP 0: Build marker + BUNDLE EXECUTION START timestamp ===
if (typeof window !== 'undefined') {
  (window as any).__BUILD_ID__ = 'v9-no-charts-chunk-' + Date.now().toString(36);
  console.log('[BUILD] v9-no-charts-chunk deployed');

  // ── LCP Trace: JS bundle execution timestamp ─────────────────────────────
  // This is the FIRST LINE of the main bundle that runs — marks when V8 has
  // finished parsing + compiling this chunk and begun executing it.
  if (new URLSearchParams(window.location.search).has('lcpTrace')) {
    const bundleStartTs = performance.now();
    const lcpWindow = bundleStartTs <= 2000;
    const tag = lcpWindow ? '🔴 [LCP-WINDOW]' : '🟢 [POST-LCP]';
    console.log(`${tag} BUNDLE_EXEC | T+${Math.round(bundleStartTs)}ms | main.tsx first line executing (JS parse+compile complete)`);
    (window as any).__lcpTrace = (window as any).__lcpTrace || {};
    (window as any).__lcpTrace.bundleExecAt = bundleStartTs;
  }
}

// === STEP 0b: www → apex redirect (app-level fallback for platform 302) ===
if (typeof window !== 'undefined' && window.location.hostname.startsWith('www.')) {
  window.location.replace('https://getpawsy.pet' + window.location.pathname + window.location.search + window.location.hash);
}

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

  // ── LCP Trace: createRoot called timestamp ────────────────────────────────
  const isTracing = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('lcpTrace');
  if (isTracing) {
    const ts = performance.now();
    const lcpWindow = ts <= 2000;
    const tag = lcpWindow ? '🔴 [LCP-WINDOW]' : '🟢 [POST-LCP]';
    console.log(`${tag} CREATE_ROOT | T+${Math.round(ts)}ms | ReactDOM.createRoot() called`);
    (window as any).__lcpTrace = (window as any).__lcpTrace || {};
    (window as any).__lcpTrace.createRootAt = ts;
  }

  import('./lib/lcp-render-trace').then(({ traceReactMount, scheduleTraceSummary }) => {
    traceReactMount();
    scheduleTraceSummary();
  });

  const root = createRoot(rootEl);

  // ── LCP Trace: root.render() called ─────────────────────────────────────
  if (isTracing) {
    const ts = performance.now();
    const tag = ts <= 2000 ? '🔴 [LCP-WINDOW]' : '🟢 [POST-LCP]';
    console.log(`${tag} RENDER_CALL | T+${Math.round(ts)}ms | root.render() invoked (React tree evaluation begins)`);
    (window as any).__lcpTrace.renderCallAt = ts;
  }

  root.render(
    // ⚠️  React.StrictMode is ACTIVE.
    // In development, React intentionally double-invokes render functions,
    // state initialisers, and effects to detect side-effects.
    // Any component showing MOUNT twice within ~50ms is StrictMode — NOT a real
    // extra render in production. To verify: build with `bun run build` and
    // open the production preview — double mounts disappear.
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
