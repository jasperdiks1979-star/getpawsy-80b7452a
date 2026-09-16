import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('review integrity', () => {
  it('public star ratings count approved reviews only', () => {
    const src = read('src/hooks/useProductRatings.ts');
    const selects = src.split('.select(').slice(1);
    expect(selects.length).toBeGreaterThan(0);
    for (const block of selects) {
      expect(block.slice(0, 400)).toContain("is_approved', true");
    }
  });

  it('the review form links the review to a real order instead of claiming verification', () => {
    const src = read('src/components/reviews/ReviewForm.tsx');
    expect(src).toContain('order_id: orderId');
    // The client must never assert these flags — the database decides.
    expect(src).not.toMatch(/is_verified_buyer\s*:/);
    expect(src).not.toMatch(/is_approved\s*:\s*true/);
  });

  it('review-request emails stay behind an explicit opt-in flag', () => {
    const src = read('supabase/functions/send-review-request/index.ts');
    expect(src).toContain('REVIEW_REQUEST_EMAILS_ENABLED');
    const gateIndex = src.indexOf('REVIEW_REQUEST_EMAILS_ENABLED');
    const sendIndex = src.indexOf('api.resend.com');
    expect(gateIndex).toBeGreaterThan(-1);
    if (sendIndex > -1) expect(gateIndex).toBeLessThan(sendIndex);
  });
});
