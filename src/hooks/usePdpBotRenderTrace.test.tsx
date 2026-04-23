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
});
