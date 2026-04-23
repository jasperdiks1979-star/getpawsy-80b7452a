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

async function reportRenderState(slug: string, state: RenderState, botType: string) {
  try {
    // Encode render state in the URL so it lands in `crawler_visits.page_url`
    // without requiring a schema change.
    const taggedUrl = `${window.location.origin}/product/${slug}?_render=${state}`;
    await supabase.functions.invoke('log-crawler-visit', {
      body: {
        pageUrl: taggedUrl,
        userAgent: `${navigator.userAgent} [pdp-render-trace:${state}]`,
        referrer: document.referrer,
      },
    });
    // Also surface in the browser console for live debugging.
    console.info(
      `%c[PDP-Bot-Render]%c ${botType} → ${state} for /product/${slug}`,
      'color: #f59e0b; font-weight: bold',
      'color: inherit',
    );
  } catch (err) {
    // Never break the page for a logging failure
    console.warn('[PDP-Bot-Render] log failed:', err);
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