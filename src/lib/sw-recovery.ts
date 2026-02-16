/**
 * Service Worker Recovery Utility
 * 
 * Handles stale service worker caches that cause "Loading GetPawsy..." 
 * stuck screens after deployments. The SW caches old hashed JS chunks
 * which no longer exist, causing module import failures.
 */

/**
 * Force-update any waiting service worker and clear all caches.
 * Called during app initialization to prevent stale cache issues.
 */
export async function ensureFreshServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    // If there's a waiting worker, skip waiting immediately
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Listen for new service workers and activate them immediately
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    // Force check for updates
    registration.update().catch(() => {});
  } catch (err) {
    console.warn('[SW Recovery] Failed to check service worker:', err);
  }
}

/**
 * Nuclear option: unregister ALL service workers and clear ALL caches.
 * Used when chunk loading fails and the app can't recover normally.
 */
export async function nukeServiceWorkerCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  const tasks: Promise<unknown>[] = [];

  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .catch(() => {})
    );
  }

  if ('caches' in window) {
    tasks.push(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
}
