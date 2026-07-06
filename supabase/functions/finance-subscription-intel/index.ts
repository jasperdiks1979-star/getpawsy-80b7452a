// finance-subscription-intel — Wave D2
// Detects recurring cycles, price trends, duplicates, unused subscriptions,
// annualized forecast and renewal risk. Additive on finance_subscriptions.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Sub = {
  id: string;
  supplier_slug: string;
  product_name: string;
  cadence: string;
  amount_minor: number;
  currency: string;
  is_active: boolean;
  last_seen_at: string | null;
  price_history: any[];
  duplicate_of: string | null;
};

function annualize(cadence: string, minor: number): number {
  switch (cadence) {
    case "monthly": return minor * 12;
    case "quarterly": return minor * 4;
    case "weekly": return minor * 52;
    case "annual": return minor;
    default: return minor;
  }
}
function trendOf(history: any[]): string {
  if (!Array.isArray(history) || history.length < 2) return "flat";
  const vals = history.map((h: any) => Number(h?.amount_minor ?? h?.amount ?? 0)).filter((n) => n > 0);
  if (vals.length < 2) return "flat";
  const first = vals[0], last = vals[vals.length - 1];
  if (last > first * 1.05) return "increasing";
  if (last < first * 0.95) return "decreasing";
  return "flat";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: subs } = await sb.from("finance_subscriptions").select("*");
    const rows = (subs ?? []) as Sub[];
    const now = Date.now();

    // duplicate detection: same supplier + product, active
    const seen = new Map<string, Sub>();
    for (const s of rows) {
      if (!s.is_active) continue;
      const key = `${s.supplier_slug}::${s.product_name.toLowerCase()}`;
      const first = seen.get(key);
      if (!first) { seen.set(key, s); continue; }
      // mark this as duplicate of the earlier one (if not already flagged)
      if (!s.duplicate_of) {
        await sb.from("finance_subscriptions").update({
          duplicate_of: first.id,
          reasoning: [{ at: new Date().toISOString(), rule: "duplicate_supplier_product", of: first.id }],
        }).eq("id", s.id);
      }
    }

    let updated = 0;
    for (const s of rows) {
      const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).getTime() : null;
      const daysSinceSeen = lastSeen ? Math.round((now - lastSeen) / 86400000) : null;
      const cycleDetected = s.cadence; // v1 — trust cadence, could learn from evidence later
      const priceTrend = trendOf(s.price_history);
      const forecastAnnual = annualize(s.cadence, s.amount_minor);

      let renewalRisk = "low";
      const reasoning: any[] = [];
      if (daysSinceSeen != null && s.cadence === "monthly" && daysSinceSeen > 45) {
        renewalRisk = "high"; reasoning.push({ rule: "monthly_stale", days: daysSinceSeen });
      } else if (daysSinceSeen != null && s.cadence === "annual" && daysSinceSeen > 380) {
        renewalRisk = "high"; reasoning.push({ rule: "annual_stale", days: daysSinceSeen });
      } else if (daysSinceSeen != null && daysSinceSeen > 120) {
        renewalRisk = "medium"; reasoning.push({ rule: "stale", days: daysSinceSeen });
      }
      if (priceTrend === "increasing") reasoning.push({ rule: "price_increasing" });
      if (s.duplicate_of) reasoning.push({ rule: "duplicate_of", id: s.duplicate_of });

      const confidence = Math.min(100, 40 + (s.price_history?.length ?? 0) * 10 + (lastSeen ? 20 : 0));

      await sb.from("finance_subscriptions").update({
        cycle_detected: cycleDetected,
        price_trend: priceTrend,
        forecast_annual_minor: forecastAnnual,
        renewal_risk: renewalRisk,
        confidence_score: confidence,
        reasoning,
        intel_last_computed_at: new Date().toISOString(),
        unused_since: daysSinceSeen != null && daysSinceSeen > 180 ? new Date(now - daysSinceSeen * 86400000).toISOString().slice(0, 10) : s['unused_since' as keyof Sub] as any ?? null,
      }).eq("id", s.id);
      updated++;
    }

    return new Response(JSON.stringify({ ok: true, updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});