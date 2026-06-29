// Genesis V3.4 — Hourly Decision Loop
// Reads gv34_first_sale_hunter_v + gv34_ai_credit_efficiency_v and enqueues
// one autopilot action per opportunity class. Dedupe is enforced by the unique
// partial index on (kind, product_id, dedupe_hash) WHERE status IN ('queued','executing').
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maps the 10 opportunity classes -> hunter lane used for ranking.
const KIND_TO_LANE: Record<string, keyof Lane> = {
  pinterest_publish:      "lane_pinterest",
  seo_optimize:           "lane_google",
  cro_audit:              "lane_impulse",
  pricing_adjust:         "lane_revenue",
  creative_regenerate:    "lane_pinterest",
  bundle_suggest:         "lane_revenue",
  trust_signal_boost:     "lane_impulse",
  urgency_apply:          "lane_urgency",
  first_sale_focus:       "lane_probability",
  revenue_opportunity:    "lane_revenue",
};

type Lane = {
  lane_probability: number;
  lane_revenue: number;
  lane_pinterest: number;
  lane_google: number;
  lane_impulse: number;
  lane_urgency: number;
};

function sha1Short(s: string) {
  // tiny stable hash (FNV-1a) — good enough for dedupe key, no crypto required
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check autonomous mode flag
    const { data: flag } = await sb
      .from("gv34_settings")
      .select("value")
      .eq("key", "first_sale_autonomous_mode")
      .maybeSingle();
    const autonomous = !!flag?.value?.enabled;

    // Pull top 50 hunter rows (the rerank already accounts for inventory / fatigue)
    const { data: hunter, error } = await sb
      .from("gv34_first_sale_hunter_v")
      .select("*")
      .order("hunter_score", { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!hunter || hunter.length === 0) {
      return new Response(JSON.stringify({ ok: true, enqueued: 0, reason: "empty_hunter" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Credit efficiency per kind (revenue per credit). Defaults to 1.
    const { data: eff } = await sb.from("gv34_ai_credit_efficiency_v").select("action_kind,revenue_per_credit,success_rate");
    const effByKind = new Map<string, { rpc: number; sr: number }>();
    for (const r of eff ?? []) {
      effByKind.set(r.action_kind, { rpc: Number(r.revenue_per_credit) || 1, sr: Number(r.success_rate) || 0.5 });
    }

    const enqueued: Array<{ kind: string; product_id: string; hash: string }> = [];
    const skipped: Array<{ kind: string; product_id: string; reason: string }> = [];

    for (const kind of Object.keys(KIND_TO_LANE)) {
      const lane = KIND_TO_LANE[kind];
      // pick the best product for this kind by hunter_score * lane weight * credit efficiency
      let best: Record<string, any> | null = null;
      let bestScore = -Infinity;
      for (const row of hunter) {
        const laneVal = Number(row[lane] ?? 0);
        if (laneVal <= 0) continue;
        const ef = effByKind.get(kind);
        const efficiency = ef ? Math.max(0.25, ef.rpc * Math.max(0.25, ef.sr)) : 1;
        const score = Number(row.hunter_score ?? 0) * (0.5 + laneVal / 100) * efficiency;
        if (score > bestScore) { bestScore = score; best = row; }
      }
      if (!best) continue;

      const productId = best.product_id as string;
      const confidence = Number(best.min_confidence ?? 0);
      // hash on kind+product+today so the same action can re-run tomorrow but not twice today
      const today = new Date().toISOString().slice(0, 10);
      const dedupe_hash = sha1Short(`${kind}|${productId}|${today}`);

      const priority = confidence >= 0.85
        ? "critical"
        : confidence >= 0.7
          ? "high"
          : confidence >= 0.5
            ? "medium"
            : "low";

      const ai_cost = ["creative_regenerate", "seo_optimize", "pricing_adjust"].includes(kind) ? 2 : 1;

      const insertRow = {
        kind,
        product_id: productId,
        priority,
        confidence,
        ai_credit_cost: ai_cost,
        expected_revenue_eur: Number(best.expected_revenue_eur ?? 0),
        status: "queued",
        invocation_payload: {
          source: "gv34_decision_loop",
          autonomous_mode: autonomous,
          lane,
          lane_value: Number(best[lane] ?? 0),
          hunter_score: Number(best.hunter_score ?? 0),
          composite_score: Number(best.composite_score ?? 0),
          why: `Top ${lane} candidate; us_stock=${best.us_stock}, fast_ship=${best.is_fast_shipping}, attempts_30d=${best.attempts_30d}`,
        },
        dedupe_hash,
      };

      const { error: insErr } = await sb.from("autopilot_actions").insert(insertRow);
      if (insErr) {
        // unique violation is the expected "already queued today" path
        const msg = insErr.message || "";
        if (msg.includes("autopilot_actions_dedupe_open_uidx") || msg.includes("duplicate key")) {
          skipped.push({ kind, product_id: productId, reason: "already_queued_today" });
        } else {
          skipped.push({ kind, product_id: productId, reason: msg });
        }
        continue;
      }
      enqueued.push({ kind, product_id: productId, hash: dedupe_hash });
    }

    // In autonomous mode, fire the dispatcher so critical/high actions execute now
    if (autonomous && enqueued.length > 0) {
      try {
        await sb.functions.invoke("autopilot-dispatch", {
          body: { source: "gv34_decision_loop", auto: true },
        });
      } catch (_) { /* dispatcher logs its own errors */ }
    }

    return new Response(
      JSON.stringify({ ok: true, autonomous, enqueued, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});