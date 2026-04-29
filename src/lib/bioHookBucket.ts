/**
 * bioHookBucket — deterministic hook1..hook5 assignment for organic
 * /go (TikTok bio-link) traffic.
 *
 * Why: when a visitor arrives on /go without an explicit utm_campaign
 * (i.e. the bio-link in the TikTok profile, which we tag as
 * `utm_campaign=tt_bio_link`), all of that traffic collapses into a
 * single "tt_bio_link" bucket on the TikTok Ads Performance dashboard.
 * That makes it impossible to A/B which hook copy actually converts the
 * organic profile audience.
 *
 * What this does: assigns each device a stable hook bucket (hook1..hook5)
 * persisted in localStorage, using a global rolling counter so the first
 * 5 unique devices get exactly hook1..hook5 in order, and subsequent
 * devices keep round-robining. Once assigned, a device sticks with the
 * same hook forever (so funnel attribution stays consistent across
 * sessions on the same browser).
 *
 * What this does NOT do: it does NOT override an explicit utm_campaign
 * coming from a paid ad URL (?utm_campaign=hook1..5). Paid ads always win.
 * It also does NOT touch any other utm_source — only TikTok bio traffic.
 */

const DEVICE_KEY = 'gp_bio_hook_assignment';
const COUNTER_KEY = 'gp_bio_hook_counter';
const HOOKS = ['hook1', 'hook2', 'hook3', 'hook4', 'hook5'] as const;

export type BioHook = (typeof HOOKS)[number];

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns the hook bucket for this device. If none is assigned yet,
 * picks the next slot via round-robin (1..5..1..5..) and persists it.
 * Falls back to a per-pageview hash if storage is unavailable so we still
 * spread traffic across all 5 hooks instead of dumping it all into hook1.
 */
export function assignBioHook(): BioHook {
  const storage = safeStorage();

  if (!storage) {
    // No storage (private mode, embedded webview without storage, etc.).
    // Use a time-based bucket so traffic still distributes; we lose
    // per-device stickiness, but the dashboard stays informative.
    const idx = Math.floor(Date.now() / 1000) % HOOKS.length;
    return HOOKS[idx];
  }

  const existing = storage.getItem(DEVICE_KEY);
  if (existing && (HOOKS as readonly string[]).includes(existing)) {
    return existing as BioHook;
  }

  // Round-robin counter: shared across all devices on this browser. Used
  // only the first time a device hits /go without an assignment, so the
  // 1st new device gets hook1, the 2nd hook2, ..., 6th hook1 again.
  const raw = storage.getItem(COUNTER_KEY);
  const next = (Number.isFinite(Number(raw)) ? Number(raw) : 0) % HOOKS.length;
  const hook = HOOKS[next];
  try {
    storage.setItem(DEVICE_KEY, hook);
    storage.setItem(COUNTER_KEY, String((next + 1) % HOOKS.length));
  } catch {
    /* storage quota or access denied — return the chosen hook anyway */
  }
  return hook;
}

/** Read-only accessor — never assigns. Useful for debug surfaces. */
export function peekBioHook(): BioHook | null {
  const storage = safeStorage();
  if (!storage) return null;
  const v = storage.getItem(DEVICE_KEY);
  return v && (HOOKS as readonly string[]).includes(v) ? (v as BioHook) : null;
}

/** Test-only helper: clear stored assignment so the next call re-buckets. */
export function resetBioHook(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(DEVICE_KEY);
    storage.removeItem(COUNTER_KEY);
  } catch {
    /* ignore */
  }
}

export const BIO_HOOKS = HOOKS;