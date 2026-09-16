import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { semanticDedupKey } from "../../supabase/functions/_shared/canonicalDedup";

/**
 * Regression: one checkout_funnel purchase source event must produce exactly
 * ONE canonical purchase row and ONE revenue amount, no matter which writer
 * mirrors it (edge `canonical-ingest` or SQL `canonical_ingest_recent`).
 *
 * The live $2.00 smoke test exposed the defect: the two writers emitted
 * different dedup key shapes for the same purchase, so `ON CONFLICT
 * (dedup_key)` could not collapse them and revenue was counted twice.
 */

const MIGRATION = "supabase/migrations/20260916112347_af15c6c0-8266-4d00-a713-eed481f63864.sql";

/** Mirror of the SQL purchase key, used to prove both writers agree. */
function sqlPurchaseKey(source: string, stripeSessionId: string | null, sessionId: string | null) {
  const anchor = (stripeSessionId || "") || (sessionId || "") || "unknown";
  return [source, "CANONICAL_PURCHASE", anchor].join("|");
}

describe("canonical purchase dedup key", () => {
  const STRIPE = "cs_live_a1o54ZsR3hmFgRYf0E79tJkn9F1kyOWOw0u8GTY5iYvrxG9TxsgjKKIky2";

  it("is anchored on the Stripe session, not the source row id or a time bucket", () => {
    const key = semanticDedupKey({
      source: "checkout_funnel",
      canonical: "CANONICAL_PURCHASE",
      session_id: "sess-1",
      stripe_session_id: STRIPE,
      occurred_at: "2026-09-16T11:14:38.276Z",
    });
    expect(key).toBe(`checkout_funnel|CANONICAL_PURCHASE|${STRIPE}`);
    expect(key).not.toContain("2026-09-16");
  });

  it("produces one key for one purchase across repeated ingest passes and row ids", () => {
    const keys = new Set(
      ["2026-09-16T11:14:38.276Z", "2026-09-16T11:19:02.000Z", "2026-09-16T12:44:00.000Z"].map((at) =>
        semanticDedupKey({
          source: "checkout_funnel",
          canonical: "CANONICAL_PURCHASE",
          session_id: "sess-1",
          stripe_session_id: STRIPE,
          occurred_at: at,
        }),
      ),
    );
    expect(keys.size).toBe(1);
  });

  it("both writers agree on the key for the same source event (one row, one revenue amount)", () => {
    const edge = semanticDedupKey({
      source: "checkout_funnel",
      canonical: "CANONICAL_PURCHASE",
      session_id: "sess-1",
      stripe_session_id: STRIPE,
      occurred_at: "2026-09-16T11:14:38.276Z",
    });
    expect(edge).toBe(sqlPurchaseKey("checkout_funnel", STRIPE, "sess-1"));

    // Same purchase, two different source rows / writers → one canonical row.
    const collapsed = new Set([edge, sqlPurchaseKey("checkout_funnel", STRIPE, "sess-1")]);
    expect(collapsed.size).toBe(1);
  });

  it("orders-sourced purchases anchor on the order id", () => {
    expect(
      semanticDedupKey({ source: "orders", canonical: "CANONICAL_PURCHASE", order_id: "ord-9", stripe_session_id: STRIPE }),
    ).toBe("orders|CANONICAL_PURCHASE|ord-9");
  });

  it("distinct purchases still produce distinct keys", () => {
    const a = semanticDedupKey({ source: "checkout_funnel", canonical: "CANONICAL_PURCHASE", stripe_session_id: "cs_live_A" });
    const b = semanticDedupKey({ source: "checkout_funnel", canonical: "CANONICAL_PURCHASE", stripe_session_id: "cs_live_B" });
    expect(a).not.toBe(b);
  });

  it("non-purchase events keep their bucketed behaviour", () => {
    const atc1 = semanticDedupKey({
      source: "cci", canonical: "CANONICAL_ADD_TO_CART", session_id: "s", product_id: "p",
      occurred_at: "2026-09-16T11:14:00.000Z",
    });
    const atc2 = semanticDedupKey({
      source: "cci", canonical: "CANONICAL_ADD_TO_CART", session_id: "s", product_id: "p",
      occurred_at: "2026-09-16T11:14:10.000Z",
    });
    const atc3 = semanticDedupKey({
      source: "cci", canonical: "CANONICAL_ADD_TO_CART", session_id: "s", product_id: "p",
      occurred_at: "2026-09-16T11:20:00.000Z",
    });
    expect(atc1).toBe(atc2);
    expect(atc1).not.toBe(atc3);
    expect(atc1).toContain("CANONICAL_ADD_TO_CART");
  });
});

describe("SQL writer canonical_ingest_recent", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("emits the semantic purchase key for checkout_funnel purchases", () => {
    expect(sql).toContain("concat_ws('|', 'checkout_funnel', 'CANONICAL_PURCHASE',");
  });

  it("emits the semantic purchase key for order purchases", () => {
    expect(sql).toContain("concat_ws('|', 'orders', 'CANONICAL_PURCHASE', o.id::text)");
  });

  it("keeps the legacy per-row key shape for non-purchase steps", () => {
    expect(sql).toContain("ELSE concat_ws('|', 'checkout_funnel', e.id::text, e.session_id,");
    expect(sql).toContain("ELSE concat_ws('|', 'cci', e.id::text, e.session_id,");
  });

  it("scopes the duplicate cleanup to the smoke-test row only", () => {
    expect(sql).toContain("meta->>'smoke_test' = 'true'");
    expect(sql).toContain("DELETE FROM public.canonical_events");
  });
});
