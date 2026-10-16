import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('analytics-shadow-classifier session writes', () => {
  it('never overwrites interaction_count or engagement_ms on canonical_sessions', () => {
    const src = fs.readFileSync('supabase/functions/analytics-shadow-classifier/index.ts', 'utf8');
    const block = src.slice(src.indexOf('.update({ ...lbl'), src.indexOf('.eq("session_id", r.session_id)'));
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/interaction_count|engagement_ms/);
  });
});
