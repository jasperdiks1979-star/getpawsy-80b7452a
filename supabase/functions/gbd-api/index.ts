// Genesis Business DNA — single API consulted by every engine.
// Endpoints (POST { action, ...args }):
//   getBusinessIdentity, getCustomerProfile, getPricingStrategy,
//   getBrandGuidelines, getPsychologyProfile, getMarketingStrategy,
//   getProductKnowledge, getCompetitiveLandscape, getBusinessObjectives,
//   searchKnowledge, getModuleStatus, listModules,
//   upsertFact (service-role engines), recordLearning, detectConflicts
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function moduleSnapshot(db: ReturnType<typeof admin>, moduleKey: string) {
  const [{ data: mod }, { data: facts }] = await Promise.all([
    db.from("gbd_modules").select("*").eq("key", moduleKey).maybeSingle(),
    db.from("gbd_facts").select("topic,fact_key,value,confidence,version,updated_at")
      .eq("module_key", moduleKey).eq("is_current", true).order("topic"),
  ]);
  const map: Record<string, Record<string, unknown>> = {};
  for (const f of facts ?? []) {
    map[f.topic] ??= {};
    map[f.topic][f.fact_key] = {
      value: f.value, confidence: Number(f.confidence), version: f.version, updated_at: f.updated_at,
    };
  }
  return { module: mod, facts: map };
}

async function logConsultation(db: ReturnType<typeof admin>, engine: string, api: string, args: unknown, summary: unknown, latency: number) {
  await db.from("gbd_engine_consultations").insert({ engine, api, args: args ?? {}, result_summary: summary ?? {}, latency_ms: latency });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { action, engine = "unknown", ...args } = body ?? {};
    if (!action) return json({ ok: false, error: "missing_action" }, 400);
    const db = admin();

    const modKeyByAction: Record<string, string> = {
      getBusinessIdentity: "identity",
      getCustomerProfile: "customer",
      getPricingStrategy: "pricing",
      getBrandGuidelines: "brand",
      getPsychologyProfile: "psychology",
      getMarketingStrategy: "marketing",
      getProductKnowledge: "product",
      getCompetitiveLandscape: "competitive",
    };

    if (modKeyByAction[action]) {
      const snap = await moduleSnapshot(db, modKeyByAction[action]);
      await logConsultation(db, engine, action, args, { topics: Object.keys(snap.facts).length }, Date.now() - started);
      return json({ ok: true, data: snap });
    }

    if (action === "getBusinessObjectives") {
      const { data } = await db.from("gbd_facts").select("value,confidence,version")
        .eq("module_key", "identity").eq("topic", "objectives").eq("fact_key", "weights").eq("is_current", true).maybeSingle();
      await logConsultation(db, engine, action, args, { ok: !!data }, Date.now() - started);
      return json({ ok: true, data });
    }

    if (action === "searchKnowledge") {
      const q = String(args.query ?? "");
      const limit = Math.min(Number(args.limit ?? 25), 100);
      const { data, error } = await db.rpc("gbd_search_knowledge", { _query: q, _limit: limit });
      if (error) return json({ ok: false, error: error.message }, 500);
      await logConsultation(db, engine, action, { q, limit }, { rows: data?.length ?? 0 }, Date.now() - started);
      return json({ ok: true, data });
    }

    if (action === "listModules") {
      const { data } = await db.from("gbd_modules").select("*").order("category").order("name");
      return json({ ok: true, data });
    }

    if (action === "getModuleStatus") {
      const snap = await moduleSnapshot(db, String(args.module_key ?? ""));
      return json({ ok: true, data: snap });
    }

    if (action === "upsertFact") {
      const { data, error } = await db.rpc("gbd_upsert_fact", {
        _module_key: args.module_key,
        _topic: args.topic,
        _fact_key: args.fact_key,
        _value: args.value,
        _confidence: args.confidence ?? 0.6,
        _source: args.source ?? "engine",
        _source_engine: engine,
        _rationale: args.rationale ?? null,
        _evidence: args.evidence ?? [],
        _change_reason: args.change_reason ?? null,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, fact_id: data });
    }

    if (action === "recordLearning") {
      const { error } = await db.from("gbd_learnings").insert({
        engine,
        module_key: args.module_key ?? null,
        decision_type: args.decision_type ?? "observation",
        subject: args.subject ?? null,
        why: args.why ?? "",
        evidence: args.evidence ?? {},
        confidence: args.confidence ?? 0.5,
        expected_outcome: args.expected_outcome ?? null,
        actual_outcome: args.actual_outcome ?? null,
        learning: args.learning ?? null,
        fact_updates: args.fact_updates ?? [],
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "detectConflicts") {
      // Multiple current facts for same (module,topic,key) — shouldn't exist (UNIQUE on version),
      // but flag low-confidence-with-recent-mutations as soft conflicts.
      const { data } = await db.from("gbd_facts")
        .select("module_key,topic,fact_key,confidence,updated_at")
        .eq("is_current", true).lt("confidence", 0.4).order("updated_at", { ascending: false }).limit(50);
      return json({ ok: true, data });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}