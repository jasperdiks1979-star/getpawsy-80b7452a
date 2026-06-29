/**
 * GA4 Measurement Protocol helper — server-side `purchase` event.
 *
 * Used by `stripe-webhook` to guarantee GA4 receives the purchase even
 * when the client-side `trackPurchase()` on `/payment-success` misses
 * (refresh after clearCart, ad-blocker, in-app browser, etc.).
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