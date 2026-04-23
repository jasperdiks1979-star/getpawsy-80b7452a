import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { retryWithBackoff } from '@/hooks/useRetryWithBackoff';

/**
 * usePdpBotRenderTrace
 *
 * Detects Googlebot / Google rendering services (and other major crawlers)
 * fetching a Product Detail Page and records what they actually saw:
 *
 *  - "shell"     → Only the loading skeleton was rendered (data still pending)
 *  - "rendered"  → Real product data was painted to the DOM
 *  - "timeout"   → Page stayed on the shell for too long (>8s) — Googlebot
 *                  almost certainly indexed an empty PDP. This is the signal
 *                  we care about most for soft-404 / thin-content debugging.
 *
 * Implementation notes:
 *  - Zero impact for real users: short-circuits when UA isn't a known bot.
 *  - Re-uses the existing `log-crawler-visit` edge function. The render
 *    state is encoded as a `?_render=` query param on `pageUrl` so we don't
 *    need a schema migration; query the `crawler_visits` table and filter
 *    on `page_url ILIKE '%_render=shell%'` to find problem crawls.
 *  - Each (slug, state) pair fires at most once per page view.
 */

const BOT_PATTERNS: RegExp[] = [
  /Googlebot/i,
  /AdsBot-Google/i,
  /Mediapartners-Google/i,
  /Storebot-Google/i,
  /Google-InspectionTool/i,
  /GoogleOther/i,
  /Google-CloudVertexBot/i,
  /Google-Extended/i,
  /bingbot/i,
  /DuckDuckBot/i,
  /Slurp/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  // Headless renderers commonly used by Googlebot rendering service
  /HeadlessChrome/i,
];

function detectBot(userAgent: string): string | null {
  for (const pattern of BOT_PATTERNS) {
    const m = userAgent.match(pattern);
    if (m) return m[0];
  }
  // Allow forcing the trace via ?gp_botcheck=1 for manual QA
  if (typeof window !== 'undefined' && window.location.search.includes('gp_botcheck=1')) {
    return 'ManualBotCheck';
  }
  return null;
}

type RenderState = 'shell' | 'rendered' | 'timeout';

/**
 * Optional duration metrics captured by the hook.
 * - `tMountMs`        : ms since hook mount when the event fired
 * - `tSinceShellMs`   : for `rendered`/`timeout` only — ms since the shell was logged
 */
interface RenderDurations {
  tMountMs: number;
  tSinceShellMs?: number;
}

function nowMs(): number {
  // Prefer high-resolution monotonic clock; fall back to Date.now().
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

// In-flight + recent-success guard so we don't fire duplicate retries
// for the same (slug, state) pair across re-renders or rapid bot revisits.
const inflightReports = new Set<string>();
const recentReports = new Map<string, number>();
const RECENT_TTL_MS = 60_000; // suppress identical reports within 60s

async function reportRenderState(
  slug: string,
  state: RenderState,
  botType: string,
  durations: RenderDurations,
) {
  const key = `${slug}::${state}`;
  const now = Date.now();
  const lastSent = recentReports.get(key);
  if (lastSent && now - lastSent < RECENT_TTL_MS) {
    return; // already reported very recently — skip to avoid spam
  }
  if (inflightReports.has(key)) {
    return; // a retry chain is already running for this key
  }
  inflightReports.add(key);

  try {
    // Encode render state + durations in the URL so they land in
    // `crawler_visits.page_url` without requiring a schema change.
    // Format: ?_render=<state>&_t_mount=<ms>[&_t_shell=<ms>]
    const tMount = Math.max(0, Math.round(durations.tMountMs));
    const params = new URLSearchParams();
    params.set('_render', state);
    params.set('_t_mount', String(tMount));
    if (typeof durations.tSinceShellMs === 'number' && Number.isFinite(durations.tSinceShellMs)) {
      params.set('_t_shell', String(Math.max(0, Math.round(durations.tSinceShellMs))));
    }
    const taggedUrl = `${window.location.origin}/product/${slug}?${params.toString()}`;

    // Build a UA suffix that also encodes the durations, so log analysis tools
    // that group by user_agent see the same numbers as the URL.
    const uaSuffixParts = [`pdp-render-trace:${state}`, `t_mount=${tMount}ms`];
    if (params.has('_t_shell')) uaSuffixParts.push(`t_shell=${params.get('_t_shell')}ms`);
    const uaSuffix = `[${uaSuffixParts.join(' ')}]`;

    await retryWithBackoff(
      async () => {
        const { error } = await supabase.functions.invoke('log-crawler-visit', {
          body: {
            pageUrl: taggedUrl,
            userAgent: `${navigator.userAgent} ${uaSuffix}`,
            referrer: document.referrer,
          },
        });
        if (error) throw error;
      },
      {
        // Conservative: max 3 retries, 1s → 4s → 16s (capped at 20s) with jitter.
        // Total worst-case wait ≈ 21s spread across attempts → no spamming.
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 4,
        maxDelayMs: 20_000,
        // Only retry on transient/unavailable errors. Skip on 4xx (bad payload, auth, etc).
        shouldRetry: (err) => {
          const msg = (err?.message || '').toLowerCase();
          if (!msg) return true;
          if (
            msg.includes('401') ||
            msg.includes('403') ||
            msg.includes('400') ||
            msg.includes('404') ||
            msg.includes('422')
          ) {
            return false;
          }
          return true;
        },
        onRetry: (attempt, err, delayMs) => {
          console.info(
            `[PDP-Bot-Render] retrying log-crawler-visit (attempt ${attempt}, in ${Math.round(
              delayMs,
            )}ms): ${err.message}`,
          );
        },
      },
    );
    recentReports.set(key, Date.now());
    // Trim recentReports map opportunistically to keep it small.
    if (recentReports.size > 200) {
      const cutoff = Date.now() - RECENT_TTL_MS;
      for (const [k, t] of recentReports) {
        if (t < cutoff) recentReports.delete(k);
      }
    }
    // Also surface in the browser console for live debugging.
    const durationLabel =
      typeof durations.tSinceShellMs === 'number'
        ? `+${Math.round(durations.tSinceShellMs)}ms since shell (mount+${tMount}ms)`
        : `mount+${tMount}ms`;
    console.info(
      `%c[PDP-Bot-Render]%c ${botType} → ${state} for /product/${slug} (${durationLabel})`,
      'color: #f59e0b; font-weight: bold',
      'color: inherit',
    );
  } catch (err) {
    // Never break the page for a logging failure
    console.warn('[PDP-Bot-Render] log failed after retries:', err);
  } finally {
    inflightReports.delete(key);
  }
}

export function usePdpBotRenderTrace(params: {
  slug: string | undefined;
  isLoading: boolean;
  hasProduct: boolean;
}) {
  const { slug, isLoading, hasProduct } = params;
  const firedRef = useRef<{ shell: boolean; rendered: boolean; timeout: boolean }>({
    shell: false,
    rendered: false,
    timeout: false,
  });
  const botTypeRef = useRef<string | null>(null);
  const timeoutHandleRef = useRef<number | null>(null);

  // Detect bot once on mount
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    botTypeRef.current = detectBot(navigator.userAgent);
  }, []);

  // Fire "shell" event the moment the loading skeleton is visible to a bot
  useEffect(() => {
    if (!slug || !botTypeRef.current) return;
    if (!isLoading) return;
    if (firedRef.current.shell) return;
    firedRef.current.shell = true;
    reportRenderState(slug, 'shell', botTypeRef.current);

    // Start a soft-404 watchdog: if we're still on the shell after 8s,
    // log a "timeout" event so the admin can spot bot-side render failures.
    timeoutHandleRef.current = window.setTimeout(() => {
      if (firedRef.current.rendered || firedRef.current.timeout) return;
      firedRef.current.timeout = true;
      if (slug && botTypeRef.current) {
        reportRenderState(slug, 'timeout', botTypeRef.current);
      }
    }, 8000);

    return () => {
      if (timeoutHandleRef.current !== null) {
        clearTimeout(timeoutHandleRef.current);
        timeoutHandleRef.current = null;
      }
    };
  }, [slug, isLoading]);

  // Fire "rendered" event once real product data lands in the DOM
  useEffect(() => {
    if (!slug || !botTypeRef.current) return;
    if (isLoading || !hasProduct) return;
    if (firedRef.current.rendered) return;
    firedRef.current.rendered = true;
    if (timeoutHandleRef.current !== null) {
      clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
    reportRenderState(slug, 'rendered', botTypeRef.current);
  }, [slug, isLoading, hasProduct]);

  // Reset when slug changes (SPA navigation between PDPs)
  useEffect(() => {
    return () => {
      firedRef.current = { shell: false, rendered: false, timeout: false };
      if (timeoutHandleRef.current !== null) {
        clearTimeout(timeoutHandleRef.current);
        timeoutHandleRef.current = null;
      }
    };
  }, [slug]);
}