import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { needsResign, signedUrlExpiryMs, SIGNABLE_VIDEO_BUCKETS } from '@/lib/productVideoUrl';

const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signed = (bucket: string, expSec: number) =>
  `https://x.supabase.co/storage/v1/object/sign/${bucket}/a/b.mp4?token=h.${b64u({ exp: expSec })}.s`;
const now = Date.UTC(2026, 9, 2);

describe('product video signed-URL renewal', () => {
  it('reads expiry from a signed URL', () => {
    expect(signedUrlExpiryMs(signed('cinematic-v3', 100))).toBe(100_000);
  });
  it('expired stored URL is flagged for re-signing', () => {
    expect(needsResign(signed('cinematic-v3', now / 1000 - 60), now)).toBe(true);
  });
  it('long-valid URL is used as-is (no extra signing call)', () => {
    expect(needsResign(signed('product-media', now / 1000 + 86400 * 365), now)).toBe(false);
  });
  it('image / public / non-signed URLs are never touched', () => {
    expect(needsResign('https://x.supabase.co/storage/v1/object/public/product-images/a.jpg', now)).toBe(false);
    expect(needsResign(null, now)).toBe(false);
    expect(needsResign('https://x/sign/garbage', now)).toBe(false);
  });
  it('only product video buckets are signable', () => {
    expect([...SIGNABLE_VIDEO_BUCKETS].sort()).toEqual(['cinematic-v3', 'product-media']);
  });
});

describe('signer function contract', () => {
  const fn = readFileSync(resolve('supabase/functions/product-video-urls/index.ts'), 'utf8');
  it('needs no admin login, takes only a product id, reads video rows server-side', () => {
    expect(fn).not.toMatch(/has_role|getUser/);
    expect(fn).toContain('UUID.test(productId)');
    expect(fn).toContain('.eq("media_type", "video")');
  });
  it('signs only allow-listed private buckets, short TTL, and never writes rows', () => {
    expect(fn).toContain('ALLOWED_BUCKETS.has(ref.bucket)');
    expect(fn).toContain('60 * 60 * 6');
    expect(fn).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    expect(fn).not.toMatch(/public:\s*true|updateBucket/);
  });
  it('missing object yields null and nothing is logged', () => {
    expect(fn).toContain('data?.signedUrl ?? null');
    expect(fn).not.toContain('console.');
  });
});

describe('storefront wiring', () => {
  const c = readFileSync(resolve('src/components/products/ProductVideoSection.tsx'), 'utf8');
  it('re-signs only when needed and drops dead links on failure', () => {
    expect(c).toContain('needsResign');
    expect(c).toContain('"product-video-urls"');
    expect(c).toContain('.filter((r) => !needsResign(r.storage_url))');
    expect(c).not.toContain('console.');
  });
});
