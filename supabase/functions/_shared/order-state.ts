/**
 * Canonical order state model (Commerce J/K/L/M).
 *
 * PURE MODULE — no Deno / network / database access, so it can be imported by
 * edge functions AND unit-tested from the frontend test runner.
 *
 * Three independent axes, deliberately NOT collapsed into one field:
 *   payment_status      — what the payment provider confirmed
 *   fulfillment_status  — what the supplier confirmed
 *   refund_state        — what has been refunded and confirmed externally
 *
 * `orders.status` (legacy single column) is still written for backward
 * compatibility and is always DERIVED from the three axes below.
 */

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refunded";

export type FulfillmentStatus =
  | "unfulfilled"
  | "claimed"
  | "fulfillment_created"
  | "shipped"
  | "delivered"
  | "canceled"
  | "failed";

export type RefundState =
  | "none"
  | "refund_requested"
  | "refunded_partial"
  | "refunded_full"
  | "refund_failed";

export type RefundKind = "partial" | "full";

export type SupplierCancellationState =
  | "not_requested"
  | "requested"
  | "confirmed"
  | "rejected"
  | "not_applicable";

export const EXCEPTION_CODES = {
  PAYMENT_WITHOUT_ORDER: "payment_without_order",
  FULFILLMENT_FAILED: "fulfillment_failed",
  FULFILLMENT_STUCK_CLAIM: "fulfillment_stuck_claim",
  VARIANT_IDENTITY_MISSING: "variant_identity_missing",
  INVENTORY_UNAVAILABLE: "inventory_unavailable",
  REFUND_FAILED: "refund_failed",
  DUPLICATE_FULFILLMENT_BLOCKED: "duplicate_fulfillment_blocked",
} as const;

export type ExceptionCode = typeof EXCEPTION_CODES[keyof typeof EXCEPTION_CODES];

export interface OrderStateSnapshot {
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  refundState: RefundState;
  cjOrderId?: string | null;
  totalCents: number;
  refundedAmountCents: number;
  /** Minutes since the fulfillment claim was taken, when still claimed. */
  claimAgeMinutes?: number | null;
  fulfillmentAttempts?: number;
}

/** Legacy `orders.status`, derived — never authored independently. */
export function deriveLegacyStatus(s: {
  paymentStatus: PaymentStatus;
  refundState: RefundState;
  fulfillmentStatus?: FulfillmentStatus;
}): string {
  if (s.refundState === "refunded_full") return "refunded";
  if (s.paymentStatus === "paid") return "paid";
  if (s.paymentStatus === "failed") return "failed";
  if (s.paymentStatus === "expired") return "expired";
  if (s.paymentStatus === "refunded") return "refunded";
  return "pending";
}

/**
 * Payment confirmation is webhook-driven only. A browser query parameter is
 * never sufficient — `verifiedBy` must come from a signed provider event or a
 * server-side provider read.
 */
export type PaymentEvidence = "stripe_webhook" | "stripe_server_read";

export function isPaymentConfirmed(input: {
  paymentStatus: PaymentStatus;
  evidence?: PaymentEvidence | null;
}): boolean {
  return input.paymentStatus === "paid" && input.evidence != null;
}

/** Copy shown to a customer — never claims an unconfirmed outcome. */
export function customerPaymentWording(status: PaymentStatus | "unknown"): string {
  switch (status) {
    case "paid":
      return "Payment confirmed";
    case "pending":
      return "Payment processing — we'll confirm by email";
    case "failed":
      return "Payment was not completed";
    case "expired":
      return "Checkout session expired";
    case "refunded":
      return "Refund confirmed";
    default:
      return "Confirming your payment…";
  }
}

export function customerRefundWording(state: RefundState): string {
  switch (state) {
    case "refund_requested":
      return "Refund requested — not yet confirmed by your bank";
    case "refunded_partial":
      return "Partial refund confirmed";
    case "refunded_full":
      return "Full refund confirmed";
    case "refund_failed":
      return "Refund could not be completed — our team is on it";
    default:
      return "No refund on this order";
  }
}

/** Exactly-once fulfillment gate (mirrors the DB claim function). */
export function canFulfill(s: OrderStateSnapshot): { ok: boolean; reason: string } {
  if (s.paymentStatus !== "paid") return { ok: false, reason: "not_paid" };
  if (s.cjOrderId) return { ok: false, reason: "already_fulfilled" };
  if (
    s.fulfillmentStatus === "fulfillment_created" ||
    s.fulfillmentStatus === "shipped" ||
    s.fulfillmentStatus === "delivered"
  ) {
    return { ok: false, reason: "already_fulfilled" };
  }
  if (s.fulfillmentStatus === "claimed") {
    const age = s.claimAgeMinutes ?? 0;
    // A claim older than 15 minutes is considered abandoned and recoverable.
    return age >= 15
      ? { ok: true, reason: "stale_claim_recovered" }
      : { ok: false, reason: "claim_in_progress" };
  }
  if (s.refundState === "refunded_full" || s.fulfillmentStatus === "canceled") {
    return { ok: false, reason: "order_canceled" };
  }
  return { ok: true, reason: "eligible" };
}

export function classifyRefund(amountCents: number, totalCents: number): RefundKind {
  return amountCents >= totalCents ? "full" : "partial";
}

/** Validates a refund request. Never executes anything. */
export function validateRefundRequest(input: {
  order: OrderStateSnapshot;
  amountCents: number;
}): { ok: boolean; reason: string; kind?: RefundKind } {
  const { order, amountCents } = input;
  if (order.paymentStatus !== "paid" && order.refundState === "none") {
    return { ok: false, reason: "order_not_paid" };
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  const remaining = order.totalCents - order.refundedAmountCents;
  if (remaining <= 0) return { ok: false, reason: "already_fully_refunded" };
  if (amountCents > remaining) return { ok: false, reason: "amount_exceeds_remaining" };
  return {
    ok: true,
    reason: "eligible",
    kind: classifyRefund(order.refundedAmountCents + amountCents, order.totalCents),
  };
}

/**
 * Refund vs supplier cancellation. A refund BEFORE fulfillment can cancel the
 * supplier order; AFTER fulfillment the supplier order must be handled
 * separately and is never assumed cancelled.
 */
export function supplierCancellationFor(order: OrderStateSnapshot): SupplierCancellationState {
  if (!order.cjOrderId && order.fulfillmentStatus === "unfulfilled") return "not_applicable";
  if (order.fulfillmentStatus === "shipped" || order.fulfillmentStatus === "delivered") {
    return "not_applicable";
  }
  return "requested";
}

export function refundStateAfter(input: {
  previous: RefundState;
  succeeded: boolean;
  refundedTotalCents: number;
  orderTotalCents: number;
}): RefundState {
  if (!input.succeeded) return "refund_failed";
  if (input.refundedTotalCents <= 0) return input.previous;
  return input.refundedTotalCents >= input.orderTotalCents
    ? "refunded_full"
    : "refunded_partial";
}

export interface RecoveryAction {
  action: "none" | "retry_fulfillment" | "manual_review" | "reconcile_payment";
  code?: ExceptionCode;
  delayMinutes: number;
}

/** Deterministic recovery queue decision — same input, same output. */
export function nextRecoveryAction(s: OrderStateSnapshot): RecoveryAction {
  const attempts = s.fulfillmentAttempts ?? 0;

  if (s.paymentStatus === "paid" && s.fulfillmentStatus === "failed") {
    return attempts >= 3
      ? { action: "manual_review", code: EXCEPTION_CODES.FULFILLMENT_FAILED, delayMinutes: 0 }
      : {
          action: "retry_fulfillment",
          code: EXCEPTION_CODES.FULFILLMENT_FAILED,
          delayMinutes: [5, 30, 120][attempts] ?? 120,
        };
  }

  if (
    s.paymentStatus === "paid" &&
    s.fulfillmentStatus === "claimed" &&
    (s.claimAgeMinutes ?? 0) >= 15
  ) {
    return {
      action: "retry_fulfillment",
      code: EXCEPTION_CODES.FULFILLMENT_STUCK_CLAIM,
      delayMinutes: 0,
    };
  }

  if (s.paymentStatus === "pending") {
    return { action: "reconcile_payment", delayMinutes: 10 };
  }

  return { action: "none", delayMinutes: 0 };
}

// ── K: variant identity + server-authoritative price ────────────────────────

export interface CatalogVariant {
  vid?: string | null;
  variantSku?: string | null;
  variantNameEn?: string | null;
  variantKey?: string | null;
  variantSellPrice?: number | null;
}

/**
 * Cart line ids are `"<productId>"` or `"<productId>-<cjVariantId>"`.
 * Splitting is exact: everything after the FIRST uuid boundary is the vid.
 */
export function parseCartLineId(lineId: string): { productId: string; variantId: string | null } {
  const uuid = /^([0-9a-fA-F-]{36})(?:-(.+))?$/.exec(lineId.trim());
  if (uuid) return { productId: uuid[1], variantId: uuid[2] ?? null };
  return { productId: lineId.trim(), variantId: null };
}

/**
 * Resolves the EXACT variant. Never falls back to a different variant: an
 * unknown variant id is an error, not an invitation to guess.
 */
export function resolveExactVariant(
  variants: unknown,
  variantId: string | null,
): { ok: true; variant: CatalogVariant | null } | { ok: false; reason: string } {
  const list = Array.isArray(variants) ? (variants as CatalogVariant[]) : [];
  if (!variantId) {
    if (list.length > 1) return { ok: false, reason: "variant_required" };
    return { ok: true, variant: list[0] ?? null };
  }
  const match = list.find((v) => String(v?.vid ?? "") === variantId);
  if (!match) return { ok: false, reason: "variant_not_found" };
  return { ok: true, variant: match };
}

/**
 * Commerce N: there is ONE pricing engine. A cart line is priced at the
 * canonical unit price of the EXACT variant (or the product base price when
 * the product has no variant-level price). Volume rewards are cart-level and
 * are applied by the pricing engine — never baked into a line price.
 *
 * Therefore the client line price must equal the server line price to the
 * cent. Tolerating a "reasonably lower" client price is what allowed a 25 %
 * display/charge divergence, so it is gone.
 */
export const PRICE_TOLERANCE_CENTS = 1;

/** Canonical unit price for an exact variant, falling back to base price. */
export function canonicalUnitPrice(
  basePrice: number,
  variant: CatalogVariant | null | undefined,
): number {
  const vp = variant?.variantSellPrice;
  if (typeof vp === "number" && Number.isFinite(vp) && vp > 0) return vp;
  return basePrice;
}

export function validateLinePrice(input: {
  clientPrice: number | null | undefined;
  serverPrice: number;
}): { ok: boolean; reason: string; chargePrice: number } {
  const server = input.serverPrice;
  const client = typeof input.clientPrice === "number" ? input.clientPrice : null;
  if (!Number.isFinite(server) || server <= 0) {
    return { ok: false, reason: "server_price_unavailable", chargePrice: 0 };
  }
  if (client === null) return { ok: true, reason: "no_client_price", chargePrice: server };
  const deltaCents = Math.abs(Math.round(client * 100) - Math.round(server * 100));
  if (deltaCents > PRICE_TOLERANCE_CENTS) {
    return { ok: false, reason: "price_mismatch", chargePrice: server };
  }
  // The server (catalog) price stays authoritative — the client price is only
  // ever used as a tamper/staleness signal, never as the amount charged.
  return { ok: true, reason: "ok", chargePrice: server };
}

// ── L (Commerce N): exact variant stock + locked fulfillment warehouse ──────

/**
 * Warehouse inventory the supplier records for one variant in one country.
 * `null` when the payload carries no inventory record for that country.
 *
 * This is the supplier's own per-warehouse figure (`verifiedWarehouse`), and it
 * outranks the flat `stock` field: in the live catalogue 45 variants across 38
 * merchandised products carry `stock: 0` next to a US warehouse record holding
 * hundreds of units. Trusting the flat field there blocked checkout for
 * products that are genuinely in stock.
 */
export function variantWarehouseStockOf(
  variant: CatalogVariant | null | undefined,
  countryCode = "US",
): number | null {
  if (!variant) return null;
  const inventories = (variant as Record<string, unknown>).inventories;
  if (!Array.isArray(inventories)) return null;
  let best: number | null = null;
  for (const entry of inventories) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (String(rec.countryCode ?? "").toUpperCase() !== countryCode.toUpperCase()) continue;
    for (const key of ["totalInventory", "cjInventory", "inventoryNum", "storageNum"]) {
      const n = Number(rec[key]);
      if (Number.isFinite(n)) best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

/** Exact stock for a variant. `null` = supplier reports no per-variant stock. */
export function variantStockOf(variant: CatalogVariant | null | undefined): number | null {
  if (!variant) return null;
  // Per-warehouse inventory wins when the supplier provides it.
  const warehouse = variantWarehouseStockOf(variant);
  if (warehouse !== null) return warehouse;
  const v = variant as Record<string, unknown>;
  for (const key of ["variantStock", "stock", "quantity", "inventory"]) {
    const raw = v[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
      return Number(raw);
    }
  }
  return null;
}

/**
 * Exact-variant purchasability. Aggregate product stock may NEVER make a
 * zero-stock variant purchasable, so when the variant reports its own stock
 * that number wins.
 */
export function variantIsPurchasable(input: {
  variant: CatalogVariant | null | undefined;
  productStockTotal: number | null;
  quantity: number;
}): { ok: boolean; reason: string } {
  const vStock = variantStockOf(input.variant);
  if (vStock !== null) {
    if (vStock <= 0) return { ok: false, reason: "variant_sold_out" };
    if (vStock < input.quantity) return { ok: false, reason: "variant_insufficient_stock" };
    return { ok: true, reason: "variant_stock_ok" };
  }
  if (input.productStockTotal === null) return { ok: true, reason: "stock_unknown_product_level" };
  if (input.productStockTotal <= 0) return { ok: false, reason: "product_sold_out" };
  return { ok: true, reason: "product_stock_ok" };
}

export type LockedWarehouse = "US" | "CN" | "DE";

/** Destinations each concrete warehouse can actually fulfil. */
const WAREHOUSE_LANES: Record<LockedWarehouse, readonly string[]> = {
  US: ["US", "CA"],
  DE: ["US", "CA", "GB", "NL", "BE", "DE", "FR"],
  CN: ["US", "CA", "GB", "NL", "BE", "DE", "FR", "AU"],
};

/**
 * Resolves the ONE warehouse a line will actually ship from. An unknown or
 * missing supplier warehouse is NOT globally shippable — authorising a payment
 * we cannot fulfil is worse than losing the order, so it fails closed.
 */
export function lockFulfillmentWarehouse(input: {
  supplierWarehouse: string | null | undefined;
  destinationCountry: string;
}): { ok: true; warehouse: LockedWarehouse } | { ok: false; reason: string } {
  const raw = (input.supplierWarehouse ?? "").trim().toUpperCase();
  const country = (input.destinationCountry ?? "").trim().toUpperCase();
  if (!country) return { ok: false, reason: "destination_required" };
  if (raw !== "US" && raw !== "CN" && raw !== "DE") {
    return { ok: false, reason: "warehouse_unknown" };
  }
  const warehouse = raw as LockedWarehouse;
  if (!WAREHOUSE_LANES[warehouse].includes(country)) {
    return { ok: false, reason: "lane_not_supported" };
  }
  return { ok: true, warehouse };
}

// ── N: settlement gating ────────────────────────────────────────────────────

/**
 * A `checkout.session.completed` event does NOT mean money moved: delayed
 * methods complete the session while the payment is still `unpaid`. Only an
 * authoritative paid state may trigger settlement (order paid, email,
 * fulfillment, packaging, marketing).
 */
export function shouldSettleSession(session: {
  payment_status?: string | null;
  status?: string | null;
}): { settle: boolean; paymentStatus: PaymentStatus } {
  if (session.payment_status === "paid") return { settle: true, paymentStatus: "paid" };
  if (session.payment_status === "no_payment_required") {
    return { settle: true, paymentStatus: "paid" };
  }
  if (session.status === "expired") return { settle: false, paymentStatus: "expired" };
  return { settle: false, paymentStatus: "pending" };
}

// ── N: webhook lease semantics ──────────────────────────────────────────────

export type WebhookEventStatus = "processing" | "processed" | "failed" | "needs_review";

/**
 * Only `processed` is terminal. A retry that meets a stale `processing` lease
 * or a `failed` row must be allowed to run again — acknowledging it would drop
 * the work permanently.
 */
export function webhookRetryDecision(input: {
  existingStatus: WebhookEventStatus | string | null | undefined;
  leaseAgeSeconds: number;
  leaseTimeoutSeconds?: number;
}): { action: "skip_duplicate" | "wait_in_flight" | "take_over"; reason: string } {
  const timeout = input.leaseTimeoutSeconds ?? 300;
  const status = input.existingStatus ?? "processing";
  if (status === "processed") return { action: "skip_duplicate", reason: "already_processed" };
  if (status === "failed" || status === "needs_review") {
    return { action: "take_over", reason: "previous_attempt_failed" };
  }
  return input.leaseAgeSeconds >= timeout
    ? { action: "take_over", reason: "stale_lease" }
    : { action: "wait_in_flight", reason: "lease_active" };
}

