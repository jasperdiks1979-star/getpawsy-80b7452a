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

// --- Timer / act drain helpers ------------------------------------------
//
// The hook fires effects that schedule async edge-function calls AND a
// `setTimeout(..., 8000)` watchdog. Mixing fake timers with promise
// microtasks is fragile: a stray missed flush leaves the hook in a half-
// resolved state and produces order-dependent flakes (e.g. a "rendered"
// payload measured before its `tSinceShellMs` is set).
//
// These helpers centralize the drain pattern so every watchdog test
// follows the same recipe. Rules:
//   * `flushMicrotasks` only resolves pending promises; it never advances
//     fake timers, so it is safe at any point.
//   * `advanceAndFlush` advances fake timers by `ms` THEN flushes
//     microtasks, which is the only correct order when a setTimeout
//     callback itself enqueues a Promise (our watchdog → reportRenderState).
//   * `drainRetryBackoff` is the long form used after triggering a real
//     `retryWithBackoff` chain (50ms covers 1ms+5ms tiny-delay configs
//     plus jitter). Always call it inside `act()`.
//
// All helpers are async + idempotent: extra calls are harmless.

/** Flush queued microtasks twice — covers `await invoke()` then `setState`. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Drain pending promises inside an `act()` boundary. */
async function actFlush(): Promise<void> {
  await act(async () => {
    await flushMicrotasks();
  });
}

/** Advance fake timers by `ms`, then flush microtasks, all inside `act()`. */
async function advanceAndFlush(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await flushMicrotasks();
  });
}

/**
 * Drain a real `retryWithBackoff` chain configured with tiny delays
 * (baseDelayMs: 1, maxDelayMs: 5). 50ms is generous enough to cover the
 * full retry sequence including jitter without slowing the suite.
 */
async function drainRetryBackoff(): Promise<void> {
  await act(async () => {
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
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

    await actFlush();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('logs "shell" when a bot lands while loading, then "rendered" once data arrives', async () => {
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug: 'cozy-bed', isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    // Allow the shell-effect's async invoke to settle.
    await actFlush();

    expect(getReportedStates()).toEqual(['shell']);

    // Product data arrives before the 8s timeout.
    rerender({ isLoading: false, hasProduct: true });

    await actFlush();

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

    await actFlush();

    expect(getReportedStates()).toEqual(['shell']);

    // Fast-forward past the 8s watchdog.
    await advanceAndFlush(8_001);

    expect(getReportedStates()).toEqual(['shell', 'timeout']);
  });

  it('does not fire duplicate "shell" reports across re-renders', async () => {
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug: 'dedupe-bed', isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    await actFlush();

    // Re-render multiple times while still loading.
    rerender({ isLoading: true, hasProduct: false });
    rerender({ isLoading: true, hasProduct: false });

    await actFlush();

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

        await actFlush();

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

      await actFlush();

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

    await actFlush();

    rerenderA({ slug: 'multi-slug-a', isLoading: false, hasProduct: true });
    await actFlush();

    unmountA();

    // Second PDP: cozy-bed-B (simulates SPA navigation to a new product)
    const { rerender: rerenderB } = renderHook(
      ({ slug, isLoading, hasProduct }: { slug: string; isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { slug: 'multi-slug-b', isLoading: true, hasProduct: false } },
    );

    await actFlush();

    rerenderB({ slug: 'multi-slug-b', isLoading: false, hasProduct: true });
    await actFlush();

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

    await actFlush();

    rerender({ isLoading: false, hasProduct: true });
    await actFlush();
    unmount();

    // --- Case 2: timeout (separate slug to avoid the rendered short-circuit)
    const timeoutSlug = 'payload-shape-timeout';
    renderHook(() =>
      usePdpBotRenderTrace({ slug: timeoutSlug, isLoading: true, hasProduct: false }),
    );

    await actFlush();

    await advanceAndFlush(8_001);

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
    await drainRetryBackoff();

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
    await actFlush();

    // Sit on the loading shell for 7,999ms — one millisecond shy of the
    // watchdog firing. No timeout should have been logged yet.
    await advanceAndFlush(7_999);

    expect(getReportedStates()).toEqual(['shell']);

    // Product data lands at the very edge of the watchdog window.
    rerender({ isLoading: false, hasProduct: true });
    await actFlush();

    expect(getReportedStates()).toEqual(['shell', 'rendered']);

    // Cross the original 8s boundary and well past it. If the watchdog were
    // still armed, it would now fire a "timeout" — it must not.
    await advanceAndFlush(5_000);

    const states = getReportedStates();
    expect(states).toEqual(['shell', 'rendered']);
    expect(states).not.toContain('timeout');

    // ---- Per-payload userAgent tag assertions --------------------------
    // The `getReportedStates()` helper above only verifies the ordered list
    // of states. At the boundary-cancellation scenario we additionally
    // assert each payload's `userAgent` carries the *correct* trace tag
    // (and no cross-contamination), since the watchdog firing late is the
    // most common way a stale `timeout` tag could leak into the rendered
    // payload's UA suffix.
    const slugCalls = invokeMock.mock.calls.filter(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
    );
    expect(slugCalls).toHaveLength(2);

    const [shellCall, renderedCall] = slugCalls.map(
      ([, opts]) => (opts as { body: { userAgent: string; pageUrl: string } }).body,
    );

    // Shell payload: UA must carry exactly the shell trace tag (with the
    // bracketed suffix and a t_mount duration), and must NOT carry rendered
    // or timeout tags.
    expect(shellCall.userAgent).toMatch(/\[pdp-render-trace:shell\b[^\]]*\]/);
    expect(shellCall.userAgent).toMatch(/t_mount=\d+ms/);
    expect(shellCall.userAgent).not.toMatch(/pdp-render-trace:rendered/);
    expect(shellCall.userAgent).not.toMatch(/pdp-render-trace:timeout/);

    // Rendered payload: UA must carry the rendered tag plus the
    // since-shell delta (~7999ms, since data landed 7,999ms after shell).
    // Critically, it must NOT carry a timeout tag — that's the leak this
    // assertion is here to catch.
    expect(renderedCall.userAgent).toMatch(/\[pdp-render-trace:rendered\b[^\]]*\]/);
    expect(renderedCall.userAgent).toMatch(/t_shell=\d+ms/);
    expect(renderedCall.userAgent).not.toMatch(/pdp-render-trace:shell\b/);
    expect(renderedCall.userAgent).not.toMatch(/pdp-render-trace:timeout/);

    // Mirror the state in the URL `_render` param so log analysis on either
    // field agrees with the userAgent tag.
    expect(new URL(shellCall.pageUrl).searchParams.get('_render')).toBe('shell');
    expect(new URL(renderedCall.pageUrl).searchParams.get('_render')).toBe('rendered');

    // Belt-and-braces: no log call for this slug carries the timeout tag.
    const timeoutCallsForSlug = slugCalls.filter(([, opts]) =>
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
    await drainRetryBackoff();

    // Product data arrives well before the 8s watchdog.
    rerender({ isLoading: false, hasProduct: true });
    await actFlush();

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
    await drainRetryBackoff();

    // Cross the 8s watchdog boundary while still on the shell.
    await advanceAndFlush(8_001);

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

  it('emits a single timeout log with the correct slug + tag + duration when hasProduct stays false past 8s', async () => {
    const slug = 'watchdog-stays-stuck-bed';
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    // Drain the shell-effect's async invoke.
    await actFlush();

    expect(getReportedStates()).toEqual(['shell']);

    // Re-render multiple times with hasProduct still false, simulating a stuck
    // PDP where loading flickers but data never lands. The watchdog must not
    // be cancelled or duplicated by these re-renders.
    await advanceAndFlush(3_000);
    rerender({ isLoading: true, hasProduct: false });
    await advanceAndFlush(3_000);
    rerender({ isLoading: true, hasProduct: false });

    // Still on shell — no timeout yet (we're at 6s).
    expect(getReportedStates()).toEqual(['shell']);

    // Cross the 8s boundary.
    await advanceAndFlush(2_001);

    // Exactly one timeout fired, and no rendered ever escaped.
    const states = getReportedStates();
    expect(states).toEqual(['shell', 'timeout']);
    expect(states.filter((s) => s === 'timeout')).toHaveLength(1);
    expect(states).not.toContain('rendered');

    // Validate the timeout payload shape: correct slug, render tag, and the
    // duration markers (`_t_shell` >= 8000ms, UA suffix carries shell delta).
    const timeoutCall = invokeMock.mock.calls.find(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { userAgent: string; pageUrl: string } }).body.userAgent.includes(
          'pdp-render-trace:timeout',
        ) &&
        (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
    );
    expect(timeoutCall).toBeDefined();
    const { pageUrl, userAgent } = (timeoutCall![1] as {
      body: { pageUrl: string; userAgent: string };
    }).body;

    expect(pageUrl).toContain(`/product/${slug}`);
    expect(pageUrl).toContain('_render=timeout');
    const tShellMatch = pageUrl.match(/_t_shell=(\d+)/);
    expect(tShellMatch).not.toBeNull();
    expect(Number(tShellMatch![1])).toBeGreaterThanOrEqual(8000);
    expect(userAgent).toMatch(/pdp-render-trace:timeout\b/);
    expect(userAgent).toMatch(/t_shell=\d+ms/);

    // Push well past the boundary — the watchdog must not fire a second time.
    await advanceAndFlush(10_000);
    expect(getReportedStates().filter((s) => s === 'timeout')).toHaveLength(1);
  });

  it('isolates watchdog cancellation per slug: rendering slug A does not cancel slug B\'s timeout', async () => {
    const slugA = 'isolated-watchdog-A';
    const slugB = 'isolated-watchdog-B';

    // Mount slug A first.
    const { rerender: rerenderA } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug: slugA, isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );
    await actFlush();

    // Mount slug B concurrently — independent hook instance, independent watchdog.
    renderHook(() =>
      usePdpBotRenderTrace({ slug: slugB, isLoading: true, hasProduct: false }),
    );
    await actFlush();

    // Both should have logged their shell event and armed their own watchdogs.
    const collectStatesForSlug = (slug: string): string[] =>
      invokeMock.mock.calls
        .filter(
          ([fn, opts]) =>
            fn === 'log-crawler-visit' &&
            (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
        )
        .map(([, opts]) => {
          const ua = (opts as { body: { userAgent: string } }).body.userAgent;
          return ua.match(/pdp-render-trace:(shell|rendered|timeout)/)?.[1] ?? 'unknown';
        });

    expect(collectStatesForSlug(slugA)).toEqual(['shell']);
    expect(collectStatesForSlug(slugB)).toEqual(['shell']);

    // Advance 5s — neither watchdog should have fired yet.
    await advanceAndFlush(5_000);

    // Slug A receives data and renders successfully (cancels A's watchdog only).
    rerenderA({ isLoading: false, hasProduct: true });
    await actFlush();

    expect(collectStatesForSlug(slugA)).toEqual(['shell', 'rendered']);
    // Critical: slug B must still be on the shell, watchdog still armed.
    expect(collectStatesForSlug(slugB)).toEqual(['shell']);

    // Cross slug B's 8s boundary (mounted ~0ms after A, so we need ≥3001ms more).
    await advanceAndFlush(3_001);

    // Slug B's timeout MUST have fired despite slug A having cancelled its own.
    const statesB = collectStatesForSlug(slugB);
    expect(statesB).toEqual(['shell', 'timeout']);

    // Slug A must NOT have received a spurious timeout from B's watchdog leak.
    const statesA = collectStatesForSlug(slugA);
    expect(statesA).toEqual(['shell', 'rendered']);
    expect(statesA).not.toContain('timeout');

    // Confirm the timeout payload is unambiguously tagged to slug B.
    const timeoutCall = invokeMock.mock.calls.find(
      ([fn, opts]) =>
        fn === 'log-crawler-visit' &&
        (opts as { body: { userAgent: string; pageUrl: string } }).body.userAgent.includes(
          'pdp-render-trace:timeout',
        ) &&
        (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slugB}`),
    );
    expect(timeoutCall).toBeDefined();
    const { pageUrl } = (timeoutCall![1] as {
      body: { pageUrl: string };
    }).body;
    expect(pageUrl).not.toContain(`/product/${slugA}`);
  });

  it('logs shell + rendered exactly once when hasProduct toggles true→false→true within the watchdog window', async () => {
    // Scenario: within the 8s watchdog window, the consumer briefly reports
    // hasProduct=true (e.g. an optimistic cache hit), then back to false (cache
    // invalidation / refetch flicker), then true again once the real fetch
    // resolves. The hook must:
    //   1. Emit "shell" exactly once on the initial loading skeleton.
    //   2. Emit "rendered" exactly once on the FIRST true transition.
    //   3. NEVER re-emit "rendered" on the second true transition.
    //   4. NEVER fire "timeout" — the first rendered already cancelled the
    //      watchdog and that cancellation must survive the false dip.
    const slug = 'toggle-flicker-bed';
    const { rerender } = renderHook(
      ({ isLoading, hasProduct }: { isLoading: boolean; hasProduct: boolean }) =>
        usePdpBotRenderTrace({ slug, isLoading, hasProduct }),
      { initialProps: { isLoading: true, hasProduct: false } },
    );

    // Drain the shell-effect's async invoke.
    await actFlush();

    expect(getReportedStates()).toEqual(['shell']);

    // Sit on the shell briefly (well within 8s).
    await advanceAndFlush(1_000);

    // Transition #1: hasProduct flips true → "rendered" should fire once.
    rerender({ isLoading: false, hasProduct: true });
    await actFlush();

    expect(getReportedStates()).toEqual(['shell', 'rendered']);

    // Mid-window: hasProduct flips back to false (refetch / cache miss flicker).
    // Hook is allowed to no-op here; we just need it not to re-emit shell or
    // re-arm a watchdog that could later fire a stale "timeout".
    rerender({ isLoading: true, hasProduct: false });
    await advanceAndFlush(2_000);

    expect(getReportedStates()).toEqual(['shell', 'rendered']);

    // Transition #2: hasProduct flips true again — must NOT emit a second
    // "rendered" because the firedRef.rendered guard latches on first success.
    rerender({ isLoading: false, hasProduct: true });
    await actFlush();

    expect(getReportedStates()).toEqual(['shell', 'rendered']);

    // Cross well past the original 8s boundary. If the false dip had re-armed
    // a watchdog (or the original wasn't properly cleared), a "timeout" would
    // fire here. It must not.
    await advanceAndFlush(10_000);

    const finalStates = getReportedStates();
    expect(finalStates).toEqual(['shell', 'rendered']);
    expect(finalStates.filter((s) => s === 'shell')).toHaveLength(1);
    expect(finalStates.filter((s) => s === 'rendered')).toHaveLength(1);
    expect(finalStates).not.toContain('timeout');

    // Sanity: confirm those two events are bound to OUR slug, not bleed-through.
    const slugStates = invokeMock.mock.calls
      .filter(
        ([fn, opts]) =>
          fn === 'log-crawler-visit' &&
          (opts as { body: { pageUrl: string } }).body.pageUrl.includes(`/product/${slug}`),
      )
      .map(([, opts]) => {
        const ua = (opts as { body: { userAgent: string } }).body.userAgent;
        return ua.match(/pdp-render-trace:(shell|rendered|timeout)/)?.[1] ?? 'unknown';
      });
    expect(slugStates).toEqual(['shell', 'rendered']);
  });
});

// =========================================================================
// Deterministic 8s-watchdog timeout suite
// =========================================================================
//
// Goal: prove the watchdog's terminal state is *exactly* ['shell', 'timeout']
// no matter what retry config the underlying `retryWithBackoff` is using.
//
// We simulate three real-world retry shapes for the "shell" log call:
//   1. fast-success     — first attempt resolves in 0ms (no retries needed)
//   2. mid-flight retry — first attempt fails, retry resolves at ~1.5s
//   3. slow exhausting  — every attempt fails, total chain spans ~6s, then throws
//
// In all three cases, `hasProduct` never flips, so the watchdog MUST fire at
// the 8s boundary and the terminal call sequence MUST end with ['shell',
// 'timeout'] — never a duplicate, never out-of-order, never missing.
//
// Determinism contract:
//   * vi.useFakeTimers() controls every clock the hook touches (setTimeout,
//     and the retry helper's internal sleep — which we replace with one that
//     uses setTimeout under fake timers).
//   * No `Date.now()` jitter influences the assertions; we only assert on
//     state names and call ordering, not durations.
//   * The watchdog fires at exactly t=8000ms after the shell event regardless
//     of where in the retry chain we currently are.

interface WatchdogRetryScenario {
  label: string;
  /** Build a `retryWithBackoff` replacement that uses fake-timer-friendly delays. */
  buildRetry: () => (
    fn: () => Promise<unknown>,
    config?: unknown,
  ) => Promise<unknown>;
}

/** Fake-timer-aware sleep helper (uses setTimeout so vi can advance it). */
function fakeSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WATCHDOG_SCENARIOS: WatchdogRetryScenario[] = [
  {
    label: 'fast-success: first attempt resolves immediately',
    buildRetry: () => async (fn) => fn(),
  },
  {
    label: 'mid-flight retry: first attempt fails, retry resolves at ~1.5s',
    buildRetry: () => {
      let attempts = 0;
      return async (fn) => {
        attempts++;
        if (attempts === 1) {
          // First attempt: simulate a 200ms network failure
          await fakeSleep(200);
          throw new Error('simulated transient failure');
        }
        // Backoff before retry, then succeed
        await fakeSleep(1_300);
        return fn();
      };
    },
  },
  {
    label: 'slow exhausting: every attempt fails over ~6s, chain rejects',
    buildRetry: () => async () => {
      // Three failing attempts spread across ~6 seconds, well within the
      // 8s watchdog window. The hook must swallow the rejection (logged via
      // console.warn) and still let the watchdog fire on schedule.
      for (let i = 0; i < 3; i++) {
        await fakeSleep(2_000);
        // continue — simulates retryWithBackoff retrying
      }
      throw new Error('all retries exhausted');
    },
  },
];

describe('usePdpBotRenderTrace — deterministic 8s watchdog across retry configs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockClear();
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    setUserAgent(GOOGLEBOT_UA);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Reset to the suite-wide default so other suites aren't polluted.
    retryImpl.current = async (fn) => fn();
  });

  for (const scenario of WATCHDOG_SCENARIOS) {
    it(`fires exactly one "timeout" at t=8s [${scenario.label}]`, async () => {
      retryImpl.current = scenario.buildRetry();

      const slug = `watchdog-deterministic-${scenario.label.replace(/[^a-z0-9]+/gi, '-')}`;
      renderHook(() =>
        usePdpBotRenderTrace({ slug, isLoading: true, hasProduct: false }),
      );

      // Drain the initial shell-effect's microtasks so the retry chain is
      // armed and the watchdog setTimeout is scheduled.
      await actFlush();

      // Walk the clock to t=7,999ms in 1s steps so any in-flight retry
      // delays inside the scenario also resolve along the way. The
      // watchdog must NOT fire before t=8000.
      for (let elapsed = 0; elapsed < 7_999; elapsed += 1_000) {
        await advanceAndFlush(1_000);
      }
      await advanceAndFlush(7_999 - 7_000); // top up to exactly 7,999ms

      const preBoundaryStates = getReportedStates().filter(
        (s) => s === 'shell' || s === 'timeout' || s === 'rendered',
      );
      // Pre-boundary: shell may or may not have landed yet depending on
      // how slow the retry chain is, but timeout MUST NOT have fired.
      expect(preBoundaryStates).not.toContain('timeout');
      expect(preBoundaryStates).not.toContain('rendered');

      // Cross the 8s boundary — watchdog fires here.
      await advanceAndFlush(2);

      // Drain any remaining retry chain work + the timeout's own
      // reportRenderState microtasks. Use a generous fake-timer drain so
      // even the slow-exhausting scenario completes cleanly.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
        await flushMicrotasks();
      });

      const finalStates = getReportedStates();

      // Terminal contract — identical for every retry config:
      //   1. exactly one "shell" entry
      //   2. exactly one "timeout" entry
      //   3. "shell" comes before "timeout"
      //   4. no "rendered" ever
      expect(finalStates.filter((s) => s === 'shell')).toHaveLength(1);
      expect(finalStates.filter((s) => s === 'timeout')).toHaveLength(1);
      expect(finalStates).not.toContain('rendered');
      expect(finalStates.indexOf('shell')).toBeLessThan(
        finalStates.indexOf('timeout'),
      );

      // Pushing far past the boundary must not trigger a duplicate timeout
      // or any late "rendered" log.
      await advanceAndFlush(20_000);
      const postDrainStates = getReportedStates();
      expect(postDrainStates).toEqual(finalStates);
    });
  }

  it('terminal state is identical across all retry configs (cross-scenario invariant)', async () => {
    const collected: string[][] = [];

    for (const scenario of WATCHDOG_SCENARIOS) {
      // Reset state between scenarios within the same test.
      invokeMock.mockClear();
      retryImpl.current = scenario.buildRetry();

      const slug = `watchdog-invariant-${collected.length}`;
      renderHook(() =>
        usePdpBotRenderTrace({ slug, isLoading: true, hasProduct: false }),
      );

      await actFlush();
      // Jump straight past the 8s boundary plus a generous drain for any
      // pending retry microtasks.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(13_000);
        await flushMicrotasks();
      });

      collected.push(getReportedStates());
    }

    // Every scenario must produce the exact same terminal sequence.
    for (const states of collected) {
      expect(states).toEqual(['shell', 'timeout']);
    }
  });
});
