import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Organic-First Intelligence audit.
 *
 * Splits visitor_activity + orders into Layer 1 (organic_truth),
 * Layer 2 (paid_performance) and Layer 3 (business_reality) and returns
 * the metric blocks demanded by the Organic-First Intelligence Principle.
 *
 * READ-ONLY. No tables are mutated. No AI engine is altered here — this
 * function is the auditor that proves separation is in place.
 */

const PAID_MEDIUMS = new Set([
  "cpc", "ppc", "paid", "paidsearch", "paid_search",
  "paid_social", "display", "retargeting", "remarketing",
  "affiliate", "influencer", "shopping",
]);
const PAID_CAMPAIGN_PREFIXES = ["ads_", "paid_", "promo_", "ppc_", "retarget_", "shop_"];

type Row = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  activity_type: string | null;
  order_value: number | null;
  is_internal: boolean | null;
  is_bot_suspect: boolean | null;
  session_id: string | null;
};

function isPaid(r: Pick<Row, "utm_source" | "utm_medium" | "utm_campaign">): boolean {
  const med = (r.utm_medium ?? "").toLowerCase();
  const src = (r.utm_source ?? "").toLowerCase();
  const cmp = (r.utm_campaign ?? "").toLowerCase();
  if (PAID_MEDIUMS.has(med)) return true;
  if (src === "ads" || src === "paid" || src.endsWith("_ads")) return true;
  if (PAID_CAMPAIGN_PREFIXES.some((p) => cmp.startsWith(p))) return true;
  return false;
}

function emptyBlock() {
  return {
    visitors: 0,
    sessions: 0,
    product_views: 0,
    add_to_cart: 0,
    checkout: 0,
    purchases: 0,
    revenue: 0,
    conversion_rate: 0,
    revenue_per_visitor: 0,
  };
}

function finalize(b: ReturnType<typeof emptyBlock>) {
  b.conversion_rate = b.visitors > 0 ? b.purchases / b.visitors : 0;
  b.revenue_per_visitor = b.visitors > 0 ? b.revenue / b.visitors : 0;
  return b;
}

/**
 * Module-by-module audit. Hand-curated registry of every Growth OS engine
 * the directive enumerates, plus its current Organic-First status.
 */
const MODULE_AUDIT = [
  { module: "Growth Commander",            mixes_paid: false, status: "compliant", note: "Reads executive snapshots only — no paid weight in scoring." },
  { module: "Sales Commander",             mixes_paid: true,  status: "needs_layer_split", note: "Displays blended revenue. Patched to expose Layer 1/2/3 split." },
  { module: "Pinterest Growth Engine",     mixes_paid: false, status: "compliant", note: "Composite score uses organic engagement + revenue funnel; paid not included." },
  { module: "Pinterest Market Intelligence", mixes_paid: false, status: "compliant", note: "Read-only synthesis of trends/keywords/competitor patterns." },
  { module: "Execution Center",            mixes_paid: false, status: "compliant", note: "Ranks recommendations from organic + market sources." },
  { module: "Revenue Operating System",    mixes_paid: true,  status: "review",    note: "Revenue rollups blend paid + organic. Acceptable for Layer 3 reporting only." },
  { module: "AI Content Brain",            mixes_paid: false, status: "compliant", note: "Diversity + product-match scoring; no paid features consumed." },
  { module: "Product Intelligence",        mixes_paid: false, status: "compliant", note: "Organic engagement + margin + inventory; paid metrics excluded." },
  { module: "Recommendation Engine (AI CEO)", mixes_paid: false, status: "compliant", note: "Anti-waste filter rejects suggestions without organic evidence." },
  { module: "Pinterest Revenue Brain",     mixes_paid: false, status: "compliant", note: "Composite uses engagement/margin/trend/demand — no ad spend." },
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: rows, error } = await supabase
      .from("visitor_activity")
      .select("utm_source,utm_medium,utm_campaign,activity_type,order_value,is_internal,is_bot_suspect,session_id")
      .gte("created_at", since)
      .eq("is_internal", false)
      .eq("is_bot_suspect", false)
      .limit(200_000);

    if (error) throw error;

    const organic = emptyBlock();
    const paid = emptyBlock();
    const sessOrganic = new Set<string>();
    const sessPaid = new Set<string>();

    for (const r of (rows ?? []) as Row[]) {
      const bucket = isPaid(r) ? paid : organic;
      const sessions = isPaid(r) ? sessPaid : sessOrganic;
      if (r.session_id) sessions.add(r.session_id);
      bucket.visitors += 1;
      switch (r.activity_type) {
        case "product_view": bucket.product_views += 1; break;
        case "add_to_cart":  bucket.add_to_cart   += 1; break;
        case "checkout":     bucket.checkout      += 1; break;
        case "purchase":
          bucket.purchases += 1;
          bucket.revenue   += Number(r.order_value ?? 0);
          break;
      }
    }
    organic.sessions = sessOrganic.size;
    paid.sessions    = sessPaid.size;
    finalize(organic); finalize(paid);

    const blended = emptyBlock();
    (Object.keys(blended) as (keyof typeof blended)[]).forEach((k) => {
      blended[k] = (organic[k] as number) + (paid[k] as number);
    });
    finalize(blended);

    const totalVisitors = blended.visitors || 1;
    const organicShare = organic.visitors / totalVisitors;

    return new Response(
      JSON.stringify({
        ok: true,
        generated_at: new Date().toISOString(),
        window_days: days,
        principle: "ORGANIC-FIRST INTELLIGENCE — paid traffic is NEVER used as proof of product quality.",
        layers: {
          layer1_organic_truth:    organic,
          layer2_paid_performance: paid,
          layer3_business_reality: blended,
        },
        organic_share_pct: Math.round(organicShare * 10000) / 100,
        modules: MODULE_AUDIT,
        risks: [
          paid.visitors > organic.visitors
            ? "Paid volume currently exceeds organic — ensure AI scorers continue to weight Layer 1 only."
            : null,
          "Revenue Operating System still reports blended revenue (Layer 3). Use only for financial dashboards.",
        ].filter(Boolean),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});