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
vi.mock('@/hooks/useRetryWithBackoff', () => ({
  retryWithBackoff: async (fn: () => Promise<unknown>) => fn(),
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
});
