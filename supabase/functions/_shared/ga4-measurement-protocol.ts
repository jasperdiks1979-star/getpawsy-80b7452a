/**
 * GA4 Measurement Protocol helper — server-side `purchase` and
 * `begin_checkout` events.
 *
 * `purchase` is fired by `stripe-webhook` to guarantee GA4 sees the sale
 * even when client-side `trackPurchase()` misses (refresh, ad-blocker,
 * in-app browser, etc.). `begin_checkout` is fired by `create-checkout`
 * after a Stripe Checkout Session is created, so the canonical GA4 stream
 * sees a server-side mirror of the client `begin_checkout` event and the
 * funnel reconciles even when gtag is blocked.
 *
 * No-ops without GA4_MEASUREMENT_ID + GA4_API_SECRET so checkout flow is
 * never blocked by analytics misconfig.
 */

export interface Ga4MpPurchaseItem {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

export interface Ga4MpPurchaseInput {
  /** GA4 client id captured at checkout (gtag get … client_id). Falls back to order id. */
  clientId?: string | null;
  /** GA4 session id (optional but improves stitching). */
  sessionId?: string | null;
  orderId: string;
  value: number;
  currency: string;
  items: Ga4MpPurchaseItem[];
  /** Free-form attribution payload — written to event params so GA4 can group. */
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
}

export async function sendGa4PurchaseMp(
  input: Ga4MpPurchaseInput,
): Promise<{ ok: boolean; reason?: string; status?: number }> {
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  const apiSecret = Deno.env.get("GA4_API_SECRET");
  if (!measurementId || !apiSecret) {
    return { ok: false, reason: "missing_ga4_credentials" };
  }

  // Fall back to a deterministic client id so GA4 never rejects the event.
  const clientId = input.clientId || `srv.${input.orderId}`;

  const items = (input.items || []).map((it) => ({
    item_id: String(it.id ?? ""),
    item_name: it.name ?? "",
    price: Number(it.price ?? 0),
    quantity: Number(it.quantity ?? 1),
  }));

  const body = {
    client_id: clientId,
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    non_personalized_ads: false,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.orderId,
          value: Number(input.value.toFixed(2)),
          currency: (input.currency || "USD").toUpperCase(),
          items,
          source: input.source ?? undefined,
          medium: input.medium ?? undefined,
          campaign: input.campaign ?? undefined,
          engagement_time_msec: 1,
          server_origin: "stripe_webhook",
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // GA4 MP collect endpoint returns 2xx with empty body when accepted.
    await res.text().catch(() => "");
    if (!res.ok) return { ok: false, reason: "ga4_non_2xx", status: res.status };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: `fetch_error:${(e as Error).message}` };
  }
}

export interface Ga4MpBeginCheckoutInput {
  /** GA4 client id captured at checkout — falls back to a deterministic id. */
  clientId?: string | null;
  sessionId?: string | null;
  /** Stripe Checkout Session id — used as deterministic event id for dedup. */
  checkoutSessionId: string;
  value: number;
  currency: string;
  items: Ga4MpPurchaseItem[];
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
}

/**
 * Mirrors the client `begin_checkout` event to the canonical GA4 stream
 * via Measurement Protocol. GA4 deduplicates client + server events when
 * they share `client_id` + `session_id` + a deterministic transaction id,
 * so this is safe to fire on every Stripe session creation.
 */
export async function sendGa4BeginCheckoutMp(
  input: Ga4MpBeginCheckoutInput,
): Promise<{ ok: boolean; reason?: string; status?: number }> {
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  const apiSecret = Deno.env.get("GA4_API_SECRET");
  if (!measurementId || !apiSecret) {
    return { ok: false, reason: "missing_ga4_credentials" };
  }

  const clientId = input.clientId || `srv.${input.checkoutSessionId}`;

  const items = (input.items || []).map((it) => ({
    item_id: String(it.id ?? ""),
    item_name: it.name ?? "",
    price: Number(it.price ?? 0),
    quantity: Number(it.quantity ?? 1),
  }));

  const body = {
    client_id: clientId,
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    non_personalized_ads: false,
    events: [
      {
        name: "begin_checkout",
        params: {
          // Deterministic id so client + server begin_checkout dedupe in GA4.
          transaction_id: input.checkoutSessionId,
          checkout_session_id: input.checkoutSessionId,
          value: Number(input.value.toFixed(2)),
          currency: (input.currency || "USD").toUpperCase(),
          items,
          source: input.source ?? undefined,
          medium: input.medium ?? undefined,
          campaign: input.campaign ?? undefined,
          engagement_time_msec: 1,
          server_origin: "create_checkout",
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await res.text().catch(() => "");
    if (!res.ok) return { ok: false, reason: "ga4_non_2xx", status: res.status };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: `fetch_error:${(e as Error).message}` };
  }
}