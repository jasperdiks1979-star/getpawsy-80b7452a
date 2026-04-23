import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Mocks ---------------------------------------------------------------

const invokeMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

// Bypass the real exponential backoff so tests stay fast and deterministic.
// Tests can swap `retryImpl.current` to exercise real retry behavior.
const retryImpl: {
  current: (fn: () => Promise<unknown>, config?: unknown) => Promise<unknown>;
} = {
  current: async (fn) => fn(),
};
vi.mock('@/hooks/useRetryWithBackoff', () => ({
  retryWithBackoff: (fn: () => Promise<unknown>, config?: unknown) =>
    retryImpl.current(fn, config),
}));

import { usePdpBotRenderTrace } from './usePdpBotRenderTrace';

// --- Helpers -------------------------------------------------------------

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

function getReportedStates(): string[] {
  return invokeMock.mock.calls
    .filter(([fn]) => fn === 'log-crawler-visit')
    .map(([, opts]) => {
      const ua = (opts as { body: { userAgent: string } }).body.userAgent;
      const m = ua.match(/pdp-render-trace:(shell|rendered|timeout)/);
      return m ? m[1] : 'unknown';
    });
}

// --- Tests ---------------------------------------------------------------

describe('usePdpBotRenderTrace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockClear();
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    setUserAgent(GOOGLEBOT_UA);
    // Default: skip retries (fast path). Individual tests can override.
    retryImpl.current = async (fn) => fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing for non-bot user agents', async () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    );

    renderHook(() =>
      usePdpBotRenderTrace({ slug: 'cozy-bed', isLoading: true, hasProduct: false }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('logs "shell" when a bot lands while loading, then "rendered" once data arrives', async () => {
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug: 'cozy-bed', isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    // Allow the shell-effect's async invoke to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReportedStates()).toEqual(['shell']);

    // Product data arrives before the 8s timeout.
    rerender({ isLoading: false, hasProduct: true });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReportedStates()).toEqual(['shell', 'rendered']);

    // Even if we advance past the watchdog window, no "timeout" should fire
    // because "rendered" already cleared it.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(getReportedStates()).toEqual(['shell', 'rendered']);
  });

  it('logs "timeout" if the page is still on the loading shell after 8s', async () => {
    renderHook(() =>
      usePdpBotRenderTrace({ slug: 'stuck-bed', isLoading: true, hasProduct: false }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReportedStates()).toEqual(['shell']);

    // Fast-forward past the 8s watchdog.
    await act(async () => {
      vi.advanceTimersByTime(8_001);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReportedStates()).toEqual(['shell', 'timeout']);
  });

  it('does not fire duplicate "shell" reports across re-renders', async () => {
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug: 'dedupe-bed', isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Re-render multiple times while still loading.
    rerender({ isLoading: true, hasProduct: false });
    rerender({ isLoading: true, hasProduct: false });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getReportedStates().filter((s) => s === 'shell')).toHaveLength(1);
  });

  describe('user agent variants', () => {
    // Each entry uses a unique slug so the module-level dedupe map doesn't
    // suppress legitimate firings between cases.
    const variants: Array<{ label: string; ua: string; slug: string }> = [
      {
        label: 'lower-case "googlebot"',
        ua: 'mozilla/5.0 (compatible; googlebot/2.1; +http://www.google.com/bot.html)',
        slug: 'ua-lowercase',
      },
      {
        label: 'mixed-case "GoogleBot"',
        ua: 'Mozilla/5.0 (compatible; GoogleBot/2.1; +http://www.google.com/bot.html)',
        slug: 'ua-mixedcase',
      },
      {
        label: 'all-caps "GOOGLEBOT"',
        ua: 'Mozilla/5.0 (compatible; GOOGLEBOT/2.1; +http://www.google.com/bot.html)',
        slug: 'ua-uppercase',
      },
      {
        label: 'leading/trailing whitespace',
        ua: '   Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)   ',
        slug: 'ua-padding',
      },
      {
        label: 'extra inner whitespace',
        ua: 'Mozilla/5.0   (compatible;   Googlebot/2.1;   +http://www.google.com/bot.html)',
        slug: 'ua-extra-spaces',
      },
      {
        label: 'tab + newline whitespace',
        ua: 'Mozilla/5.0\t(compatible;\nGooglebot/2.1;\t+http://www.google.com/bot.html)',
        slug: 'ua-tabs-newlines',
      },
      {
        label: 'AdsBot-Google variant',
        ua: 'AdsBot-Google (+http://www.google.com/adsbot.html)',
        slug: 'ua-adsbot',
      },
      {
        label: 'bingbot lower-case',
        ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        slug: 'ua-bingbot',
      },
      {
        label: 'BINGBOT upper-case',
        ua: 'Mozilla/5.0 (compatible; BINGBOT/2.0; +http://www.bing.com/bingbot.htm)',
        slug: 'ua-bingbot-upper',
      },
      {
        label: 'HeadlessChrome (Google Web Rendering Service)',
        ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
        slug: 'ua-headless-chrome',
      },
    ];

    for (const { label, ua, slug } of variants) {
      it(`detects bot with ${label}`, async () => {
        setUserAgent(ua);

        renderHook(() =>
          usePdpBotRenderTrace({ slug, isLoading: true, hasProduct: false }),
        );

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        const calls = invokeMock.mock.calls.filter(
          ([fn, opts]) =>
            fn === 'log-crawler-visit' &&
            (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
        );

        expect(calls).toHaveLength(1);
        const sentUa = (calls[0][1] as { body: { userAgent: string } }).body.userAgent;
        expect(sentUa).toMatch(/pdp-render-trace:shell/);
      });
    }

    it('still ignores plainly non-bot UAs even with extra whitespace', async () => {
      setUserAgent(
        '  Mozilla/5.0   (Macintosh; Intel Mac OS X 10_15_7)\tAppleWebKit/605.1.15  Safari/605.1.15  ',
      );

      renderHook(() =>
        usePdpBotRenderTrace({
          slug: 'ua-human-spaces',
          isLoading: true,
          hasProduct: false,
        }),
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const calls = invokeMock.mock.calls.filter(
        ([fn, opts]) =>
          fn === 'log-crawler-visit' &&
          (opts as { body: { pageUrl: string } }).body.pageUrl.includes('/product/ua-human-spaces'),
      );
      expect(calls).toHaveLength(0);
    });
  });

  it('keeps dedupe state per-slug: two slugs each emit their own shell + rendered', async () => {
    // First PDP: cozy-bed-A
    const { rerender: rerenderA, unmount: unmountA } = renderHook(
      ({ slug, isLoading, hasProduct }: { slug: string; isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { slug: 'multi-slug-a', isLoading: true, hasProduct: false } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerenderA({ slug: 'multi-slug-a', isLoading: false, hasProduct: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    unmountA();

    // Second PDP: cozy-bed-B (simulates SPA navigation to a new product)
    const { rerender: rerenderB } = renderHook(
      ({ slug, isLoading, hasProduct }: { slug: string; isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { slug: 'multi-slug-b', isLoading: true, hasProduct: false } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerenderB({ slug: 'multi-slug-b', isLoading: false, hasProduct: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Pull every log call and group by slug.
    const callsBySlug = new Map<string, string[]>();
    for (const [fn, opts] of invokeMock.mock.calls) {
      if (fn !== 'log-crawler-visit') continue;
      const body = (opts as { body: { pageUrl: string; userAgent: string } }).body;
      const slugMatch = body.pageUrl.match(/\/product\/(multi-slug-[ab])/);
      if (!slugMatch) continue;
      const stateMatch = body.userAgent.match(/pdp-render-trace:(shell|rendered|timeout)/);
      if (!stateMatch) continue;
      const slug = slugMatch[1];
      const arr = callsBySlug.get(slug) ?? [];
      arr.push(stateMatch[1]);
      callsBySlug.set(slug, arr);
    }

    // Each slug must independently emit exactly one shell + one rendered.
    expect(callsBySlug.get('multi-slug-a')).toEqual(['shell', 'rendered']);
    expect(callsBySlug.get('multi-slug-b')).toEqual(['shell', 'rendered']);

    // Sanity: 4 events total, no cross-slug dedupe collision.
    const allRelevant = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        /\/product\/multi-slug-[ab]/.test(
          (opts as { body: { pageUrl: string } }).body.pageUrl,
        ),
    );
    expect(allRelevant).toHaveLength(4);
  });

  it('payload shape: shell, rendered, and timeout each include the correct slug and pdp-render-trace tag', async () => {
    const slug = 'payload-shape-bed';

    // --- Case 1: shell + rendered -----------------------------------------
    const { rerender, unmount } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender({ isLoading: false, hasProduct: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();

    // --- Case 2: timeout (separate slug to avoid the rendered short-circuit)
    const timeoutSlug = 'payload-shape-timeout';
    renderHook(() =>
      usePdpBotRenderTrace({ slug: timeoutSlug, isLoading: true, hasProduct: false }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(8_001);
      await Promise.resolve();
      await Promise.resolve();
    });

    // --- Helper to grab the single payload for (slug, state) --------------
    type LogCall = {
      pageUrl: string;
      userAgent: string;
      referrer: string;
    };

    function payloadFor(targetSlug: string, state: RenderState): LogCall {
      const matches = invokeMock.mock.calls
        .filter(([fn]) => fn === 'log-crawler-visit')
        .map(([, opts]) => (opts as { body: LogCall }).body)
        .filter(
          (body) =>
            body.pageUrl.includes(`/product/${targetSlug}`) &&
            body.userAgent.includes(`pdp-render-trace:${state}`),
        );
      expect(matches, `expected exactly 1 ${state} payload for ${targetSlug}`).toHaveLength(1);
      return matches[0];
    }

    type RenderState = 'shell' | 'rendered' | 'timeout';

    const shell = payloadFor(slug, 'shell');
    const rendered = payloadFor(slug, 'rendered');
    const timeout = payloadFor(timeoutSlug, 'timeout');

    // --- Slug assertions: present in URL path, not leaked into the wrong UA tag
    for (const [body, expectedSlug] of [
      [shell, slug],
      [rendered, slug],
      [timeout, timeoutSlug],
    ] as const) {
      expect(body.pageUrl).toMatch(new RegExp(`/product/${expectedSlug}(?:[/?#]|$)`));
    }

    // --- State tag assertions in the user agent suffix --------------------
    expect(shell.userAgent).toMatch(/\[pdp-render-trace:shell\b[^\]]*\]/);
    expect(rendered.userAgent).toMatch(/\[pdp-render-trace:rendered\b[^\]]*\]/);
    expect(timeout.userAgent).toMatch(/\[pdp-render-trace:timeout\b[^\]]*\]/);

    // Mirror in the URL query so log analysis on either field agrees.
    expect(new URL(shell.pageUrl).searchParams.get('_render')).toBe('shell');
    expect(new URL(rendered.pageUrl).searchParams.get('_render')).toBe('rendered');
    expect(new URL(timeout.pageUrl).searchParams.get('_render')).toBe('timeout');

    // --- No cross-contamination: shell payload must NOT carry rendered/timeout tags
    expect(shell.userAgent).not.toMatch(/pdp-render-trace:(rendered|timeout)/);
    expect(rendered.userAgent).not.toMatch(/pdp-render-trace:(shell|timeout)/);
    expect(timeout.userAgent).not.toMatch(/pdp-render-trace:(shell|rendered)/);

    // --- Wrong-slug payloads must not exist for either slug ---------------
    const wrongSlugShell = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: LogCall }).body.userAgent.includes('pdp-render-trace:shell') &&
        !(opts as { body: LogCall }).body.pageUrl.includes(`/product/${slug}`) &&
        !(opts as { body: LogCall }).body.pageUrl.includes(`/product/${timeoutSlug}`),
    );
    expect(wrongSlugShell).toHaveLength(0);
  });

  it('retries the edge function once on transient failure without firing duplicate state logs', async () => {
    // Use the REAL retryWithBackoff (with tiny delays) for this test only.
    const realModule = await vi.importActual<
      typeof import('@/hooks/useRetryWithBackoff')
    >('@/hooks/useRetryWithBackoff');
    retryImpl.current = (fn, config) =>
      realModule.retryWithBackoff(fn as () => Promise<unknown>, {
        ...(config as object),
        baseDelayMs: 1,
        maxDelayMs: 5,
      });

    // First call fails (transient 503), second call succeeds.
    invokeMock.mockReset();
    invokeMock
      .mockResolvedValueOnce({ data: null, error: new Error('503 Service Unavailable') })
      .mockResolvedValue({ data: { ok: true }, error: null });

    const slug = 'retry-once-bed';
    renderHook(() =>
      usePdpBotRenderTrace({ slug, isLoading: true, hasProduct: false }),
    );

    // Drain mount + first failed attempt + small backoff + second success.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
    });

    // --- Assert: invoke called exactly twice (1 fail + 1 retry success) ---
    const slugCalls = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
    );
    expect(slugCalls).toHaveLength(2);

    // Both attempts must carry the SAME shell tag — never escalate to rendered/timeout.
    for (const [, opts] of slugCalls) {
      const body = (opts as { body: { userAgent: string } }).body;
      expect(body.userAgent).toMatch(/pdp-render-trace:shell\b/);
      expect(body.userAgent).not.toMatch(/pdp-render-trace:(rendered|timeout)/);
    }

    // --- Assert: only ONE logical "shell" state was emitted ---------------
    // The hook's firedRef ensures the shell effect runs once; the two invoke
    // calls are the same logical state retrying, not two distinct state logs.
    const states = getReportedStates();
    expect(states).toEqual(['shell', 'shell']); // 2 transport attempts...
    expect(new Set(states)).toEqual(new Set(['shell'])); // ...of 1 distinct state
  });

  it('cancels the 8s watchdog when hasProduct flips true just before the boundary', async () => {
    const slug = 'watchdog-edge-bed';
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    // Drain the shell-effect's async invoke.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Sit on the loading shell for 7,999ms — one millisecond shy of the
    // watchdog firing. No timeout should have been logged yet.
    await act(async () => {
      vi.advanceTimersByTime(7_999);
      await Promise.resolve();
    });

    expect(getReportedStates()).toEqual(['shell']);

    // Product data lands at the very edge of the watchdog window.
    rerender({ isLoading: false, hasProduct: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReportedStates()).toEqual(['shell', 'rendered']);

    // Cross the original 8s boundary and well past it. If the watchdog were
    // still armed, it would now fire a "timeout" — it must not.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const states = getReportedStates();
    expect(states).toEqual(['shell', 'rendered']);
    expect(states).not.toContain('timeout');

    // And no log call for this slug should carry the timeout tag.
    const timeoutCallsForSlug = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { pageUrl: string; userAgent: string } }).body.pageUrl.includes(
          `/product/${slug}`,
        ) &&
        (opts as { body: { userAgent: string } }).body.userAgent.includes(
          'pdp-render-trace:timeout',
        ),
    );
    expect(timeoutCallsForSlug).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Transient-failure invariants
  // ---------------------------------------------------------------------------
  // Even when the edge call fails or times out on its first attempt(s), the
  // hook must still emit exactly one *logical* shell event and exactly one
  // *logical* terminal event (rendered or timeout) per page view. Retries are
  // a transport concern and should never duplicate state logs in the analytics
  // dashboard. These tests pin that invariant.

  it('logs exactly one shell + one rendered when the shell call fails once then recovers', async () => {
    // Use the REAL retryWithBackoff with tiny delays so we exercise the
    // backoff path without slowing the suite down.
    const realModule = await vi.importActual<
      typeof import('@/hooks/useRetryWithBackoff')
    >('@/hooks/useRetryWithBackoff');
    retryImpl.current = (fn, config) =>
      realModule.retryWithBackoff(fn as () => Promise<unknown>, {
        ...(config as object),
        baseDelayMs: 1,
        maxDelayMs: 5,
      });

    // Shell attempt #1 → transient 503. Everything after → success.
    invokeMock.mockReset();
    invokeMock
      .mockResolvedValueOnce({ data: null, error: new Error('503 Service Unavailable') })
      .mockResolvedValue({ data: { ok: true }, error: null });

    const slug = 'transient-shell-fail-bed';
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    // Drain mount + first failed attempt + small backoff + retry success.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Product data arrives well before the 8s watchdog.
    rerender({ isLoading: false, hasProduct: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Filter to calls for THIS slug to ignore noise from other tests / mounts.
    const slugCalls = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
    );

    // Distinct logical states reported = exactly one shell + one rendered.
    // (The shell may have 2 transport attempts due to the retry, but the
    // logical state count must stay at 1 per state.)
    const slugStates = slugCalls.map(([, opts]) => {
      const ua = (opts as { body: { userAgent: string } }).body.userAgent;
      return ua.match(/pdp-render-trace:(shell|rendered|timeout)/)?.[1] ?? 'unknown';
    });

    const shellAttempts = slugStates.filter((s) => s === 'shell').length;
    const renderedAttempts = slugStates.filter((s) => s === 'rendered').length;
    const timeoutAttempts = slugStates.filter((s) => s === 'timeout').length;

    // Transport-level: shell retried once → 2 attempts total. Rendered succeeded
    // first try → 1 attempt. Timeout never fired.
    expect(shellAttempts).toBe(2);
    expect(renderedAttempts).toBe(1);
    expect(timeoutAttempts).toBe(0);

    // Logical-level: exactly one *distinct* shell and one *distinct* rendered.
    expect(new Set(slugStates)).toEqual(new Set(['shell', 'rendered']));
  });

  it('logs exactly one shell + one timeout when the shell call fails once then recovers but data never arrives', async () => {
    const realModule = await vi.importActual<
      typeof import('@/hooks/useRetryWithBackoff')
    >('@/hooks/useRetryWithBackoff');
    retryImpl.current = (fn, config) =>
      realModule.retryWithBackoff(fn as () => Promise<unknown>, {
        ...(config as object),
        baseDelayMs: 1,
        maxDelayMs: 5,
      });

    // Shell attempt #1 → transient network blip. Everything after → success.
    invokeMock.mockReset();
    invokeMock
      .mockResolvedValueOnce({ data: null, error: new Error('network timeout') })
      .mockResolvedValue({ data: { ok: true }, error: null });

    const slug = 'transient-shell-then-timeout-bed';
    renderHook(() =>
      usePdpBotRenderTrace({ slug, isLoading: true, hasProduct: false }),
    );

    // Drain mount + failed shell + backoff + retried shell success.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Cross the 8s watchdog boundary while still on the shell.
    await act(async () => {
      vi.advanceTimersByTime(8_001);
      await Promise.resolve();
      await Promise.resolve();
    });

    const slugCalls = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
    );
    const slugStates = slugCalls.map(([, opts]) => {
      const ua = (opts as { body: { userAgent: string } }).body.userAgent;
      return ua.match(/pdp-render-trace:(shell|rendered|timeout)/)?.[1] ?? 'unknown';
    });

    const shellAttempts = slugStates.filter((s) => s === 'shell').length;
    const renderedAttempts = slugStates.filter((s) => s === 'rendered').length;
    const timeoutAttempts = slugStates.filter((s) => s === 'timeout').length;

    // Shell retried once → 2 attempts. Timeout fired once and succeeded → 1.
    // Rendered must NOT have been emitted because data never arrived.
    expect(shellAttempts).toBe(2);
    expect(timeoutAttempts).toBe(1);
    expect(renderedAttempts).toBe(0);

    // Logical-level: exactly one *distinct* shell and one *distinct* timeout.
    expect(new Set(slugStates)).toEqual(new Set(['shell', 'timeout']));
  });
});
