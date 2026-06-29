// CIE ↔ TikTok Adapter
// Aggregates `tiktok_server_events` (Events API) by event_name for the window,
// cross-references TikTok-tagged sessions in `visitor_activity`, and writes
// evidence + confidence scores into the Conversion Integrity Engine.
// Metrics written:
//   tiktok_view_content, tiktok_add_to_cart, tiktok_initiate_checkout,
//   tiktok_purchase, tiktok_session_match, tiktok (mean), plus tiktok_delivery
//   for server-side delivery success rate.
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
  if (count < minVolume) return Math.round(40 + count * 4);
  return Math.min(100, Math.round(60 + Math.log10(count) * 12));
}

function divergenceConfidence(reported: number, internal: number): { confidence: number; rationale: string } {
  if (reported <= 0 && internal <= 0) return { confidence: 0, rationale: "no TikTok page-view events and no internal tiktok sessions" };
  if (reported <= 0) return { confidence: 30, rationale: `TikTok server-side 0 page-view events but ${internal} internal tiktok sessions seen` };
  if (internal <= 0) return { confidence: 30, rationale: `TikTok server-side ${reported} page-view events but 0 internal tiktok sessions tagged` };
  const ratio = internal / reported;
  const dev = Math.abs(1 - ratio);
  return { confidence: Math.max(0, Math.round(100 - dev * 100)), rationale: `internal/tiktok session ratio ${ratio.toFixed(2)} (deviation ${(dev * 100).toFixed(1)}%)` };
}

// Normalize TikTok Events API names to canonical lower-case keys we score.
function normalizeEventName(name: string): string {
  const n = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (n === "viewcontent" || n === "pageview" || n === "view") return "view_content";
  if (n === "addtocart" || n === "addcart") return "add_to_cart";
  if (n === "initiatecheckout" || n === "begincheckout" || n === "checkout") return "initiate_checkout";
  if (n === "completepayment" || n === "purchase" || n === "place_order" || n === "placeorder") return "purchase";
  return n || "other";
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
    const nowIso = new Date().toISOString();

    // 1. Pull TikTok server-side events for the window
    const { data: rows, error } = await c
      .from("tiktok_server_events")
      .select("event_name, status, created_at")
      .gte("created_at", sinceIso)
      .limit(50000);
    if (error) throw new Error(`tiktok_server_events: ${error.message}`);

    const counts: Record<string, { ok: number; failed: number }> = {
      view_content: { ok: 0, failed: 0 },
      add_to_cart: { ok: 0, failed: 0 },
      initiate_checkout: { ok: 0, failed: 0 },
      purchase: { ok: 0, failed: 0 },
    };
    let total = 0, ok = 0;
    for (const r of rows ?? []) {
      total++;
      const okFlag = String((r as any).status ?? "").toLowerCase() === "success";
      if (okFlag) ok++;
      const key = normalizeEventName(String((r as any).event_name ?? ""));
      if (!counts[key]) counts[key] = { ok: 0, failed: 0 };
      if (okFlag) counts[key].ok++; else counts[key].failed++;
    }
    const deliveryRate = total > 0 ? ok / total : 0;

    // 2. Internal TikTok-tagged sessions
    const { count: internalSessions } = await c
      .from("visitor_activity")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso)
      .ilike("utm_source", "tiktok%");
    const internal = Number(internalSessions ?? 0);

    // 3. Evidence trail
    const rollup: any[] = [];
    for (const [evName, v] of Object.entries(counts)) {
      rollup.push({
        event_name: evName, source: "tiktok", emitted_by: "cie-tiktok-adapter", consistency: "rollup",
        confidence: volumeConfidence(v.ok),
        payload: { ok: v.ok, failed: v.failed, days, traceId },
        emitted_at: nowIso,
      });
    }
    rollup.push({
      event_name: "delivery", source: "tiktok", emitted_by: "cie-tiktok-adapter", consistency: "ratio",
      confidence: Math.round(deliveryRate * 100),
      payload: { total, ok, rate: deliveryRate, days, traceId },
      emitted_at: nowIso,
    });
    if (rollup.length) await c.from("cie_events").insert(rollup);

    // 4. Confidence scores
    const { data: s } = await c.from("cie_settings").select("ai_training_min_confidence").limit(1).maybeSingle();
    const min = Number((s as any)?.ai_training_min_confidence ?? 90);
    const sessionMatch = divergenceConfidence(counts.view_content.ok, internal);
    const scores: Array<{ metric: string; confidence: number; rationale: string }> = [
      { metric: "tiktok_view_content",      confidence: volumeConfidence(counts.view_content.ok),      rationale: `TikTok server ${counts.view_content.ok} view_content (${days}d)` },
      { metric: "tiktok_add_to_cart",       confidence: volumeConfidence(counts.add_to_cart.ok),       rationale: `TikTok server ${counts.add_to_cart.ok} add_to_cart (${days}d)` },
      { metric: "tiktok_initiate_checkout", confidence: volumeConfidence(counts.initiate_checkout.ok), rationale: `TikTok server ${counts.initiate_checkout.ok} initiate_checkout (${days}d)` },
      { metric: "tiktok_purchase",          confidence: volumeConfidence(counts.purchase.ok),          rationale: `TikTok server ${counts.purchase.ok} purchase (${days}d)` },
      { metric: "tiktok_session_match",     confidence: sessionMatch.confidence,                       rationale: sessionMatch.rationale },
      { metric: "tiktok_delivery",          confidence: Math.round(deliveryRate * 100),                rationale: `server-side delivery success ${ok}/${total} (${(deliveryRate * 100).toFixed(1)}%)` },
    ];
    const avg = Math.round(scores.reduce((s2, r) => s2 + r.confidence, 0) / Math.max(1, scores.length));
    scores.push({ metric: "tiktok", confidence: avg, rationale: `mean of TikTok metrics (${days}d)` });

    for (const row of scores) {
      await c.from("cie_confidence_scores").upsert({
        metric: row.metric, scope: "global",
        confidence: row.confidence, gating_ok: row.confidence >= min,
        rationale: row.rationale, evaluated_at: nowIso,
      }, { onConflict: "metric,scope" });
    }

    return new Response(JSON.stringify({
      ok: true, traceId, days, counts, total, delivery_ok: ok, delivery_rate: deliveryRate,
      internal_tiktok_sessions: internal, scores,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});