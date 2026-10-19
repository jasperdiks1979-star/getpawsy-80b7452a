import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ddl = readFileSync('supabase/migrations/20261019194500_capture_exact_canonical_cci_ua.sql', 'utf8');

describe('canonical CCI source user agent evidence', () => {
  it('uses the event own meta rather than a reconstructed session/browser', () => {
    expect(ddl).toContain("NEW.meta->>'user_agent'");
    expect(ddl).toContain("NEW.source_system::text = 'cci'");
    expect(ddl).toContain('NEW.source_user_agent IS NULL');
    expect(ddl).toContain("jsonb_typeof(NEW.meta->'user_agent') = 'string'");
  });

  it('runs only before new inserts and includes rollback', () => {
    expect(ddl).toContain('BEFORE INSERT ON public.canonical_events');
    expect(ddl).not.toMatch(/BEFORE INSERT OR UPDATE ON public\.canonical_events/);
    expect(ddl).toContain('ROLLBACK');
    expect(ddl).not.toMatch(/^UPDATE\s+public\.canonical_events/gm);
  });
});
