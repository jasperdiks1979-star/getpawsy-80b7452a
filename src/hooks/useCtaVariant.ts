/**
 * useCtaVariant — resolves which /go CTA variant the visitor should see.
 *
 * Resolution order (highest priority first):
 *   1. `?cta_variant=` URL override — used by QA / preview links to force
 *      a specific variant. Always wins, never persisted.
 *   2. A/B test bucket — if `ab_test_enabled=true` in cta_variant_config,
 *      the visitor is sticky-bucketed into variant A or B based on a
 *      hash of a per-device identifier stored in localStorage. Split is
 *      driven by `ab_test_split_a_pct`. Bucket key is namespaced by the
 *      `(variant_a|variant_b)` pair so changing the experiment lineup
 *      automatically invalidates old buckets.
 *   3. Auto-rollback active variant — falls back to whatever variant the
 *      `cta-variant-rollback-guard` has decided is currently safe.
 *   4. Build-time default — last-resort fallback while the network fetch
 *      is in flight; ensures impressions are never tagged with an empty
 *      variant which would silently zero CTR attribution.
 *
 * Returns `{ variant, source, loading }` so callers can attribute clicks
 * to whichever resolution path won (the admin dashboard wants this).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type VariantSource = 'url_override' | 'ab_test' | 'active' | 'default';

const BUCKET_STORAGE_KEY = 'gp_go_ab_bucket';
const DEVICE_ID_KEY = 'gp_device_id';

/** Stable per-device id, generated lazily and stored forever. */
function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Deterministic 0..99 bucket from a string. FNV-1a 32-bit (small + uniform
 * enough for split testing — we don't need cryptographic strength).
 */
function bucketOf(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash % 100;
}

function readUrlOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = new URL(window.location.href).searchParams.get('cta_variant');
    return v && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Read the cached A/B assignment for the current variant pair. We key the
 * cache on the (a|b) pair so changing the experiment lineup automatically
 * invalidates stale buckets — otherwise visitors would keep seeing the
 * old variant after we swap one side of the test.
 */
function readCachedBucket(pairKey: string): string | null {
  try {
    const raw = localStorage.getItem(BUCKET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pair: string; variant: string };
    return parsed?.pair === pairKey && typeof parsed?.variant === 'string'
      ? parsed.variant
      : null;
  } catch {
    return null;
  }
}

function writeCachedBucket(pairKey: string, variant: string): void {
  try {
    localStorage.setItem(
      BUCKET_STORAGE_KEY,
      JSON.stringify({ pair: pairKey, variant }),
    );
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

export function useCtaVariant(defaultVariant: string): {
  variant: string;
  source: VariantSource;
  loading: boolean;
} {
  const [variant, setVariant] = useState<string>(() => readUrlOverride() ?? defaultVariant);
  const [source, setSource] = useState<VariantSource>(() =>
    readUrlOverride() ? 'url_override' : 'default',
  );
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // URL override already won at init — skip the network roundtrip.
    if (readUrlOverride()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('cta_variant_config')
          .select(
            'active_variant, ab_test_enabled, ab_test_variant_a, ab_test_variant_b, ab_test_split_a_pct',
          )
          .eq('id', 1)
          .maybeSingle();
        if (cancelled || error || !data) {
          setLoading(false);
          return;
        }

        const abOn =
          data.ab_test_enabled === true &&
          !!data.ab_test_variant_a &&
          !!data.ab_test_variant_b;

        if (abOn) {
          const pairKey = `${data.ab_test_variant_a}|${data.ab_test_variant_b}`;
          const cached = readCachedBucket(pairKey);
          if (cached) {
            setVariant(cached);
            setSource('ab_test');
          } else {
            const splitA = Math.max(0, Math.min(100, data.ab_test_split_a_pct ?? 50));
            const bucket = bucketOf(`${getDeviceId()}::${pairKey}`);
            const assigned =
              bucket < splitA ? data.ab_test_variant_a! : data.ab_test_variant_b!;
            writeCachedBucket(pairKey, assigned);
            setVariant(assigned);
            setSource('ab_test');
          }
        } else if (data.active_variant) {
          setVariant(data.active_variant);
          setSource('active');
        }
      } catch {
        /* silent — keep default */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { variant, source, loading };
}