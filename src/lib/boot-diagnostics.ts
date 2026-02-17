/**
 * Boot Diagnostics System
 * Detects and reports production boot failures with actionable telemetry.
 */

// Build ID injected at build time by vite-plugin-build-id
export const BUILD_ID = '__BUILD_ID__';
export const BUILD_TS = '__BUILD_TS__';

interface BootDiagnostics {
  buildId: string;
  buildTs: string;
  mode: string;
  baseUrl: string;
  href: string;
  userAgent: string;
  timestamp: string;
  errors: string[];
  envKeys: string[];
  mountedAt?: number;
}

let diagnostics: BootDiagnostics | null = null;
let bootErrors: string[] = [];

/**
 * Initialize boot diagnostics — call BEFORE anything else in main.tsx
 */
export function initBootDiagnostics(): BootDiagnostics {
  diagnostics = {
    buildId: BUILD_ID,
    buildTs: BUILD_TS,
    mode: import.meta.env.MODE || 'unknown',
    baseUrl: import.meta.env.BASE_URL || '/',
    href: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString(),
    errors: [],
    envKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')),
  };

  // Log boot start
  console.log('[BOOT] GetPawsy boot started', {
    build: diagnostics.buildId,
    mode: diagnostics.mode,
    base: diagnostics.baseUrl,
  });

  return diagnostics;
}

/**
 * Install global error handlers that catch boot-time failures
 */
export function installBootErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const msg = `[BOOT_FAIL] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
    console.error(msg);
    bootErrors.push(msg);
    if (diagnostics) diagnostics.errors = bootErrors;

    // Check for chunk load failure
    if (
      event.message?.includes('Loading chunk') ||
      event.message?.includes('Failed to fetch dynamically imported module') ||
      event.message?.includes('error loading dynamically imported module')
    ) {
      handleChunkFailure(event.message);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    const msg = `[BOOT_FAIL] Unhandled rejection: ${reason}`;
    console.error(msg, event.reason);
    bootErrors.push(msg);
    if (diagnostics) diagnostics.errors = bootErrors;

    // Check for chunk load failure in promise rejections
    if (
      reason.includes('Loading chunk') ||
      reason.includes('Failed to fetch dynamically imported module') ||
      reason.includes('error loading dynamically imported module')
    ) {
      handleChunkFailure(reason);
    }
  });
}

/**
 * Handle chunk load failures — clear caches and reload once
 */
async function handleChunkFailure(errorMsg: string): Promise<void> {
  const reloadKey = 'boot-chunk-reload';
  if (sessionStorage.getItem(reloadKey)) {
    console.error('[BOOT_FAIL] Chunk reload already attempted, showing recovery UI');
    showRecoveryUI(errorMsg);
    return;
  }

  sessionStorage.setItem(reloadKey, '1');
  console.warn('[BOOT] Chunk failure detected, clearing caches and reloading...');

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {
    console.error('[BOOT] Cache cleanup failed:', e);
  }

  window.location.reload();
}

/**
 * Validate required environment variables
 */
export function validateEnv(): boolean {
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
  const missing = required.filter(key => !import.meta.env[key]);

  if (missing.length > 0) {
    const msg = `[BOOT_FAIL] Missing env vars: ${missing.join(', ')}`;
    console.error(msg);
    bootErrors.push(msg);
    return false;
  }

  // Sanity check: URL should not be localhost in production
  const supaUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (import.meta.env.MODE === 'production' && supaUrl.includes('localhost')) {
    const msg = '[BOOT_FAIL] Production env points to localhost!';
    console.error(msg);
    bootErrors.push(msg);
    return false;
  }

  return true;
}

/**
 * Verify build integrity by comparing JS BUILD_ID with /build.txt
 */
export async function verifyBuildIntegrity(): Promise<boolean> {
  // Skip in development
  if (import.meta.env.MODE !== 'production') return true;
  // Skip if BUILD_ID wasn't replaced at build time
  if (BUILD_ID === '__BUILD_ID__') return true;

  try {
    const res = await fetch('/build.txt', { cache: 'no-store' });
    if (!res.ok) return true; // File might not exist yet, don't block
    const serverBuildId = (await res.text()).trim();

    if (serverBuildId && serverBuildId !== BUILD_ID) {
      console.warn(`[BOOT] Build mismatch: JS=${BUILD_ID}, server=${serverBuildId}. New version available.`);
      // Only force reload if we haven't already
      const reloadKey = 'build-mismatch-reload';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return false;
      }
    }
  } catch {
    // Network error — don't block boot
  }

  return true;
}

/**
 * Mark that React has successfully mounted
 */
export function markMounted(): void {
  if (diagnostics) {
    diagnostics.mountedAt = Date.now();
  }
  // Clear chunk reload flag on successful mount
  try {
    sessionStorage.removeItem('boot-chunk-reload');
    sessionStorage.removeItem('build-mismatch-reload');
  } catch {}

  console.log('[BOOT] React mounted successfully');
}

/**
 * Get current diagnostics as JSON string (for copy-to-clipboard)
 */
export function getDiagnosticsJSON(): string {
  return JSON.stringify({
    ...diagnostics,
    errors: bootErrors,
    currentUrl: window.location.href,
    timestamp: new Date().toISOString(),
  }, null, 2);
}

/**
 * Show recovery UI when boot completely fails
 */
function showRecoveryUI(errorMsg: string): void {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa;padding:24px">
      <div style="text-align:center;max-width:440px">
        <div style="font-size:48px;margin-bottom:16px">🐾</div>
        <h1 style="font-size:22px;font-weight:600;margin-bottom:8px;color:#1a1a1a">GetPawsy needs a refresh</h1>
        <p style="font-size:14px;color:#666;margin-bottom:20px;line-height:1.5">
          A new version is available or a temporary issue occurred. Click below to fix it.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:20px">
          <button onclick="location.reload()" style="padding:10px 24px;border-radius:8px;border:none;background:#1a1a1a;color:#fff;font-size:14px;cursor:pointer;font-weight:500">
            Reload
          </button>
          <button id="hard-reload-btn" style="padding:10px 24px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#333;font-size:14px;cursor:pointer;font-weight:500">
            Hard Reload (clear cache)
          </button>
        </div>
        <button id="copy-diag-btn" style="padding:6px 16px;border-radius:6px;border:1px solid #eee;background:#f9f9f9;color:#888;font-size:12px;cursor:pointer">
          Copy diagnostics
        </button>
        <p style="font-size:11px;color:#bbb;margin-top:12px">${errorMsg.substring(0, 100)}</p>
      </div>
    </div>
  `;

  document.getElementById('hard-reload-btn')?.addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    sessionStorage.clear();
    window.location.href = window.location.pathname + '?cache_bust=' + Date.now();
  });

  document.getElementById('copy-diag-btn')?.addEventListener('click', () => {
    try {
      navigator.clipboard.writeText(getDiagnosticsJSON());
      const btn = document.getElementById('copy-diag-btn');
      if (btn) btn.textContent = 'Copied!';
    } catch {}
  });
}

/**
 * Boot debug mode — enabled via ?bootdebug=1
 */
export function isBootDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('bootdebug');
}

/**
 * Log detailed boot info when debug mode is active
 */
export function logBootDebug(): void {
  if (!isBootDebugMode()) return;
  console.group('[BOOT DEBUG]');
  console.log('Build ID:', BUILD_ID);
  console.log('Build TS:', BUILD_TS);
  console.log('Mode:', import.meta.env.MODE);
  console.log('Base URL:', import.meta.env.BASE_URL);
  console.log('Location:', window.location.href);
  console.log('User Agent:', navigator.userAgent);
  console.log('Env keys:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
  console.log('Diagnostics:', diagnostics);
  console.groupEnd();
}
