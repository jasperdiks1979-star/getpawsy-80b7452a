// Genesis Pinterest Intelligence DNA — unified API
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Recommendation routing: kind → module
const KIND_MAP: Record<string, string> = {
  publish_time: "distribution_timing",
  board: "board_dimensions",
  keywords: "seo_factors",
  creative: "creative_attributes",
  story: "pin_dna_dimensions",
  typography: "creative_attributes",
  color_palette: "creative_attributes",
  cta: "pin_dna_dimensions",
  algorithm: "algorithm_factors",
  us: "us_optimization",
  trend: "trend_signals",
};

// Compute weighted Pinterest Success Score
function successScore(p: Record<string, number | null | undefined>): number {
  const w = {
    ctr: 0.1,
    outbound_ctr: 0.2,
    save_rate: 0.15,
    cvr: 0.25,
    roas: 0.3,
  };
  const v = {
    ctr: Number(p.ctr ?? 0) * 100,
    outbound_ctr: Number(p.outbound_ctr ?? 0) * 100,
    save_rate: Number(p.save_rate ?? 0) * 100,
    cvr: Number(p.cvr ?? 0) * 100,
    roas: Math.min(Number(p.roas ?? 0) * 10, 30),
  };
  const s =
    v.ctr * w.ctr +
    v.outbound_ctr * w.outbound_ctr +
    v.save_rate * w.save_rate +
    v.cvr * w.cvr +
    v.roas * w.roas;
  return Math.max(0, Math.min(100, s));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const started = Date.now();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Invalid JSON" }, 400);
  }

  const { action, engine = "unknown", payload = {} } = body ?? {};
  if (!action) return json({ ok: false, message: "action required" }, 400);

  const audit = (response_summary: Record<string, unknown>) =>
    supabase.from("gpi_engine_consultations").insert({
      engine_source: engine,
      action,
      query: payload,
      response_summary,
      latency_ms: Date.now() - started,
    });

  try {
    switch (action) {
      case "listModules": {
        const { data, error } = await supabase
          .from("gpi_modules")
          .select("*")
          .order("category");
        if (error) throw error;
        await audit({ count: data?.length ?? 0 });
        return json({ ok: true, modules: data });
      }
      case "getConcepts": {
        const { moduleKey } = payload as any;
        const q = supabase
          .from("gpi_concepts")
          .select("*")
          .order("weight", { ascending: false });
        if (moduleKey) q.eq("module_key", moduleKey);
        const { data, error } = await q;
        if (error) throw error;
        await audit({ count: data?.length ?? 0, moduleKey });
        return json({ ok: true, concepts: data });
      }
      case "upsertPinDna": {
        const { pin_id } = payload as any;
        if (!pin_id) return json({ ok: false, message: "pin_id required" }, 400);
        const { data, error } = await supabase
          .from("gpi_pin_dna")
          .upsert(payload, { onConflict: "pin_id" })
          .select()
          .single();
        if (error) throw error;
        await audit({ pin_id });
        return json({ ok: true, pin: data });
      }
      case "recordPerformance": {
        const { pin_id } = payload as any;
        if (!pin_id) return json({ ok: false, message: "pin_id required" }, 400);
        const score = successScore(payload as any);
        const row = { ...payload, success_score: score };
        const { data, error } = await supabase
          .from("gpi_performance")
          .upsert(row, { onConflict: "pin_id,snapshot_date" })
          .select()
          .single();
        if (error) throw error;
        await audit({ pin_id, success_score: score });
        return json({ ok: true, performance: data, success_score: score });
      }
      case "recordPrediction": {
        const { error } = await supabase.from("gpi_predictions").insert({
          ...payload,
          engine_source: engine,
        });
        if (error) throw error;
        return json({ ok: true });
      }
      case "recordLearning": {
        const { delta_weight, delta_confidence, module_key, concept_key } = payload as any;
        const { error } = await supabase.from("gpi_learnings").insert({
          ...payload,
          engine_source: engine,
        });
        if (error) throw error;
        if (module_key && concept_key && (delta_weight || delta_confidence)) {
          const { data: existing } = await supabase
            .from("gpi_concepts")
            .select("id, weight, confidence, evidence_count, positive_evidence")
            .eq("module_key", module_key)
            .eq("key", concept_key)
            .maybeSingle();
          if (existing) {
            const w = Math.max(0, Math.min(1, Number(existing.weight) + Number(delta_weight ?? 0)));
            const c = Math.max(0, Math.min(1, Number(existing.confidence) + Number(delta_confidence ?? 0)));
            await supabase
              .from("gpi_concepts")
              .update({
                weight: w,
                confidence: c,
                evidence_count: (existing.evidence_count ?? 0) + 1,
                positive_evidence:
                  (existing.positive_evidence ?? 0) + (Number(delta_weight ?? 0) > 0 ? 1 : 0),
                last_evidence_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            await supabase.rpc("gpi_refresh_module_rollups");
          }
        }
        return json({ ok: true });
      }
      case "consult": {
        const { intent, moduleKey, limit = 8 } = payload as any;
        const q = supabase.from("gpi_concepts").select("*").eq("is_active", true);
        if (moduleKey) q.eq("module_key", moduleKey);
        const { data, error } = await q;
        if (error) throw error;
        const ranked = (data ?? [])
          .map((c: any) => ({ ...c, score: Number(c.weight) * Number(c.confidence) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        await audit({ intent, returned: ranked.length });
        return json({ ok: true, intent, recommendations: ranked });
      }
      case "recommend": {
        const { kind, context } = payload as any;
        const moduleKey = KIND_MAP[kind] ?? "algorithm_factors";
        const { data } = await supabase
          .from("gpi_concepts")
          .select("key,name,weight,confidence,metadata")
          .eq("module_key", moduleKey)
          .eq("is_active", true)
          .order("weight", { ascending: false })
          .limit(5);
        await audit({ kind, moduleKey, context });
        return json({ ok: true, kind, moduleKey, recommendations: data ?? [] });
      }
      case "predict": {
        // Simple linear blend over performance_metrics weights.
        const { predictionType, features } = payload as any;
        const { data: weights } = await supabase
          .from("gpi_concepts")
          .select("key,weight,confidence")
          .eq("module_key", "performance_metrics");
        const wmap = new Map<string, { w: number; c: number }>();
        (weights ?? []).forEach((r: any) =>
          wmap.set(r.key, { w: Number(r.weight), c: Number(r.confidence) }),
        );
        let predicted = 0;
        let confSum = 0;
        let confCnt = 0;
        for (const [k, v] of Object.entries(features ?? {})) {
          const w = wmap.get(k);
          if (!w) continue;
          predicted += Number(v ?? 0) * w.w;
          confSum += w.c;
          confCnt += 1;
        }
        const confidence = confCnt > 0 ? confSum / confCnt : 0.3;
        await supabase.from("gpi_predictions").insert({
          subject_type: "pin",
          prediction_type: predictionType,
          predicted_value: predicted,
          confidence,
          features,
          engine_source: engine,
        });
        await audit({ predictionType, predicted, confidence });
        return json({ ok: true, predictionType, predicted, confidence });
      }
      case "topPins": {
        const { limit = 25 } = payload as any;
        const { data } = await supabase
          .from("gpi_performance")
          .select("pin_id, success_score, revenue_usd, saves, outbound_clicks, snapshot_date")
          .order("success_score", { ascending: false, nullsFirst: false })
          .limit(limit);
        await audit({ returned: data?.length ?? 0 });
        return json({ ok: true, topPins: data ?? [] });
      }
      default:
        return json({ ok: false, message: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ ok: false, message: (err as Error).message }, 500);
  }
});