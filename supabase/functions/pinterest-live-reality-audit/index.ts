// pinterest-live-reality-audit — reconciles canonical published pins
// (pinterest_pin_performance.status='published') against LIVE Pinterest
// reality via GET /v5/pins/{id} + /v5/pins/{id}/analytics.
//
// Read-only against Pinterest. Writes raw responses into
// public.pinterest_live_reality_audit for offline reconciliation.
//
// Admin-only. Uses the workspace's active pinterest_connection token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Classification =
  | "live"
  | "deleted"
  | "cached_only"
  | "inaccessible"
  | "rate_limited"
  | "error";

async function fetchPin(token: string, pinId: string) {
  try {
    const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let body: any = null;
    let text = "";
    if (r.status === 200) {
      body = await r.json().catch(() => null);
    } else {
      text = await r.text().catch(() => "");
    }
    let classification: Classification;
    if (r.status === 200) {
      if (!body?.id || !body?.board_id) classification = "cached_only";
      else classification = "live";
    } else if (r.status === 404 || r.status === 410) classification = "deleted";
    else if (r.status === 401 || r.status === 403) classification = "inaccessible";
    else if (r.status === 429) classification = "rate_limited";
    else classification = "error";
    return { http: r.status, classification, body, err: text.slice(0, 300) };
  } catch (e) {
    return { http: 0, classification: "error" as Classification, body: null, err: (e as Error).message };
  }
}

async function fetchAnalytics(token: string, pinId: string, start: string, end: string) {
  try {
    const url = new URL(`${PINTEREST_API}/pins/${pinId}/analytics`);
    url.searchParams.set("start_date", start);
    url.searchParams.set("end_date", end);
    url.searchParams.set("metric_types", "IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE");
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) {
      const t = await r.text().catch(() => "");
      return { http: r.status, body: null as any, err: t.slice(0, 200) };
    }
    const body = await r.json().catch(() => null);
    return { http: 200, body, err: "" };
  } catch (e) {
    return { http: 0, body: null, err: (e as Error).message };
  }
}

function sumMetric(analytics: any, key: string): number {
  // Pinterest analytics returns { "all": { lifetime_metrics: {...}, daily_metrics: [{ date, data_status, metrics: {IMPRESSION: n, ...}}] } }
  const all = analytics?.all;
  if (!all) return 0;
  if (all.lifetime_metrics && typeof all.lifetime_metrics[key] === "number") {
    return all.lifetime_metrics[key];
  }
  if (Array.isArray(all.daily_metrics)) {
    let s = 0;
    for (const d of all.daily_metrics) {
      const v = d?.metrics?.[key];
      if (typeof v === "number") s += v;
    }
    return s;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Admin gate
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb
    .from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const includeAnalytics = body?.analytics !== false;
  const limit = Math.min(Math.max(Number(body?.limit) || 250, 1), 300);
  const concurrency = Math.min(Math.max(Number(body?.concurrency) || 3, 1), 6);

  // Resolve token
  const { data: settings } = await sb
    .from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let cq = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) cq = cq.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await cq.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "pinterest not connected" }, 412);
  const token = conn.access_token as string;

  // Canonical published cohort
  const { data: canon, error: cErr } = await sb
    .from("pinterest_pin_performance")
    .select("pin_id, product_id, product_url, pin_title, pin_description")
    .eq("status", "published")
    .not("pin_id", "is", null)
    .limit(limit);
  if (cErr) return json({ ok: false, message: cErr.message }, 500);
  const pins = (canon ?? []).filter((p) => p.pin_id);

  const runId = crypto.randomUUID();
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const rows: any[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < pins.length) {
      const idx = cursor++;
      const p = pins[idx];
      const pinId = String(p.pin_id);
      const pinRes = await fetchPin(token, pinId);
      let analyticsRes: any = null;
      if (includeAnalytics && pinRes.classification === "live") {
        analyticsRes = await fetchAnalytics(token, pinId, start, end);
      }
      const impressions = analyticsRes?.body ? sumMetric(analyticsRes.body, "IMPRESSION") : null;
      const pin_clicks = analyticsRes?.body ? sumMetric(analyticsRes.body, "PIN_CLICK") : null;
      const outbound = analyticsRes?.body ? sumMetric(analyticsRes.body, "OUTBOUND_CLICK") : null;
      const saves = analyticsRes?.body ? sumMetric(analyticsRes.body, "SAVE") : null;

      rows.push({
        run_id: runId,
        pin_id: pinId,
        http_status: pinRes.http,
        classification: pinRes.classification,
        live_title: pinRes.body?.title ?? null,
        live_description: pinRes.body?.description ?? null,
        live_link: pinRes.body?.link ?? null,
        live_board_id: pinRes.body?.board_id ?? null,
        live_created_at: pinRes.body?.created_at ?? null,
        impressions_30d: impressions,
        pin_clicks_30d: pin_clicks,
        outbound_clicks_30d: outbound,
        saves_30d: saves,
        analytics_http_status: analyticsRes?.http ?? null,
        raw_response: pinRes.body ?? null,
        raw_analytics: analyticsRes?.body ?? null,
        error: pinRes.err || analyticsRes?.err || null,
      });
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Batch insert
  if (rows.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: ie } = await sb.from("pinterest_live_reality_audit").insert(rows.slice(i, i + CHUNK));
      if (ie) console.error("insert error", ie);
    }
  }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.classification] = (counts[r.classification] || 0) + 1;

  return json({
    ok: true,
    run_id: runId,
    canonical_published: pins.length,
    fetched: rows.length,
    counts,
    sample: rows.slice(0, 3).map((r) => ({
      pin_id: r.pin_id,
      classification: r.classification,
      http: r.http_status,
      live_title: r.live_title,
      impressions_30d: r.impressions_30d,
    })),
  });
});