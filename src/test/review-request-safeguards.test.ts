import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The review-request email is the one customer-facing email the owner enabled.
 * These guards lock the safeguards that made enabling it safe.
 */
const src = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'send-review-request', 'index.ts'),
  'utf8',
);

describe('send-review-request safeguards', () => {
  it('keeps its explicit kill switch', () => {
    expect(src).toMatch(/REVIEW_REQUEST_EMAILS_ENABLED"\)\s*!==\s*"true"/);
  });

  it('only mails delivered orders, never merely shipped ones', () => {
    expect(src).toContain('.eq("status", "delivered")');
    expect(src).not.toContain('"shipped"');
  });

  it('excludes owner and smoke-test orders', () => {
    expect(src).toContain('isInternalOrder');
    expect(src).toContain('jasperdiks@hotmail.com');
    expect(src).toContain('jasperdiks1979@gmail.com');
    expect(src).toContain('SMOKE_TEST_MAX_AMOUNT');
  });

  it('never re-sends for an order that already has a request', () => {
    expect(src).toContain('review_requests');
    expect(src).toContain('.eq("order_id", order.id)');
  });

  it('honours unsubscribe suppression and offers an unsubscribe link', () => {
    expect(src).toContain('is_active');
    expect(src).toContain('/unsubscribe?email=');
  });

  it('links to the purchased product review section with the order bound', () => {
    expect(src).toContain('?order=${order.id}#reviews');
  });

  it('only looks at a recent window, so old orders are never back-sent', () => {
    expect(src).toContain('fiveDaysAgo');
    expect(src).toContain('tenDaysAgo');
  });
});
