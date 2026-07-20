// Pinterest Trend Intelligence (Phase 8)
// Maintains seasonal + US-ecommerce trend signals per niche/pin_mode and exposes
// a `bias` payload that the creative director merges into its planner.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Curated US-pet-ecommerce trend baseline. The auto-evolver / admin can layer
// dynamic rows on top via pinterest_trend_signals.
const SEASONAL: Array<{
  months: number[];
  niche_key: string | null;
  pin_mode?: string;
  aesthetic_tone?: string;
  trend_label: string;
  weight: number;
  rationale: string;
}> = [
  { months: [11, 12, 1], niche_key: null, aesthetic_tone: "cozy_warm",
    trend_label: "winter_cozy_home", weight: 1.4,
    rationale: "US holiday + winter nesting drives cozy lifestyle saves." },
  { months: [11, 12], niche_key: null, pin_mode: "moodboard_collage",
    trend_label: "holiday_gift_guide", weight: 1.5,
    rationale: "Pinterest gift-guide intent peaks Nov–Dec." },
  { months: [3, 4, 5], niche_key: null, aesthetic_tone: "fresh_natural",
    trend_label: "spring_refresh", weight: 1.2,
    rationale: "Spring cleaning + new pet routines surge." },
  { months: [6, 7, 8], niche_key: "outdoor", pin_mode: "cozy_lifestyle",
    trend_label: "summer_adventure", weight: 1.3,
    rationale: "Summer outdoor pet activity peak." },
  { months: [9, 10], niche_key: null, aesthetic_tone: "earthy_minimal",
    trend_label: "fall_calm_routines", weight: 1.15,
    rationale: "Fall back-to-routine searches spike." },
  { months: Array.from({ length: 12 }, (_, i) => i + 1),
    niche_key: "cat_trees", pin_mode: "luxury_minimal",
    trend_label: "modern_cat_furniture", weight: 1.25,
    rationale: "Evergreen US demand for design-forward cat furniture." },
];

function currentSeasonal(now = new Date()) {
  const m = now.getUTCMonth() + 1;
  return SEASONAL.filter((s) => s.months.includes(m));
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = crypto.randomUUID();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "bias";
  const niche = url.searchParams.get("niche") ?? "";

  try {
    if (action === "refresh") {
      // Idempotent upsert of the seasonal baseline so the table reflects today.
      const seasonal = currentSeasonal();
      let upserts = 0;
      for (const s of seasonal) {
        const { data: existing } = await supabase
          .from("pinterest_trend_signals")
          .select("id")
          .eq("trend_label", s.trend_label)
          .eq("source", "seasonal_baseline")
          .maybeSingle();
        if (existing?.id) {
          await supabase.from("pinterest_trend_signals").update({
            niche_key: s.niche_key ?? "global",
            pin_mode: s.pin_mode ?? null,
            aesthetic_tone: s.aesthetic_tone ?? null,
            weight: s.weight,
            rationale: s.rationale,
            is_active: true,
            expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("pinterest_trend_signals").insert({
            niche_key: s.niche_key ?? "global",
            pin_mode: s.pin_mode ?? null,
            aesthetic_tone: s.aesthetic_tone ?? null,
            trend_label: s.trend_label,
            source: "seasonal_baseline",
            weight: s.weight,
            rationale: s.rationale,
          });
          upserts++;
        }
      }
      // Decay any expired manual signals.
      await supabase.from("pinterest_trend_signals")
        .update({ is_active: false })
        .lt("expires_at", new Date().toISOString())
        .eq("is_active", true);
      return ok({ ok: true, traceId: trace, upserts, considered: seasonal.length });
    }

    if (action === "bias") {
      const { data, error } = await supabase
        .from("pinterest_trend_signals")
        .select("niche_key, pin_mode, aesthetic_tone, trend_label, weight, rationale")
        .eq("is_active", true)
        .or(`niche_key.eq.${niche || "global"},niche_key.eq.global`)
        .order("weight", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = data ?? [];
      const pinModeBoost: Record<string, number> = {};
      const toneBoost: Record<string, number> = {};
      for (const r of rows) {
        if (r.pin_mode) pinModeBoost[r.pin_mode] = Math.max(pinModeBoost[r.pin_mode] ?? 0, Number(r.weight));
        if (r.aesthetic_tone) toneBoost[r.aesthetic_tone] = Math.max(toneBoost[r.aesthetic_tone] ?? 0, Number(r.weight));
      }
      return ok({
        ok: true, traceId: trace, niche: niche || "global",
        signals: rows, pinModeBoost, toneBoost,
      });
    }

    return ok({ ok: false, traceId: trace, message: "unknown action" }, 400);
  } catch (e) {
    return ok({ ok: false, traceId: trace, message: (e as Error).message }, 500);
  }
});