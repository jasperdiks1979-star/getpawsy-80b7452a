// Genesis Customer Psychology DNA — unified API
// Every engine consults GCP through this single endpoint.
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
    supabase.from("gcp_engine_consultations").insert({
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
          .from("gcp_modules")
          .select("*")
          .order("category");
        if (error) throw error;
        await audit({ count: data?.length ?? 0 });
        return json({ ok: true, modules: data });
      }
      case "getConcepts": {
        const { moduleKey } = payload;
        const q = supabase
          .from("gcp_concepts")
          .select("*")
          .order("weight", { ascending: false });
        if (moduleKey) q.eq("module_key", moduleKey);
        const { data, error } = await q;
        if (error) throw error;
        await audit({ count: data?.length ?? 0, moduleKey });
        return json({ ok: true, concepts: data });
      }
      case "getVisitorProfile": {
        const { visitorId } = payload;
        if (!visitorId) return json({ ok: false, message: "visitorId required" }, 400);
        const { data } = await supabase
          .from("gcp_visitor_profiles")
          .select("*")
          .eq("visitor_id", visitorId)
          .maybeSingle();
        await audit({ found: !!data });
        return json({ ok: true, profile: data });
      }
      case "upsertVisitorProfile": {
        const { visitor_id, ...rest } = payload as any;
        if (!visitor_id) return json({ ok: false, message: "visitor_id required" }, 400);
        const { data, error } = await supabase
          .from("gcp_visitor_profiles")
          .upsert({ visitor_id, ...rest }, { onConflict: "visitor_id" })
          .select()
          .single();
        if (error) throw error;
        await audit({ visitor_id });
        return json({ ok: true, profile: data });
      }
      case "recordSignal": {
        const { error } = await supabase.from("gcp_signals").insert({
          ...payload,
          source: payload.source ?? engine,
        });
        if (error) throw error;
        // best-effort touch profile signal_count
        if (payload.visitor_id) {
          await supabase.rpc("gcp_refresh_module_rollups").catch(() => {});
        }
        return json({ ok: true });
      }
      case "recordPrediction": {
        const { error } = await supabase.from("gcp_predictions").insert({
          ...payload,
          engine_source: engine,
        });
        if (error) throw error;
        return json({ ok: true });
      }
      case "recordLearning": {
        const { delta_weight, delta_confidence, module_key, concept_key } = payload;
        const { error } = await supabase.from("gcp_learnings").insert({
          ...payload,
          engine_source: engine,
        });
        if (error) throw error;
        // Apply EMA-style adjustment when concept identified
        if (module_key && concept_key && (delta_weight || delta_confidence)) {
          const { data: existing } = await supabase
            .from("gcp_concepts")
            .select("id, weight, confidence, evidence_count, positive_evidence")
            .eq("module_key", module_key)
            .eq("key", concept_key)
            .maybeSingle();
          if (existing) {
            const w = Math.max(0, Math.min(1, Number(existing.weight) + Number(delta_weight ?? 0)));
            const c = Math.max(0, Math.min(1, Number(existing.confidence) + Number(delta_confidence ?? 0)));
            await supabase
              .from("gcp_concepts")
              .update({
                weight: w,
                confidence: c,
                evidence_count: (existing.evidence_count ?? 0) + 1,
                positive_evidence:
                  (existing.positive_evidence ?? 0) + (Number(delta_weight ?? 0) > 0 ? 1 : 0),
                last_evidence_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            await supabase.rpc("gcp_refresh_module_rollups");
          }
        }
        return json({ ok: true });
      }
      case "consult": {
        // Return relevant concepts ranked by weight*confidence for the query intent.
        const { intent, moduleKey, limit = 8 } = payload as any;
        const q = supabase.from("gcp_concepts").select("*").eq("is_active", true);
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
        // High-level recommendation: blend emotional_drivers + triggers + content_preferences.
        const { kind, context } = payload as any;
        const moduleMap: Record<string, string> = {
          creative: "buying_triggers",
          cta: "buying_triggers",
          emotion: "emotional_drivers",
          story: "emotional_drivers",
          price: "objections",
          content: "content_preferences",
        };
        const moduleKey = moduleMap[kind] ?? "emotional_drivers";
        const { data } = await supabase
          .from("gcp_concepts")
          .select("key,name,weight,confidence")
          .eq("module_key", moduleKey)
          .order("weight", { ascending: false })
          .limit(5);
        await audit({ kind, moduleKey, context });
        return json({ ok: true, kind, moduleKey, recommendations: data ?? [] });
      }
      default:
        return json({ ok: false, message: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ ok: false, message: (err as Error).message }, 500);
  }
});