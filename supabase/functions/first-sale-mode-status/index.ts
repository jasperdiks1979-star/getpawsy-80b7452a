// Public read-only report for the First Sale Mode adaptive layer.
// Returns: counters, active flag, reasons, current vs temporary thresholds,
// and the diversity overrides. No writes; safe to call from the admin UI.
import { corsHeaders } from "../_shared/cors.ts";
import { getFirstSaleStatus, FIRST_SALE_TRIGGERS } from "../_shared/first-sale-mode.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const status = await getFirstSaleStatus();
    const ORIGINAL = {
      composite_floor: 92, ctr_floor: 95, novelty_floor: 96,
      visibility_floor: 95, publish_gate_threshold: 95,
    };
    const body = {
      ok: true,
      first_sale_mode: status.active,
      reasons: status.reasons,
      counters: status.counters,
      triggers: FIRST_SALE_TRIGGERS,
      thresholds: {
        original_ppe: ORIGINAL,
        current_ppe: status.ppe,
      },
      diversity: {
        original: { per_axis_cap: 0.65, overall_cap: 0.5 },
        current: {
          per_axis_default: status.diversity.per_axis_default,
          per_axis_saturated_cap: status.diversity.per_axis_saturated_cap,
          saturation_threshold: status.diversity.saturation_threshold,
          overall_cap: 0.5,
        },
      },
      auto_rollback_when_any: {
        purchases_gte: FIRST_SALE_TRIGGERS.purchases,
        impressions_gte: FIRST_SALE_TRIGGERS.impressions,
        outbound_clicks_gte: FIRST_SALE_TRIGGERS.outbound_clicks,
      },
      safety_floors_unchanged: [
        "product_visibility", "landing_page_match",
        "brand_safety", "pinterest_safety",
        "image_quality", "duplicate_image_block",
      ],
    };
    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});