/**
 * URL Normalizer — enforces clean canonical URLs at boot.
 *
 * Runs synchronously in main.tsx BEFORE React mounts.
 * Handles:
 *  1. Uppercase → lowercase path
 *  2. Double slashes → single slash
 *  3. Trailing slash → no trailing slash (except root)
 *  4. Strips tracking query params (utm_, gclid, fbclid, ref, session)
 *
 * Each normalization uses replaceState (not redirect) to avoid
 * redirect chains and preserve UX.
 */

const STRIP_PARAMS = new Set([
  // NOTE: gclid, fbclid, ttclid, click_id and utm_* are PRESERVED —
  // they are the attribution surface for paid ads (Google, Meta, TikTok)
  // and stripping them silently reroutes ad traffic into the
  // organic/fallback bucket. Only strip UI/session noise.
  'session', 'sort', 'filter', 'variant',
]);
const STRIP_PREFIXES: string[] = [];

function shouldStripParam(key: string): boolean {
  if (STRIP_PARAMS.has(key)) return true;
  return STRIP_PREFIXES.some(p => key.startsWith(p));
}

export function normalizeUrl(): void {
  if (typeof window === 'undefined') return;

  const { pathname, search, hash } = window.location;
  let normalized = pathname;
  let changed = false;

  // 1. Double slashes → single
  if (/\/{2,}/.test(normalized)) {
    normalized = normalized.replace(/\/{2,}/g, '/');
    changed = true;
  }

  // 2. Uppercase → lowercase
  if (normalized !== normalized.toLowerCase()) {
    normalized = normalized.toLowerCase();
    changed = true;
  }

  // 3. Trailing slash (except root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.replace(/\/+$/, '');
    changed = true;
  }

  // 4. Strip tracking params
  if (search) {
    const params = new URLSearchParams(search);
    const keysToDelete: string[] = [];
    params.forEach((_, key) => {
      if (shouldStripParam(key)) keysToDelete.push(key);
    });
    if (keysToDelete.length > 0) {
      keysToDelete.forEach(k => params.delete(k));
      changed = true;
    }
    const newSearch = params.toString();
    const finalUrl = `${normalized}${newSearch ? `?${newSearch}` : ''}${hash}`;
    if (changed) {
      window.history.replaceState(null, '', finalUrl);
    }
    return;
  }

  if (changed) {
    window.history.replaceState(null, '', `${normalized}${hash}`);
  }
}
