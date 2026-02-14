/**
 * Safe Marketing Client — NEVER throws, NEVER blocks rendering
 * All marketing calls go through this wrapper.
 */

// Feature flags — toggle providers without code changes
export const MARKETING_FLAGS = {
  MARKETING_ENABLED: true,
  PINTEREST_ENABLED: true,
  GOOGLE_ENABLED: true,
  META_ENABLED: true,
} as const;

export type MarketingProvider = 'pinterest' | 'google' | 'meta';

export interface MarketingResult<T = unknown> {
  ok: boolean;
  data?: T;
  reason?: string;
}

const PROVIDER_FLAG_MAP: Record<MarketingProvider, keyof typeof MARKETING_FLAGS> = {
  pinterest: 'PINTEREST_ENABLED',
  google: 'GOOGLE_ENABLED',
  meta: 'META_ENABLED',
};

/**
 * Safe wrapper for any marketing/analytics call.
 * - NEVER throws
 * - Returns {ok:false, reason} on failure
 * - Checks feature flags before executing
 */
export async function callMarketing<T = unknown>(
  name: string,
  fn: () => Promise<T> | T,
  provider?: MarketingProvider
): Promise<MarketingResult<T>> {
  try {
    // Global kill switch
    if (!MARKETING_FLAGS.MARKETING_ENABLED) {
      return { ok: false, reason: 'MARKETING_DISABLED' };
    }

    // Per-provider kill switch
    if (provider && !MARKETING_FLAGS[PROVIDER_FLAG_MAP[provider]]) {
      return { ok: false, reason: `${provider.toUpperCase()}_DISABLED` };
    }

    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
    console.error(`[Marketing:${name}] Non-fatal error:`, reason);
    return { ok: false, reason };
  }
}

/**
 * Fire-and-forget marketing call — runs after idle or setTimeout.
 * NEVER blocks rendering.
 */
export function fireMarketingAsync(
  name: string,
  fn: () => Promise<unknown> | unknown,
  provider?: MarketingProvider
): void {
  const execute = () => {
    callMarketing(name, fn, provider).catch(() => {
      // Intentionally swallowed — already logged inside callMarketing
    });
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(execute, { timeout: 3000 });
  } else {
    setTimeout(execute, 100);
  }
}
