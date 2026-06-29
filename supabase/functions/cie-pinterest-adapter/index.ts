// CIE ↔ Pinterest Adapter
// Pulls Pinterest's reported pin_clicks / saves / outbound_clicks from
// `pinterest_analytics_daily`, cross-references the site's actual Pinterest
// sessions via `visitor_activity`, and writes evidence + confidence scores
// to the Conversion Integrity Engine. Metrics written:
//   pinterest_pin_click, pinterest_pin_save, pinterest_outbound_click,
//   pinterest_session_match, pinterest (mean).
// Auth: admin JWT or x-internal-secret (cron / orchestrator bypass).

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

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function authorize(req: Request): Promise<{ ok: boolean; status?: number; message?: string }> {
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

function volumeConfidence(count: number, minVolume = 5): number {
  if (count <= 0) return 0;
  if (count < minVolume) return Math.round(40 + count * 4); // 44..60
  return Math.min(100, Math.round(60 + Math.log10(count) * 12));
}

function divergenceConfidence(a: number, b: number): { confidence: number; rationale: string } {
  if (a <= 0 && b <= 0) return { confidence: 0, rationale: "no Pinterest outbound clicks and no internal pinterest sessions" };
  if (a <= 0) return { confidence: 30, rationale: `Pinterest reported 0 outbound clicks but ${b} internal pinterest sessions seen` };
  if (b <= 0) return { confidence: 30, rationale: `Pinterest reported ${a} outbound clicks but 0 internal pinterest sessions tagged` };
  const ratio = b / a; // internal / pinterest_reported
  const dev = Math.abs(1 - ratio);
  const conf = Math.max(0, Math.round(100 - dev * 100));
  return { confidence: conf, rationale: `internal/pinterest session ratio ${ratio.toFixed(2)} (deviation ${(dev * 100).toFixed(1)}%)` };
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
    const sinceDay = sinceIso.slice(0, 10);
    const nowIso = new Date().toISOString();

    // 1. Pinterest's own reported metrics
    const { data: pa, error: paErr } = await c
      .from("pinterest_analytics_daily")
      .select("pin_clicks, saves, outbound_clicks, impressions, video_views, day")
      .gte("day", sinceDay);
    if (paErr) throw new Error(`pinterest_analytics_daily: ${paErr.message}`);

    const sums = { pin_clicks: 0, saves: 0, outbound_clicks: 0, impressions: 0, video_views: 0 };
    for (const r of pa ?? []) {
      sums.pin_clicks += Number((r as any).pin_clicks ?? 0);
      sums.saves += Number((r as any).saves ?? 0);
      sums.outbound_clicks += Number((r as any).outbound_clicks ?? 0);
      sums.impressions += Number((r as any).impressions ?? 0);
      sums.video_views += Number((r as any).video_views ?? 0);
    }

    // 2. Internal Pinterest-tagged sessions (visitor_activity utm_source ilike 'pinterest%')
    const { count: internalSessions } = await c
      .from("visitor_activity")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso)
      .ilike("utm_source", "pinterest%");
    const internal = Number(internalSessions ?? 0);

    // 3. Funnel events as a second-source pin_click signal (if app pushes them)
    const { count: funnelClickCount } = await c
      .from("pinterest_funnel_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", sinceIso)
      .eq("event_name", "pin_click");
    const funnelClicks = Number(funnelClickCount ?? 0);

    // 4. Rollup events into cie_events for the evidence trail
    const rollup = [
      { event_name: "pin_click",        source: "pinterest", emitted_by: "cie-pinterest-adapter", consistency: "rollup",
        confidence: volumeConfidence(sums.pin_clicks),       payload: { count: sums.pin_clicks, days, traceId }, emitted_at: nowIso },
      { event_name: "pin_save",         source: "pinterest", emitted_by: "cie-pinterest-adapter", consistency: "rollup",
        confidence: volumeConfidence(sums.saves),            payload: { count: sums.saves, days, traceId }, emitted_at: nowIso },
      { event_name: "outbound_click",   source: "pinterest", emitted_by: "cie-pinterest-adapter", consistency: "rollup",
        confidence: divergenceConfidence(sums.outbound_clicks, internal).confidence,
        payload: { reported: sums.outbound_clicks, internal_sessions: internal, days, traceId }, emitted_at: nowIso },
      { event_name: "session_match",    source: "pinterest", emitted_by: "cie-pinterest-adapter", consistency: "ratio",
        confidence: divergenceConfidence(sums.outbound_clicks, internal).confidence,
        payload: { reported: sums.outbound_clicks, internal_sessions: internal, funnel_pin_clicks: funnelClicks, days, traceId }, emitted_at: nowIso },
    ];
    await c.from("cie_events").insert(rollup);

    // 5. Confidence scores
    const { data: s } = await c.from("cie_settings").select("ai_training_min_confidence").limit(1).maybeSingle();
    const min = Number((s as any)?.ai_training_min_confidence ?? 90);
    const scores: Array<{ metric: string; confidence: number; rationale: string }> = [
      { metric: "pinterest_pin_click",       confidence: volumeConfidence(sums.pin_clicks), rationale: `Pinterest reported ${sums.pin_clicks} pin_clicks (${days}d)` },
      { metric: "pinterest_pin_save",        confidence: volumeConfidence(sums.saves), rationale: `Pinterest reported ${sums.saves} saves (${days}d)` },
      { metric: "pinterest_outbound_click",  ...divergenceConfidence(sums.outbound_clicks, internal) },
      { metric: "pinterest_session_match",   ...divergenceConfidence(sums.outbound_clicks, internal) },
    ];
    const avg = Math.round(scores.reduce((s2, r) => s2 + r.confidence, 0) / Math.max(1, scores.length));
    scores.push({ metric: "pinterest", confidence: avg, rationale: `mean of pin_click/pin_save/outbound/session_match (${days}d)` });

    for (const row of scores) {
      await c.from("cie_confidence_scores").upsert({
        metric: row.metric, scope: "global",
        confidence: row.confidence, gating_ok: row.confidence >= min,
        rationale: row.rationale, evaluated_at: nowIso,
      }, { onConflict: "metric,scope" });
    }

    return new Response(JSON.stringify({
      ok: true, traceId, days,
      pinterest_reported: sums,
      internal_pinterest_sessions: internal,
      funnel_pin_clicks: funnelClicks,
      scores,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});