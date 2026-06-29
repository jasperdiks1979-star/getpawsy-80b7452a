// CIE ↔ Meta (Facebook/Instagram) Adapter — Wave 1 skeleton.
// When META_ACCESS_TOKEN + META_AD_ACCOUNT_ID are set, pulls Meta-reported
// purchases / clicks for the window and writes confidence + evidence to the
// CIE. Otherwise writes confidence=0 with rationale "meta adapter pending"
// so the supreme-gate keeps any Meta-driven AI training paused.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const CRON = Deno.env.get("CIE_CRON_SECRET") ?? "";
const META_TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
const META_ACCOUNT = Deno.env.get("META_AD_ACCOUNT_ID") ?? "";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function authorize(req: Request) {
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (provided && ((INTERNAL && provided === INTERNAL) || (CRON && provided === CRON))) return { ok: true };
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, message: "missing bearer" };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, message: "invalid jwt" };
  const { data: roles } = await admin().from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) return { ok: false, status: 403, message: "admin only" };
  return { ok: true };
}

function volumeConfidence(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return Math.round(40 + count * 4);
  return Math.min(100, Math.round(60 + Math.log10(count) * 12));
}

async function fetchMetaPurchases(sinceIso: string, untilIso: string) {
  // Meta Insights API: action_type=offsite_conversion.fb_pixel_purchase
  const url = new URL(`https://graph.facebook.com/v19.0/act_${META_ACCOUNT}/insights`);
  url.searchParams.set("fields", "actions,action_values,clicks,impressions");
  url.searchParams.set("time_range", JSON.stringify({ since: sinceIso.slice(0, 10), until: untilIso.slice(0, 10) }));
  url.searchParams.set("access_token", META_TOKEN);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`meta insights ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  let purchases = 0, value_cents = 0, clicks = 0, impressions = 0;
  for (const row of j.data ?? []) {
    clicks += Number(row.clicks ?? 0);
    impressions += Number(row.impressions ?? 0);
    for (const a of row.actions ?? []) {
      if (String(a.action_type).includes("purchase")) purchases += Number(a.value ?? 0);
    }
    for (const a of row.action_values ?? []) {
      if (String(a.action_type).includes("purchase")) value_cents += Math.round(Number(a.value ?? 0) * 100);
    }
  }
  return { purchases, value_cents, clicks, impressions };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const auth = await authorize(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, traceId, message: auth.message }), {
      status: auth.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(30, Number(body.days ?? 1)));
    const c = admin();
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
    const untilIso = new Date().toISOString();

    const { data: s } = await c.from("cie_settings").select("ai_training_min_confidence").limit(1).maybeSingle();
    const min = Number((s as any)?.ai_training_min_confidence ?? 90);

    let scores: Array<{ metric: string; confidence: number; rationale: string }>;
    let evidence: Record<string, unknown> = { days, traceId };

    if (!META_TOKEN || !META_ACCOUNT) {
      const rationale = "meta adapter pending: missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID";
      scores = [
        { metric: "meta_purchase",   confidence: 0, rationale },
        { metric: "meta_click",      confidence: 0, rationale },
        { metric: "meta_impression", confidence: 0, rationale },
        { metric: "meta",            confidence: 0, rationale },
      ];
      evidence = { ...evidence, pending: true };
    } else {
      const sums = await fetchMetaPurchases(sinceIso, untilIso);
      evidence = { ...evidence, ...sums };
      // Reconcile purchases against internal orders (volume only — id-match needs fbclid mapping).
      const { data: orders } = await c
        .from("orders").select("total_cents,status,created_at")
        .gte("created_at", sinceIso);
      const paidOrders = (orders ?? []).filter((o: any) =>
        ["paid", "completed", "fulfilled"].includes(String(o.status ?? "").toLowerCase())
      );
      const orderCount = paidOrders.length;
      const orderCents = paidOrders.reduce((s2, o: any) => s2 + Number(o.total_cents ?? 0), 0);
      const countDelta = orderCount === 0 ? 1 : Math.abs(sums.purchases - orderCount) / Math.max(sums.purchases, orderCount);
      const revDelta   = orderCents === 0 ? 1 : Math.abs(sums.value_cents - orderCents) / Math.max(sums.value_cents, orderCents);
      const purchConf  = Math.round(Math.max(0, 100 - countDelta * 60 - revDelta * 40));
      scores = [
        { metric: "meta_purchase",   confidence: sums.purchases > 0 ? purchConf : 0,
          rationale: `meta=${sums.purchases} ($${(sums.value_cents/100).toFixed(2)}) vs orders=${orderCount} ($${(orderCents/100).toFixed(2)})` },
        { metric: "meta_click",      confidence: volumeConfidence(sums.clicks),      rationale: `meta clicks=${sums.clicks}` },
        { metric: "meta_impression", confidence: volumeConfidence(sums.impressions), rationale: `meta impressions=${sums.impressions}` },
      ];
      const avg = Math.round(scores.reduce((a, r) => a + r.confidence, 0) / scores.length);
      scores.push({ metric: "meta", confidence: avg, rationale: `mean of meta_purchase/click/impression (${days}d)` });
    }

    await c.from("cie_events").insert({
      event_name: "adapter_sync", source: "meta", emitted_by: "cie-meta-adapter",
      consistency: "rollup", confidence: scores.find((s2) => s2.metric === "meta")?.confidence ?? 0,
      payload: evidence, emitted_at: untilIso,
    });
    for (const row of scores) {
      await c.from("cie_confidence_scores").upsert({
        metric: row.metric, scope: "global", confidence: row.confidence,
        gating_ok: row.confidence >= min, rationale: row.rationale,
        evaluated_at: untilIso,
      }, { onConflict: "metric,scope" });
    }

    return new Response(JSON.stringify({ ok: true, traceId, days, evidence, scores }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});