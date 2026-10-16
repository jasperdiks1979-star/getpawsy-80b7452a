import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('analytics-shadow-classifier session writes', () => {
  it('never overwrites interaction_count or engagement_ms on canonical_sessions', () => {
    const src = fs.readFileSync('supabase/functions/analytics-shadow-classifier/index.ts', 'utf8');
    const block = src.slice(src.indexOf('sessionWrites.set('), src.indexOf('const vid = first.visitor_id'));
    expect(block).not.toMatch(/interaction_count\s*:/);
    expect(block).not.toMatch(/engagement_ms\s*:/);
  });
});
