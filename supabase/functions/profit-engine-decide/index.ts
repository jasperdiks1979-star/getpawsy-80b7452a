// Profit Engine — automated decision pass.
// Joins pinterest_pin_performance with ad_spend_entries + per-SKU margin,
// applies kill / pause / scale / watch rules, writes profit_engine_decisions,
// and (optionally) annotates pinterest_pin_queue with profit_state.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Verdict = "kill" | "pause" | "scale" | "watch";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const traceId = crypto.randomUUID();

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const apply: boolean = body?.apply !== false; // default true

    const { data: settings } = await sb
      .from("profit_engine_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();

    if (!settings) {
      return json({ ok: false, traceId, message: "No profit_engine_settings row" }, 500);
    }

    const { data: pins } = await sb
      .from("pinterest_pin_performance")
      .select("pin_id,product_id,impressions,clicks,ctr,hook_angle,pin_title")
      .order("impressions", { ascending: false })
      .limit(500);

    const productIds = Array.from(new Set((pins ?? []).map((p) => p.product_id).filter(Boolean)));
    const { data: products } = productIds.length
      ? await sb.from("products").select("id,price,cost_price").in("id", productIds)
      : { data: [] as any[] };

    const productMap = new Map<string, { price: number; cost: number | null }>();
    (products ?? []).forEach((p: any) =>
      productMap.set(p.id, { price: Number(p.price), cost: p.cost_price != null ? Number(p.cost_price) : null }),
    );

    const pinIds = (pins ?? []).map((p) => p.pin_id);
    const { data: spend } = pinIds.length
      ? await sb
          .from("ad_spend_entries")
          .select("pin_id,spend,clicks,add_to_cart,purchases,revenue")
          .in("pin_id", pinIds)
      : { data: [] as any[] };

    const spendMap = new Map<string, { spend: number; clicks: number; atc: number; purchases: number; revenue: number }>();
    (spend ?? []).forEach((s: any) => {
      if (!s.pin_id) return;
      const cur = spendMap.get(s.pin_id) ?? { spend: 0, clicks: 0, atc: 0, purchases: 0, revenue: 0 };
      cur.spend += Number(s.spend);
      cur.clicks += Number(s.clicks);
      cur.atc += Number(s.add_to_cart);
      cur.purchases += Number(s.purchases);
      cur.revenue += Number(s.revenue);
      spendMap.set(s.pin_id, cur);
    });

    const decisions: any[] = [];
    const counts: Record<Verdict, number> = { kill: 0, pause: 0, scale: 0, watch: 0 };

    for (const p of pins ?? []) {
      const prod = productMap.get(p.product_id);
      const price = prod?.price ?? 0;
      const cost = prod?.cost ?? null;
      const marginUsd =
        price > 0 && cost != null
          ? price - cost
          : price * (Number(settings.blended_margin_pct) / 100);
      const beCpa = marginUsd > 0 ? marginUsd / Number(settings.target_roas) : null;
      const sp = spendMap.get(p.pin_id);
      const cr = sp && sp.clicks > 0 ? sp.purchases / sp.clicks : 0.015;
      const beCpc = beCpa != null ? beCpa * cr : null;
      const cpc = sp && sp.clicks > 0 ? sp.spend / sp.clicks : null;
      const hasAtc = (sp?.atc ?? 0) > 0 || (sp?.purchases ?? 0) > 0;
      const ctrPct = Number(p.ctr) * 100;

      let verdict: Verdict = "watch";
      let reason = "Within thresholds";
      let budgetDelta = 0;

      if (p.impressions >= settings.min_impressions_kill && p.clicks === 0) {
        verdict = "kill";
        reason = `No clicks after ${p.impressions} impressions`;
        budgetDelta = -100;
      } else if (p.impressions >= settings.min_impressions_kill && ctrPct < Number(settings.ctr_kill_pct)) {
        verdict = "kill";
        reason = `CTR ${ctrPct.toFixed(2)}% < ${settings.ctr_kill_pct}% kill threshold`;
        budgetDelta = -100;
      } else if (cpc != null && beCpc != null && cpc > beCpc) {
        verdict = "pause";
        reason = `CPC $${cpc.toFixed(2)} > break-even $${beCpc.toFixed(2)}`;
        budgetDelta = -100;
      } else if (ctrPct > Number(settings.ctr_scale_pct) && hasAtc) {
        verdict = "scale";
        reason = `CTR ${ctrPct.toFixed(2)}% > ${settings.ctr_scale_pct}% with purchase signal`;
        budgetDelta = Number(settings.scale_budget_pct);
      }

      counts[verdict]++;

      decisions.push({
        pin_id: p.pin_id,
        product_id: String(p.product_id ?? ""),
        verdict,
        reason,
        ctr: Number(p.ctr),
        impressions: p.impressions,
        clicks: p.clicks,
        cpc: cpc != null ? Number(cpc.toFixed(4)) : null,
        break_even_cpc: beCpc != null ? Number(beCpc.toFixed(4)) : null,
        margin_usd: Number(marginUsd.toFixed(2)),
        recommended_budget_delta_pct: budgetDelta,
        applied: apply && verdict !== "watch",
      });
    }

    if (decisions.length > 0) {
      const { error: insErr } = await sb.from("profit_engine_decisions").insert(decisions);
      if (insErr) console.error("[profit-engine-decide] insert decisions:", insErr);
    }

    if (apply) {
      // annotate queue rows so future workers can skip killed and prefer scaled
      for (const d of decisions) {
        if (d.verdict === "watch") continue;
        await sb
          .from("pinterest_pin_queue")
          .update({ profit_state: d.verdict })
          .eq("pin_external_id", d.pin_id);
      }
    }

    return json({
      ok: true,
      traceId,
      message: `Decided ${decisions.length} pins`,
      counts,
      applied: apply,
    });
  } catch (e) {
    console.error("[profit-engine-decide] error:", e);
    return json({ ok: false, traceId, message: String((e as Error).message ?? e) }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});