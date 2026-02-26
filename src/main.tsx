console.log("BOOT START");
import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";
import App from "./App.tsx";
import "./index.css";
import { initTapDebug } from "./lib/tap-debug";

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

// === STEP 0b: Hostname guard — redirect non-canonical hosts to apex ===
// Handles: www.getpawsy.pet → apex, getpawsy.lovable.app → apex + noindex
// The hostname guard now includes full URL normalization (lowercase, trailing slash,
// param stripping) in a single hop, so url-normalizer only runs on canonical host.
import { enforceCanonicalHost, isCanonicalHost } from "./lib/hostname-guard";
if (typeof window !== 'undefined') {
  enforceCanonicalHost();
}

// === STEP 0c: URL normalizer — only on canonical host (hostname guard handles non-canonical) ===
import { normalizeUrl } from "./lib/url-normalizer";
if (typeof window !== 'undefined' && isCanonicalHost()) {
  normalizeUrl();
}

// === STEP 0d: CLS Guard — start monitor before React mount to catch all shifts ===
import { initCLSGuard, postMountCLSChecks } from "./lib/perf/cls-guard-init";
try { initCLSGuard(); } catch {}

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
  initTapDebug();
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

// === STEP 3: Web Vitals + Perf Logger — fully deferred, non-blocking ===
if (typeof window !== 'undefined') {
  // All monitoring deferred to after mount — none of this is needed for first paint
  const initMonitoring = () => {
    import("./lib/vitals-collector").then(m => m.initVitalsCollector()).catch(() => {});
    import("./lib/lcp-debug").then(m => m.initLCPDebug()).catch(() => {});
    import("./lib/perf-logger").then(m => m.initPerfLogger()).catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(initMonitoring, { timeout: 5000 });
  } else {
    setTimeout(initMonitoring, 2000);
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

  // LCP trace — fully deferred, only loads module when ?lcpTrace is present
  if (isTracing) {
    import('./lib/lcp-render-trace').then(({ traceReactMount, scheduleTraceSummary }) => {
      traceReactMount();
      scheduleTraceSummary();
    });
  }

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
  (window as any).__BOOT_OK__ = true;
  console.log("BOOT SUCCESS");

  // Post-mount CLS checks (geometry, preload, image policy) — dev/preview only
  try { postMountCLSChecks(); } catch (e) {
    console.warn('[CLS-GUARD] Post-mount check threw (dev only):', e);
  }

  // === STEP 5: Payload guard (dev/preview only) ===
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      import('./lib/image-optimizer').then(m => m.runPayloadGuard()).catch(() => {});
    }, { timeout: 8000 });
  }

  // === STEP 6: Load deferred analytics AFTER mount ===
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
