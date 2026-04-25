/**
 * Consent + TikTok event log
 * --------------------------
 * Lightweight client-side ring buffer that records:
 *   • Every consent state change (auto-grant, banner-accept, banner-reject,
 *     dev-toggle, revoke) with the source that triggered it
 *   • Every TikTok pixel event we attempt to fire, tagged with the
 *     consent state at the moment of firing
 *
 * Stored in localStorage under `gp_consent_log`, capped at 200 entries.
 * Inspect from the console:   window.__consentLog()
 * Clear from the console:     window.__consentLogClear()
 *
 * This is purely diagnostic — no network calls, no PII, no third-party
 * sharing. Used to verify that pixel events actually fire in the right
 * consent context.
 */

const STORAGE_KEY = 'gp_consent_log';
const MAX_ENTRIES = 200;

export type ConsentSource =
  | 'auto-grant-geo'   // non-EU visitor, granted on pixel init
  | 'banner-accept'    // EU visitor clicked "Accept all"
  | 'banner-reject'    // EU visitor clicked "Necessary only"
  | 'dev-toggle'       // dev panel forced a state
  | 'revoke'           // explicit revoke (settings, etc.)
  | 'unknown';

export type ConsentLogEntry =
  | {
      kind: 'consent';
      ts: number;
      source: ConsentSource;
      value: 'all' | 'necessary';
      isGdprRegion: boolean;
    }
  | {
      kind: 'tiktok-event';
      ts: number;
      event: string;            // 'page' | 'ViewContent' | 'AddToCart' | ...
      consentState: 'granted' | 'held' | 'revoked' | 'unknown';
      source: ConsentSource;    // last known consent source
      fired: boolean;           // was the SDK actually present?
      meta?: Record<string, unknown>;
    };

function safeRead(): ConsentLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(entries: ConsentLogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode → ignore */
  }
}

function append(entry: ConsentLogEntry): void {
  const all = safeRead();
  all.push(entry);
  safeWrite(all);
}

/** Last consent source — kept on window so cross-module access stays simple. */
export function getLastConsentSource(): ConsentSource {
  if (typeof window === 'undefined') return 'unknown';
  return ((window as any).__consentSource as ConsentSource) || 'unknown';
}

function setLastConsentSource(source: ConsentSource): void {
  if (typeof window === 'undefined') return;
  (window as any).__consentSource = source;
}

/** Record a consent state change. */
export function logConsentChange(
  source: ConsentSource,
  value: 'all' | 'necessary',
  isGdprRegion: boolean,
): void {
  setLastConsentSource(source);
  append({ kind: 'consent', ts: Date.now(), source, value, isGdprRegion });
  // Console breadcrumb so it's visible without opening the buffer
  // (kept short to avoid console noise on production)
  // eslint-disable-next-line no-console
  console.log(`[Consent] ${source} → ${value} (gdpr=${isGdprRegion})`);
}

/** Record a TikTok event firing attempt. */
export function logTikTokEvent(
  event: string,
  meta?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  const consentState =
    (w.__ttqConsent as 'granted' | 'held' | 'revoked' | undefined) || 'unknown';
  const fired = !!(w.ttq && typeof w.ttq.track === 'function');
  append({
    kind: 'tiktok-event',
    ts: Date.now(),
    event,
    consentState,
    source: getLastConsentSource(),
    fired,
    meta,
  });
}

/** Read the full log (for the dev panel / console inspection). */
export function getConsentLog(): ConsentLogEntry[] {
  return safeRead();
}

/** Wipe the log. */
export function clearConsentLog(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Compact summary — useful for the dev panel. */
export function summarizeConsentLog() {
  const log = safeRead();
  const consentChanges = log.filter((e) => e.kind === 'consent').length;
  const tikTokEvents = log.filter((e) => e.kind === 'tiktok-event') as Array<
    Extract<ConsentLogEntry, { kind: 'tiktok-event' }>
  >;
  const byEvent: Record<string, number> = {};
  let firedWhileGranted = 0;
  let firedWhileHeld = 0;
  for (const e of tikTokEvents) {
    byEvent[e.event] = (byEvent[e.event] || 0) + 1;
    if (e.consentState === 'granted') firedWhileGranted++;
    else if (e.consentState === 'held' || e.consentState === 'revoked')
      firedWhileHeld++;
  }
  return {
    total: log.length,
    consentChanges,
    tikTokEvents: tikTokEvents.length,
    byEvent,
    firedWhileGranted,
    firedWhileHeld,
    last: log[log.length - 1] || null,
  };
}

if (typeof window !== 'undefined') {
  (window as any).__consentLog = getConsentLog;
  (window as any).__consentLogSummary = summarizeConsentLog;
  (window as any).__consentLogClear = clearConsentLog;
}