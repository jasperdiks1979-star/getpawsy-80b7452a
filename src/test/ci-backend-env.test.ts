import { describe, it, expect } from 'vitest';
// @ts-expect-error plain ESM script helper
import { readCiBackendEnv } from '../../scripts/lib/ci-backend-env.mjs';

describe('CI backend env', () => {
  it('reports missing key instead of falling back', () => {
    const r = readCiBackendEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: '' });
    expect(r.problems).toEqual(['SUPABASE_ANON_KEY is missing']);
  });
  it('rejects malformed and non-https URLs', () => {
    expect(readCiBackendEnv({ SUPABASE_URL: 'example.supabase.co', SUPABASE_ANON_KEY: 'k' }).problems[0]).toBe('SUPABASE_URL is not a valid URL');
    expect(readCiBackendEnv({ SUPABASE_URL: 'http://x.co', SUPABASE_ANON_KEY: 'k' }).problems[0]).toMatch(/https/);
  });
  it('normalises a valid URL to origin', () => {
    const r = readCiBackendEnv({ SUPABASE_URL: ' https://x.supabase.co/ ', SUPABASE_ANON_KEY: 'k' });
    expect(r.problems).toEqual([]);
    expect(r.url).toBe('https://x.supabase.co');
  });
});
