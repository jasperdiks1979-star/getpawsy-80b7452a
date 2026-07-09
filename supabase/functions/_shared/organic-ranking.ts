// Organic-First Ranking helpers — Canonical Layer 1.
// Reads only from canonical_sessions_traffic_class + canonical_events via
// the v_organic_* views. Paid / internal / bot / low-confidence traffic is
// always excluded. Callers MUST NOT read raw canonical_sessions for ranking.

export type OrganicProductRow = {
  product_id: string;
  organic_sessions: number;
  organic_product_views: number;
  organic_add_to_cart: number;
  organic_checkout_started: number;
  organic_purchases: number;
  organic_revenue_cents: number;
  organic_rank_score: number;
};

export type OrganicPinRow = {
  pin_id: string;
  organic_sessions: number;
  organic_product_views: number;
  organic_add_to_cart: number;
  organic_purchases: number;
  organic_revenue_cents: number;
  organic_rank_score: number;
};

export type OrganicHealth = {
  organic_sessions_30d: number;
  paid_sessions_30d: number;
  internal_sessions_30d: number;
  bot_sessions_30d: number;
  low_confidence_excluded_30d: number;
  ranked_products: number;
  ranked_pins: number;
  computed_at: string;
};

export async function fetchOrganicProductRanking(sb: any, productIds?: string[]) {
  let q = sb.from("v_organic_product_ranking_30d").select("*").order("organic_rank_score", { ascending: false });
  if (productIds?.length) q = q.in("product_id", productIds);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  return (data ?? []) as OrganicProductRow[];
}

export async function fetchOrganicPinRanking(sb: any, pinIds?: string[]) {
  let q = sb.from("v_organic_pin_ranking_30d").select("*").order("organic_rank_score", { ascending: false });
  if (pinIds?.length) q = q.in("pin_id", pinIds);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  return (data ?? []) as OrganicPinRow[];
}

export async function fetchOrganicHealth(sb: any): Promise<OrganicHealth | null> {
  const { data } = await sb.from("v_organic_ranking_health").select("*").maybeSingle();
  return (data as OrganicHealth) ?? null;
}

// Verify a set of orders as ORGANIC via canonical_events(order_id) →
// canonical_sessions_traffic_class. Returns the subset of order ids whose
// originating session is organic, non-bot, non-internal, confidence ≥ 0.5.
export async function filterOrganicOrders(sb: any, orderIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!orderIds.length) return out;
  const { data: evs } = await sb
    .from("canonical_events")
    .select("order_id, session_id")
    .in("order_id", orderIds)
    .not("session_id", "is", null);
  const sessionsById = new Map<string, string[]>();
  for (const r of evs ?? []) {
    const arr = sessionsById.get(r.order_id) ?? [];
    if (r.session_id && !arr.includes(r.session_id)) arr.push(r.session_id);
    sessionsById.set(r.order_id, arr);
  }
  const allSessions = Array.from(new Set(Array.from(sessionsById.values()).flat()));
  if (!allSessions.length) return out;
  const { data: cls } = await sb
    .from("canonical_sessions_traffic_class")
    .select("session_id, organic_flag, bot_flag, internal_flag, attribution_confidence")
    .in("session_id", allSessions);
  const okSessions = new Set(
    (cls ?? [])
      .filter((s: any) =>
        s.organic_flag === true &&
        s.bot_flag === false &&
        s.internal_flag === false &&
        Number(s.attribution_confidence ?? 0) >= 0.5,
      )
      .map((s: any) => s.session_id),
  );
  for (const [orderId, sessIds] of sessionsById.entries()) {
    if (sessIds.some((sid) => okSessions.has(sid))) out.add(orderId);
  }
  return out;
}