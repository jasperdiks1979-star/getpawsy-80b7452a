/**
 * Canonical fixtures for the `pdp-render-trace` user-agent tag and tagged
 * `pageUrl` shape produced by `usePdpBotRenderTrace`.
 *
 * Why this file exists
 * --------------------
 * Tests across the codebase used to hand-roll trace-tag strings (or worse,
 * regex-grep them out of recorded calls). Two problems with that:
 *
 *   1. **Brittle assertions** — every time the hook tweaked spacing,
 *      duration encoding, or order of fields, dozens of tests would break
 *      with no single place to update.
 *   2. **Drift between runtimes** — the Vitest hook tests and the Deno
 *      edge-function tests built slightly different fake tags (e.g. `+120ms`
 *      vs `t_mount=120ms`), masking real divergences.
 *
 * This module is the **single source of truth** for what a real ping looks
 * like on the wire. Both production code and tests should derive from these
 * helpers rather than re-encoding the format inline.
 *
 * The Deno edge tests can't import from `src/`, so an exact mirror lives at
 * `supabase/functions/log-crawler-visit/_fixtures/pdp_render_trace_tags.ts`.
 * Keep the two in sync — every change here MUST be ported there in the same
 * PR (a contract test in `pdpRenderTraceTags.test.ts` enforces parity by
 * re-deriving the canonical examples from both modules and comparing).
 */

export type PdpRenderState = 'shell' | 'rendered' | 'timeout';

export const PDP_RENDER_STATES: readonly PdpRenderState[] = [
  'shell',
  'rendered',
  'timeout',
] as const;

/** A representative real-world Googlebot user-agent prefix. */
export const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** Default page origin used when callers don't supply one. */
export const DEFAULT_PDP_ORIGIN = 'https://getpawsy.pet';

/**
 * Durations encoded in BOTH the UA suffix and the `?_render` URL params.
 * The hook clamps and rounds these to non-negative integers; we mirror that
 * here so the fixtures match byte-for-byte.
 */
export interface RenderDurationsFixture {
  /** Milliseconds since the hook mounted (always present). */
  tMountMs: number;
  /**
   * Milliseconds since the shell ping was sent.
   * Required for `rendered` / `timeout`, must be omitted for `shell`.
   */
  tSinceShellMs?: number;
}

const clampMs = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
};

/**
 * Build the bracketed UA suffix the hook appends to `navigator.userAgent`.
 *
 * Format (must stay in lock-step with `usePdpBotRenderTrace.ts`):
 *   `[pdp-render-trace:<state> t_mount=<ms>ms]`              (shell)
 *   `[pdp-render-trace:<state> t_mount=<ms>ms t_shell=<ms>ms]` (rendered/timeout)
 *
 * Order matters — log-analysis grep patterns rely on `pdp-render-trace:<state>`
 * being the first segment inside the brackets.
 */
export function buildPdpRenderTraceUaSuffix(
  state: PdpRenderState,
  durations: RenderDurationsFixture,
): string {
  const parts: string[] = [
    `pdp-render-trace:${state}`,
    `t_mount=${clampMs(durations.tMountMs)}ms`,
  ];

  if (state !== 'shell') {
    if (durations.tSinceShellMs === undefined) {
      throw new Error(
        `pdp-render-trace fixture: state="${state}" requires tSinceShellMs`,
      );
    }
    parts.push(`t_shell=${clampMs(durations.tSinceShellMs)}ms`);
  } else if (durations.tSinceShellMs !== undefined) {
    throw new Error(
      'pdp-render-trace fixture: state="shell" must NOT carry tSinceShellMs',
    );
  }

  return `[${parts.join(' ')}]`;
}

/**
 * Build the full `userAgent` string the hook sends — i.e. the navigator UA
 * plus the bracketed trace suffix, separated by a single space.
 *
 * Pass `baseUa = GOOGLEBOT_UA` (the default) to match the most common test
 * scenario. Override only when a test specifically needs a different UA.
 */
export function buildPdpRenderTraceUserAgent(
  state: PdpRenderState,
  durations: RenderDurationsFixture,
  baseUa: string = GOOGLEBOT_UA,
): string {
  return `${baseUa} ${buildPdpRenderTraceUaSuffix(state, durations)}`;
}

/**
 * Build the `pageUrl` value the hook sends. Mirrors the duration values
 * from the UA suffix into URL params so the two encodings always agree.
 *
 * Format:
 *   `<origin>/product/<slug>?_render=<state>&_t_mount=<ms>[&_t_shell=<ms>]`
 */
export function buildPdpRenderTracePageUrl(
  slug: string,
  state: PdpRenderState,
  durations: RenderDurationsFixture,
  origin: string = DEFAULT_PDP_ORIGIN,
): string {
  const params = new URLSearchParams();
  params.set('_render', state);
  params.set('_t_mount', String(clampMs(durations.tMountMs)));
  if (state !== 'shell') {
    if (durations.tSinceShellMs === undefined) {
      throw new Error(
        `pdp-render-trace fixture: state="${state}" requires tSinceShellMs`,
      );
    }
    params.set('_t_shell', String(clampMs(durations.tSinceShellMs)));
  }
  return `${origin}/product/${slug}?${params.toString()}`;
}

/**
 * Build the *full* payload posted to `log-crawler-visit` (minus the
 * idempotency key, which is environment-specific).
 *
 * Use this in tests that need to drive an end-to-end ping rather than
 * assemble the URL and UA piecemeal.
 */
export interface PdpRenderTracePayload {
  pageUrl: string;
  userAgent: string;
  referrer: string;
}

export function buildPdpRenderTracePayload(
  slug: string,
  state: PdpRenderState,
  durations: RenderDurationsFixture,
  opts: { origin?: string; baseUa?: string; referrer?: string } = {},
): PdpRenderTracePayload {
  const origin = opts.origin ?? DEFAULT_PDP_ORIGIN;
  return {
    pageUrl: buildPdpRenderTracePageUrl(slug, state, durations, origin),
    userAgent: buildPdpRenderTraceUserAgent(state, durations, opts.baseUa),
    referrer: opts.referrer ?? `${origin}/`,
  };
}

/**
 * Sensible per-state default durations for assertions that only care about
 * shape, not the specific numbers. These mirror the realistic values the
 * hook produces in production:
 *   - shell:    instant ping at mount  (≈ 0ms)
 *   - rendered: ~120ms after shell on a healthy PDP
 *   - timeout:  the 8000ms watchdog deadline
 */
export const DEFAULT_RENDER_DURATIONS: Record<PdpRenderState, RenderDurationsFixture> = {
  shell: { tMountMs: 0 },
  rendered: { tMountMs: 120, tSinceShellMs: 120 },
  timeout: { tMountMs: 8000, tSinceShellMs: 8000 },
};

/**
 * Regex helpers for assertions. These are derived from the SAME format
 * constants the builders use, so changing the canonical format only requires
 * updating the builder above.
 *
 * Use `pdpRenderTraceUaTagRegex(state)` for state-specific assertions; it
 * matches the bracketed suffix (`[pdp-render-trace:<state> ...]`) regardless
 * of which duration fields follow.
 */
export function pdpRenderTraceUaTagRegex(state: PdpRenderState): RegExp {
  return new RegExp(`\\[pdp-render-trace:${state}\\b[^\\]]*\\]`);
}

/** Matches *any* trace state — useful for "does this UA carry a trace tag at all?". */
export const PDP_RENDER_TRACE_ANY_STATE_REGEX =
  /\[pdp-render-trace:(shell|rendered|timeout)\b[^\]]*\]/;

/**
 * Extracts the state segment from a recorded UA, or `null` if no valid trace
 * tag is present. Mirrors the server-side extractor in `index.ts` so tests
 * and prod agree on what counts as a valid trace tag.
 */
export function extractPdpRenderTraceState(ua: string): PdpRenderState | null {
  const m = ua.match(/pdp-render-trace[/:](shell|rendered|timeout)\b/i);
  return m ? (m[1].toLowerCase() as PdpRenderState) : null;
}