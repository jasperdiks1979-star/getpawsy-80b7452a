import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Phase 7 guard: no customer-facing email may leave the system until the store
 * owner explicitly enables it. Cron jobs invoke several of these functions on a
 * schedule, so the gate lives in the function code and fails closed.
 */

const FUNCTIONS = [
  'send-abandoned-cart-email',
  'send-remarketing-email',
  'send-claim-followup',
  'send-email-campaign',
  'send-seo-nurture-email',
];

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase', 'functions', name, 'index.ts'), 'utf8');

describe('outbound customer email', () => {
  it.each(FUNCTIONS)('%s is gated by OUTBOUND_CUSTOMER_EMAIL_ENABLED', (name) => {
    const src = read(name);
    expect(src).toContain('OUTBOUND_CUSTOMER_EMAIL_ENABLED');
    // fail-closed comparison: anything other than the literal "true" disables it
    expect(src).toMatch(/OUTBOUND_CUSTOMER_EMAIL_ENABLED"\)\s*!==\s*"true"/);
  });

  it('review-request email keeps its own explicit kill switch', () => {
    const path = join(process.cwd(), 'supabase', 'functions', 'send-review-request', 'index.ts');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toMatch(/REVIEW_REQUEST_EMAILS_ENABLED"\)\s*!==\s*"true"/);
  });
});
