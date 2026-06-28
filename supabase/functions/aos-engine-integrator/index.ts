// AOS Phase 2 — Engine Integrator.
// Pulls signals from existing AI engine tables and republishes them into the AOS
// event bus and shared knowledge graph. Also stamps heartbeats so failover knows
// which engines are live without modifying their code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const SINCE_MS = 30 * 60 * 1000; // 30 minutes

async function heartbeat(engineKey: string) {
  await supabase.from("aos_engine_registry")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("engine_key", engineKey);
}

async function publishEvent(type: string, source: string, payload: any, severity = "info", subject?: string) {
  await supabase.from("aos_events").insert({
    event_type: type, source_engine: source, subject: subject ?? null,
    payload, severity,
  });
}

async function publishKnowledge(topic: string, key: string, publisher: string, kind: string, payload: any, confidence = 0.7) {
  const { data: prev } = await supabase.from("aos_knowledge")
    .select("id, version").eq("topic", topic).eq("key", key)
    .is("superseded_at", null).order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (prev?.version ?? 0) + 1;
  if (prev) await supabase.from("aos_knowledge").update({ superseded_at: new Date().toISOString() }).eq("id", prev.id);
  await supabase.from("aos_knowledge").insert({
    topic, key, version: nextVersion, publisher_engine: publisher, kind, payload, confidence,
    supersedes_id: prev?.id ?? null,
  });
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

async function run() {
  const since = new Date(Date.now() - SINCE_MS).toISOString();
  const summary: any = {};

  // === PCIE-V2 winners ===
  await safe(async () => {
    const { data } = await supabase.from("pcie_v2_creative_performance")
      .select("creative_id, ctr, saves, revenue_cents, updated_at")
      .gte("updated_at", since).order("revenue_cents", { ascending: false }).limit(5);
    summary.pcie_v2 = data?.length ?? 0;
    for (const r of data ?? []) {
      await publishEvent("creative.winner", "pcie_v2",
        { creative_id: r.creative_id, ctr: r.ctr, saves: r.saves, revenue_cents: r.revenue_cents },
        "info", String(r.creative_id));
    }
    if ((data ?? []).length > 0) await heartbeat("pcie_v2");
  });

  // === AGAL trust deltas ===
  await safe(async () => {
    const { data } = await supabase.from("agal_trust_scores")
      .select("engine_key, overall_trust, sample_size, created_at")
      .gte("created_at", since);
    summary.agal = data?.length ?? 0;
    for (const r of data ?? []) {
      await publishKnowledge("trust", r.engine_key, "agal", "trust_score",
        { overall: r.overall_trust, sample: r.sample_size }, Number(r.overall_trust ?? 0.5));
      // Mirror trust into AOS registry so consensus weights stay in sync.
      await supabase.from("aos_engine_registry").update({ trust_score: r.overall_trust }).eq("engine_key", r.engine_key);
    }
    await heartbeat("agal");
  });

  // === ARIE incidents ===
  await safe(async () => {
    const { data } = await supabase.from("arie_incidents")
      .select("id,title,severity,status,opened_at")
      .gte("opened_at", since);
    summary.arie = data?.length ?? 0;
    for (const r of data ?? []) {
      await publishEvent("incident.opened", "arie",
        { title: r.title, severity: r.severity, status: r.status }, r.severity ?? "warn", r.id);
    }
    await heartbeat("arie");
  });

  // === Revenue Intelligence: latest snapshots ===
  await safe(async () => {
    const { data } = await supabase.from("pcie_v2_revenue_snapshots")
      .select("creative_id, revenue_cents, roas, created_at")
      .gte("created_at", since).order("revenue_cents", { ascending: false }).limit(5);
    summary.revenue_intelligence = data?.length ?? 0;
    for (const r of data ?? []) {
      await publishEvent("revenue.snapshot", "revenue_intelligence",
        { creative_id: r.creative_id, revenue_cents: r.revenue_cents, roas: r.roas },
        "info", String(r.creative_id));
    }
    if ((data ?? []).length > 0) await heartbeat("revenue_intelligence");
  });

  // === AGD opportunities ===
  await safe(async () => {
    const { data } = await supabase.from("agd_opportunities")
      .select("id, title, score, created_at")
      .gte("created_at", since).order("score", { ascending: false }).limit(5);
    summary.agd = data?.length ?? 0;
    for (const r of data ?? []) {
      await publishEvent("opportunity.detected", "agd",
        { title: r.title, score: r.score }, "info", r.id);
    }
    if ((data ?? []).length > 0) await heartbeat("agd");
  });

  // === PIE daily meeting / scores ===
  await safe(async () => {
    const { data } = await supabase.from("pie_product_scores")
      .select("product_id, opportunity_score, updated_at")
      .gte("updated_at", since).order("opportunity_score", { ascending: false }).limit(5);
    summary.pie = data?.length ?? 0;
    for (const r of data ?? []) {
      await publishKnowledge("product.opportunity", String(r.product_id), "pie", "score",
        { score: r.opportunity_score }, 0.8);
    }
    if ((data ?? []).length > 0) await heartbeat("pie");
  });

  // === PPE story profiles refresh ===
  await safe(async () => {
    const { count } = await supabase.from("ppe_candidate_scores")
      .select("id", { count: "exact", head: true }).gte("created_at", since);
    summary.ppe = count ?? 0;
    if ((count ?? 0) > 0) await heartbeat("ppe");
  });

  // === MIL leaderboards ===
  await safe(async () => {
    const { count } = await supabase.from("mil_leaderboard_snapshots")
      .select("id", { count: "exact", head: true }).gte("created_at", since);
    summary.mil = count ?? 0;
    if ((count ?? 0) > 0) await heartbeat("mil");
  });

  return { ok: true, summary };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const res = await run();
    return new Response(JSON.stringify(res), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});