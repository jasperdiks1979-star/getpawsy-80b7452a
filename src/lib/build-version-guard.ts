/**
 * Build Version Guard
 * 
 * Detects when the deployed build has changed (new deploy) and clears
 * stale caches to prevent "GetPawsy needs a refresh" overlays.
 * 
 * Strategy:
 * 1. BUILD_ID is set at build time via vite-plugin-build-id
 * 2. On boot, compare current BUILD_ID with localStorage's lastSeenBuildId
 * 3. If mismatch → clear stale caches, set flag, single hard reload
 * 4. sessionStorage guard prevents infinite reload loops
 */

import { BUILD_ID } from './boot-diagnostics';

const LS_KEY = 'gp_lastSeenBuildId';
const SS_RELOAD_GUARD = 'gp_build_reload_guard';
const STALE_LS_PREFIXES = [
  'gp_collection_',
  'gp_products_',
  'gp_route_',
  'seo_cache_',
  'collection_cache_',
];

export interface BuildGuardResult {
  action: 'none' | 'cache_cleared' | 'reloading' | 'skipped_guard';
  previousBuild: string | null;
  currentBuild: string;
  cacheKeysCleared: string[];
}

/**
 * Run the build version guard. Call early in main.tsx boot sequence.
 * Returns the action taken (or triggers reload and never returns).
 */
export function runBuildVersionGuard(): BuildGuardResult {
  const currentBuild = BUILD_ID;
  const result: BuildGuardResult = {
    action: 'none',
    previousBuild: null,
    currentBuild,
    cacheKeysCleared: [],
  };

  // Skip if BUILD_ID wasn't replaced at build time (dev mode)
  if (currentBuild === '__BUILD_ID__') {
    result.action = 'skipped_guard';
    console.log('[BUILD-GUARD] Dev mode — skipping version check');
    return result;
  }

  try {
    const lastSeen = localStorage.getItem(LS_KEY);
    result.previousBuild = lastSeen;

    if (!lastSeen) {
      // First visit — just store the build ID
      localStorage.setItem(LS_KEY, currentBuild);
      console.log('[BUILD-GUARD] First visit, stored buildId:', currentBuild);
      return result;
    }

    if (lastSeen === currentBuild) {
      // Same build — no action needed
      return result;
    }

    // Build mismatch detected
    console.warn(`[BUILD-GUARD] Build changed: ${lastSeen} → ${currentBuild}`);

    // Use UNIFIED reload guard — shared with index.html boot resilience
    const guardKey = (window as any).__RELOAD_GUARD_KEY__ || 'gp_reload_guard_v2';
    const reloadCount = parseInt(sessionStorage.getItem(guardKey) || '0', 10) || 0;
    if (reloadCount >= 1 || sessionStorage.getItem(SS_RELOAD_GUARD) === currentBuild) {
      console.warn('[BUILD-GUARD] Reload already attempted, skipping');
      localStorage.setItem(LS_KEY, currentBuild);
      result.action = 'skipped_guard';
      return result;
    }

    // Clear stale localStorage keys
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && STALE_LS_PREFIXES.some(prefix => key.startsWith(prefix))) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
    result.cacheKeysCleared = keysToDelete;

    // Clear service worker caches
    clearServiceWorkerCaches().catch(() => {});

    // Set BOTH guards BEFORE reloading (unified + legacy)
    const uniGuardKey = (window as any).__RELOAD_GUARD_KEY__ || 'gp_reload_guard_v2';
    sessionStorage.setItem(uniGuardKey, String(reloadCount + 1));
    sessionStorage.setItem(SS_RELOAD_GUARD, currentBuild);
    localStorage.setItem(LS_KEY, currentBuild);

    console.log('[BUILD-GUARD] Cleared', keysToDelete.length, 'stale keys, triggering reload');
    result.action = 'reloading';

    // Hard reload — location.reload(true) is deprecated but still works as fallback
    window.location.reload();
    // Execution stops here on reload
    return result;

  } catch (e) {
    console.error('[BUILD-GUARD] Error during version check:', e);
    result.action = 'skipped_guard';
    return result;
  }
}

/**
 * Clear all CacheStorage entries (used by service workers)
 */
async function clearServiceWorkerCaches(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    if (keys.length > 0) {
      console.log('[BUILD-GUARD] Cleared', keys.length, 'CacheStorage entries');
    }
  } catch {
    // Non-critical
  }
}

/**
 * Service Worker update flow:
 * Detects waiting SW, activates it via skipWaiting, then reloads.
 */
export function initServiceWorkerUpdateFlow(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;

    // If there's already a waiting worker, activate it
    if (reg.waiting) {
      promptSwUpdate(reg.waiting);
      return;
    }

    // Listen for new workers
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          promptSwUpdate(newWorker);
        }
      });
    });
  }).catch(() => {});

  // Reload when the new SW takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function promptSwUpdate(worker: ServiceWorker): void {
  console.log('[SW-UPDATE] New version available, activating...');
  worker.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Programmatic hard reload — clears everything and forces fresh load.
 * Wired to the "Hard Reload" button in recovery UI.
 */
export async function hardReload(): Promise<void> {
  try {
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    // Clear CacheStorage
    await clearServiceWorkerCaches();
    // Clear stale localStorage
    STALE_LS_PREFIXES.forEach(prefix => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
    });
  } catch {}

  sessionStorage.clear();
  window.location.href = window.location.pathname + '?cache_bust=' + Date.now();
}
