/**
 * Commerce J/K/L/M regression suite.
 *
 * Side-effect free: pure state-model unit tests plus source-contract checks.
 * No Stripe call, no supplier call, no database write.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  canFulfill,
  classifyRefund,
  customerPaymentWording,
  customerRefundWording,
  deriveLegacyStatus,
  EXCEPTION_CODES,
  isPaymentConfirmed,
  nextRecoveryAction,
  parseCartLineId,
  refundStateAfter,
  resolveExactVariant,
  supplierCancellationFor,
  validateLinePrice,
  validateRefundRequest,
  type OrderStateSnapshot,
} from "../../supabase/functions/_shared/order-state";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const base: OrderStateSnapshot = {
  paymentStatus: "paid",
  fulfillmentStatus: "unfulfilled",
  refundState: "none",
  cjOrderId: null,
  totalCents: 7913,
  refundedAmountCents: 0,
};

// ── J: payment settlement / exactly-once fulfillment ────────────────────────
describe("J — payment settlement", () => {
  it("never treats a query parameter alone as payment proof", () => {
    expect(isPaymentConfirmed({ paymentStatus: "paid", evidence: null })).toBe(false);
    expect(isPaymentConfirmed({ paymentStatus: "paid", evidence: "stripe_webhook" })).toBe(true);
    expect(isPaymentConfirmed({ paymentStatus: "pending", evidence: "stripe_server_read" }))
      .toBe(false);
  });

  it("wording never claims success before confirmation", () => {
    expect(customerPaymentWording("unknown")).toMatch(/Confirming/i);
    expect(customerPaymentWording("pending")).not.toMatch(/confirmed$/i);
    expect(customerPaymentWording("paid")).toBe("Payment confirmed");
  });

  it("blocks a second fulfillment of the same order", () => {
    expect(canFulfill(base).ok).toBe(true);
    expect(canFulfill({ ...base, cjOrderId: "CJ123" })).toEqual({
      ok: false,
      reason: "already_fulfilled",
    });
    expect(canFulfill({ ...base, fulfillmentStatus: "fulfillment_created" }).ok).toBe(false);
    expect(canFulfill({ ...base, fulfillmentStatus: "shipped" }).ok).toBe(false);
  });

  it("refuses a duplicate while a claim is fresh, recovers a stale claim", () => {
    expect(canFulfill({ ...base, fulfillmentStatus: "claimed", claimAgeMinutes: 1 })).toEqual({
      ok: false,
      reason: "claim_in_progress",
    });
    expect(canFulfill({ ...base, fulfillmentStatus: "claimed", claimAgeMinutes: 60 }).ok).toBe(true);
  });

  it("never fulfils an unpaid order", () => {
    expect(canFulfill({ ...base, paymentStatus: "unpaid" })).toEqual({
      ok: false,
      reason: "not_paid",
    });
  });

  it("derives the legacy status from the state axes", () => {
    expect(deriveLegacyStatus({ paymentStatus: "paid", refundState: "none" })).toBe("paid");
    expect(deriveLegacyStatus({ paymentStatus: "paid", refundState: "refunded_full" }))
      .toBe("refunded");
    expect(deriveLegacyStatus({ paymentStatus: "paid", refundState: "refunded_partial" }))
      .toBe("paid");
  });

  it("webhook dedupes on the Stripe event id before any order mutation", () => {
    const src = read("supabase/functions/stripe-webhook/index.ts");
    const dedupeAt = src.indexOf('.from("stripe_webhook_events")');
    const switchAt = src.indexOf("switch (event.type)");
    expect(dedupeAt).toBeGreaterThan(-1);
    expect(dedupeAt).toBeLessThan(switchAt);
    expect(src).toContain("duplicate: true");
    expect(src).toContain("payment_status: \"paid\"");
  });

  it("supplier fulfillment is claimed atomically before any supplier call", () => {
    const src = read("supabase/functions/create-cj-order/index.ts");
    const claimAt = src.indexOf('claim_order_fulfillment');
    const cjCallAt = src.indexOf("await createCJOrder(");
    const tokenAt = src.indexOf("await getAccessToken(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(cjCallAt);
    expect(claimAt).toBeLessThan(tokenAt);
    expect(src).toContain('fulfillment_status: "fulfillment_created"');
  });

  it("the success page verifies the session server-side and gates tracking", () => {
    const src = read("src/pages/PaymentSuccess.tsx");
    expect(src).toContain("verify-payment-session");
    expect(src).toContain("if (verifyState !== 'confirmed') return;");
    expect(src).toContain("Confirming your payment");
  });

  it("verification reads Stripe server-side and never triggers fulfillment", () => {
    const src = read("supabase/functions/verify-payment-session/index.ts");
    expect(src).toContain("stripe.checkout.sessions.retrieve");
    expect(src).not.toContain("create-cj-order");
    expect(src).not.toContain("stripe.refunds.create");
  });
});

// ── K: product / variant / pricing identity ─────────────────────────────────
describe("K — variant and price identity", () => {
  const variants = [
    { vid: "v-white", variantSku: "SKU-W", variantNameEn: "White" },
    { vid: "v-black", variantSku: "SKU-B", variantNameEn: "Black" },
  ];

  it("splits a cart line id into product and exact variant", () => {
    expect(parseCartLineId("3f1c2b6a-1111-4222-8333-444455556666-v-black")).toEqual({
      productId: "3f1c2b6a-1111-4222-8333-444455556666",
      variantId: "v-black",
    });
    expect(parseCartLineId("3f1c2b6a-1111-4222-8333-444455556666").variantId).toBeNull();
  });

  it("resolves the exact variant and never substitutes another", () => {
    const ok = resolveExactVariant(variants, "v-black");
    expect(ok.ok && ok.variant?.variantSku).toBe("SKU-B");
    expect(resolveExactVariant(variants, "v-missing")).toEqual({
      ok: false,
      reason: "variant_not_found",
    });
    // Ambiguous multi-variant product with no selection must not guess.
    expect(resolveExactVariant(variants, null)).toEqual({ ok: false, reason: "variant_required" });
  });

  it("keeps the catalog price authoritative and rejects a tampered line price", () => {
    expect(validateLinePrice({ clientPrice: 79.13, serverPrice: 79.13 })).toEqual({
      ok: true,
      reason: "ok",
      chargePrice: 79.13,
    });
    // Commerce N: line prices must match to the cent — a "reasonably lower"
    // client price is no longer tolerated (that was the display/charge gap).
    expect(validateLinePrice({ clientPrice: 71.22, serverPrice: 79.13 }).ok).toBe(false);
    // Tampered price fails closed.
    const bad = validateLinePrice({ clientPrice: 1, serverPrice: 79.13 });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("price_mismatch");
    // A higher client price never raises the charge.
    expect(validateLinePrice({ clientPrice: 999, serverPrice: 79.13 }).chargePrice).toBe(79.13);
  });

  it("checkout carries exact identity into the order and fails closed on mismatch", () => {
    const src = read("supabase/functions/create-checkout/index.ts");
    expect(src).toContain("resolveExactVariant");
    expect(src).toContain('code: "variant_unavailable"');
    expect(src).toContain('code: "price_mismatch"');
    expect(src).toContain("cj_variant_id: i.cj_variant_id ?? null");
  });

  it("fulfillment refuses to ship when the exact variant cannot be resolved", () => {
    const src = read("supabase/functions/create-cj-order/index.ts");
    expect(src).toContain('error: "variant_identity_missing"');
    expect(src).toContain(EXCEPTION_CODES.VARIANT_IDENTITY_MISSING);
    // The old silent "use the first variant" fallback is gone.
    expect(src).not.toContain("Using first variant");
  });
});

// ── L: inventory / shipping truth ───────────────────────────────────────────
describe("L — inventory and shipping truth", () => {
  it("checkout blocks a confirmed sold-out product before charging", () => {
    const src = read("supabase/functions/create-checkout/index.ts");
    expect(src).toContain('code: "inventory_unavailable"');
    const inventoryAt = src.indexOf('code: "inventory_unavailable"');
    const sessionAt = src.indexOf("stripe.checkout.sessions.create");
    expect(inventoryAt).toBeLessThan(sessionAt);
  });

  it("never silently substitutes a warehouse when shipping is unavailable", () => {
    const src = read("supabase/functions/create-checkout/index.ts");
    expect(src).toContain('code: "cj_shipping_unavailable"');
  });

  it("keeps the 5–10 business-day customer promise", () => {
    const src = read("src/lib/shipping-constants.ts");
    expect(src).toMatch(/5[–-]10 business days/);
  });
});

// ── M: order lifecycle, refunds, recovery ───────────────────────────────────
describe("M — lifecycle, refunds and recovery", () => {
  it("distinguishes partial from full refunds", () => {
    expect(classifyRefund(1000, 7913)).toBe("partial");
    expect(classifyRefund(7913, 7913)).toBe("full");
  });

  it("validates refund amounts against the remaining balance", () => {
    expect(validateRefundRequest({ order: base, amountCents: 1000 })).toMatchObject({
      ok: true,
      kind: "partial",
    });
    expect(validateRefundRequest({ order: base, amountCents: 7913 })).toMatchObject({
      ok: true,
      kind: "full",
    });
    expect(validateRefundRequest({ order: base, amountCents: 9000 }).reason)
      .toBe("amount_exceeds_remaining");
    expect(validateRefundRequest({ order: base, amountCents: 0 }).reason).toBe("invalid_amount");
    expect(
      validateRefundRequest({
        order: { ...base, refundedAmountCents: 7913, refundState: "refunded_full" },
        amountCents: 100,
      }).reason,
    ).toBe("already_fully_refunded");
  });

  it("a failed refund never reads as refunded", () => {
    expect(
      refundStateAfter({
        previous: "none",
        succeeded: false,
        refundedTotalCents: 0,
        orderTotalCents: 7913,
      }),
    ).toBe("refund_failed");
    expect(customerRefundWording("refund_failed")).not.toMatch(/confirmed/i);
    expect(customerRefundWording("refund_requested")).toMatch(/not yet confirmed/i);
  });

  it("separates refund before fulfillment from refund after shipping", () => {
    // Before fulfillment: nothing to cancel at the supplier.
    expect(supplierCancellationFor(base)).toBe("not_applicable");
    // Created but not shipped: cancellation is requested, never assumed done.
    expect(
      supplierCancellationFor({
        ...base,
        cjOrderId: "CJ1",
        fulfillmentStatus: "fulfillment_created",
      }),
    ).toBe("requested");
    // Already shipped: a supplier cancellation is not applicable.
    expect(
      supplierCancellationFor({ ...base, cjOrderId: "CJ1", fulfillmentStatus: "shipped" }),
    ).toBe("not_applicable");
  });

  it("refund execution is dry-run unless admin, confirm and env switch all agree", () => {
    const src = read("supabase/functions/admin-refund-order/index.ts");
    expect(src).toContain("requireInternalOrAdmin");
    expect(src).toContain('REFUNDS_ENABLED');
    expect(src).toContain("const dryRun = !confirm || !refundsEnabled;");
    const dryReturn = src.indexOf("if (dryRun) {");
    const refundCall = src.indexOf("stripe.refunds.create");
    expect(dryReturn).toBeGreaterThan(-1);
    expect(dryReturn).toBeLessThan(refundCall);
  });

  it("no code path cancels or replaces a supplier order automatically", () => {
    const refund = read("supabase/functions/admin-refund-order/index.ts");
    const recovery = read("supabase/functions/order-recovery-queue/index.ts");
    for (const src of [refund, recovery]) {
      expect(src).not.toContain("cjdropshipping.com");
      expect(src).not.toContain("create-cj-order");
    }
  });

  it("produces a deterministic recovery action", () => {
    const failed = { ...base, fulfillmentStatus: "failed" as const, fulfillmentAttempts: 0 };
    expect(nextRecoveryAction(failed)).toEqual({
      action: "retry_fulfillment",
      code: EXCEPTION_CODES.FULFILLMENT_FAILED,
      delayMinutes: 5,
    });
    expect(nextRecoveryAction({ ...failed, fulfillmentAttempts: 1 }).delayMinutes).toBe(30);
    expect(nextRecoveryAction({ ...failed, fulfillmentAttempts: 3 }).action).toBe("manual_review");
    expect(
      nextRecoveryAction({ ...base, fulfillmentStatus: "claimed", claimAgeMinutes: 90 }).code,
    ).toBe(EXCEPTION_CODES.FULFILLMENT_STUCK_CLAIM);
    expect(nextRecoveryAction({ ...base, paymentStatus: "pending" }).action)
      .toBe("reconcile_payment");
    expect(nextRecoveryAction(base).action).toBe("none");
  });

  it("guest order lookup fails closed without proof of ownership", () => {
    const src = read("supabase/functions/lookup-guest-order/index.ts");
    expect(src).toContain("if (!expected || !accessToken || accessToken !== expected)");
    expect(src).toContain("auth.getClaims");
    expect(src).toContain("callerId !== order.user_id");
    // Email alone can no longer open an account order.
    expect(src).not.toContain("if (!order.user_id && order.order_access_token) {");
  });

  it("the claims route exists and is scoped to the signed-in customer", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/my-claims"');
    expect(app).toContain('path="/track-order"');
    const claims = read("src/pages/MyClaims.tsx");
    expect(claims).toContain('.eq("customer_email", userProfile!.email as string)');
  });

  it("privileged new functions are in the guarded registry", () => {
    const registry = read("supabase/functions/_shared/guarded-functions.ts");
    expect(registry).toContain('"admin-refund-order"');
    expect(registry).toContain('"order-recovery-queue"');
  });
});
