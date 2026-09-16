import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression: a successful smoke-test refund must always leave the
 * smoke_test_runs row at status='refunded' WITH refunded_at and refund_id,
 * and no later writer may downgrade that terminal state back to 'paid'.
 *
 * The live $2.00 smoke test exposed the defect: the refund handler wrote
 * status='refunded', but a subsequent `smoke_test_verify` status sync
 * overwrote it with 'paid' while refund_id/refunded_at stayed set.
 */

const ADMIN_PAYMENTS = readFileSync("supabase/functions/admin-payments/index.ts", "utf8");
const STRIPE_WEBHOOK = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");

function block(src: string, from: string, lines = 24) {
  const i = src.indexOf(from);
  expect(i, `anchor not found: ${from}`).toBeGreaterThan(-1);
  return src.slice(i).split("\n").slice(0, lines).join("\n");
}

describe("smoke-test refund status invariant", () => {
  it("the refund handler writes status, refunded_at and refund_id together", () => {
    const b = block(ADMIN_PAYMENTS, "const refund = await stripe.refunds.create(");
    expect(b).toContain('status: "refunded"');
    expect(b).toContain("refunded_at:");
    expect(b).toContain("refund_id: refund.id");
  });

  it("only refundable (not yet refunded) runs are selected for refund", () => {
    const b = block(ADMIN_PAYMENTS, 'async function handleSmokeTestRefund', 20);
    expect(b).toContain('.eq("status", "paid")');
    expect(b).toContain('.is("refunded_at", null)');
  });

  it("smoke_test_verify cannot downgrade a refunded run back to paid", () => {
    const b = block(ADMIN_PAYMENTS, "// Sync smoke_test_runs status");
    expect(b).toContain('.eq("stripe_session_id", sessionId)');
    expect(b).toContain('.is("refunded_at", null)');
  });

  it("a replayed checkout webhook cannot downgrade a refunded run back to paid", () => {
    const b = block(STRIPE_WEBHOOK, 'if (session.metadata?.smoke_test === "true")', 30);
    expect(b).toContain('.eq("stripe_session_id", session.id)');
    expect(b).toContain('.is("refunded_at", null)');
  });

  it("no writer outside the refund handler may set status to refunded", () => {
    const occurrences = ADMIN_PAYMENTS.split('status: "refunded"').length - 1;
    expect(occurrences).toBe(1);
    expect(STRIPE_WEBHOOK).not.toContain('status: "refunded"');
  });
});

describe("refund status state machine", () => {
  // Pure model of the guarded update, proving the terminal state holds
  // across retries / late webhooks.
  type Run = { status: string; refunded_at: string | null; refund_id: string | null };

  const applyRefund = (r: Run, id: string): Run =>
    r.refunded_at ? r : { status: "refunded", refunded_at: "2026-09-16T11:45:28Z", refund_id: id };

  const applyStatusSync = (r: Run, paid: boolean): Run =>
    r.refunded_at ? r : { ...r, status: paid ? "paid" : "pending" };

  it("refund yields refunded + refunded_at + refund_id", () => {
    const out = applyRefund({ status: "paid", refunded_at: null, refund_id: null }, "re_1");
    expect(out).toEqual({ status: "refunded", refunded_at: "2026-09-16T11:45:28Z", refund_id: "re_1" });
  });

  it("later status syncs and webhook replays keep status refunded", () => {
    let r = applyRefund({ status: "paid", refunded_at: null, refund_id: null }, "re_1");
    r = applyStatusSync(r, true);
    r = applyStatusSync(r, true);
    r = applyRefund(r, "re_2");
    expect(r.status).toBe("refunded");
    expect(r.refund_id).toBe("re_1");
  });

  it("non-refunded runs still sync normally", () => {
    expect(applyStatusSync({ status: "pending", refunded_at: null, refund_id: null }, true).status).toBe("paid");
  });
});
