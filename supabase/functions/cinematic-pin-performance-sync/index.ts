// cinematic-pin-performance-sync
//
// Daily cron: aggregates Pinterest performance for cinematic ad jobs and
// auto-quarantines underperforming patterns (hook, thumbnail phash, overlay).
// Reads from `pinterest_video_metrics` joined to `cinematic_ad_jobs` via the
// `pinterest_asset_id` link, upserts into `cinematic_pin_performance`, then
// applies quarantine rules into `cinematic_quarantine_patterns`.
//
// Safe to re-run; quarantine inserts are upserts on (pattern_type, pattern_value).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const trace = () => `pps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MIN_IMPRESSIONS = 500;
const BAD_ENGAGEMENT_RATE = 0.005; // <0.5%
const QUARANTINE_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Pull last 30d of pinterest_video_metrics + join to cinematic jobs
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: metrics, error: mErr } = await admin
    .from("pinterest_video_metrics")
    .select("pin_id, day, impressions, saves, outbound_clicks, engagement_rate")
    .gte("day", cutoff)
    .limit(5000);
  if (mErr) return json(200, { ok: false, traceId, message: mErr.message });

  // 2. Map pins back to cinematic jobs by pin_id (stored on pinterest_video_assets)
  const pinIds = [...new Set((metrics ?? []).map((m: any) => m.pin_id).filter(Boolean))];
  let assetMap = new Map<string, any>();
  if (pinIds.length) {
    const { data: pubs } = await admin
      .from("pinterest_video_publish_log")
      .select("pin_id, asset_id, board_id")
      .in("pin_id", pinIds);
    for (const p of pubs ?? []) assetMap.set(p.pin_id, p);
  }
  const assetIds = [...new Set([...assetMap.values()].map((v) => v.asset_id).filter(Boolean))];
  let jobByAsset = new Map<string, any>();
  if (assetIds.length) {
    const { data: jobs } = await admin
      .from("cinematic_ad_jobs")
      .select("id, pinterest_asset_id, hook_archetype, thumbnail_phash, overlay_text_hash")
      .in("pinterest_asset_id", assetIds);
    for (const j of jobs ?? []) jobByAsset.set(j.pinterest_asset_id, j);
  }

  // 3. Upsert into cinematic_pin_performance
  const perfRows: any[] = [];
  for (const m of metrics ?? []) {
    const link = assetMap.get(m.pin_id);
    const job = link ? jobByAsset.get(link.asset_id) : null;
    const imp = Number(m.impressions ?? 0);
    const eng = imp > 0 ? (Number(m.saves ?? 0) + Number(m.outbound_clicks ?? 0)) / imp : 0;
    perfRows.push({
      pin_id: m.pin_id,
      asset_id: link?.asset_id ?? null,
      job_id: job?.id ?? null,
      hook_archetype: job?.hook_archetype ?? null,
      board_id: link?.board_id ?? null,
      outbound_clicks: Number(m.outbound_clicks ?? 0),
      saves: Number(m.saves ?? 0),
      impressions: imp,
      watch_seconds_p50: null,
      engagement_rate: eng,
      collected_at: new Date(m.day).toISOString(),
    });
  }
  if (perfRows.length) {
    await admin.from("cinematic_pin_performance").upsert(perfRows, { onConflict: "pin_id,collected_at" });
  }

  // 4. Quarantine underperforming patterns
  // Aggregate per hook + per thumbnail phash + per overlay text
  const agg = new Map<string, { type: string; value: string; impressions: number; eng: number }>();
  for (const m of metrics ?? []) {
    const link = assetMap.get(m.pin_id);
    const job = link ? jobByAsset.get(link.asset_id) : null;
    if (!job) continue;
    const eng = Number(m.saves ?? 0) + Number(m.outbound_clicks ?? 0);
    const imp = Number(m.impressions ?? 0);
    const keys: Array<[string, string]> = [];
    if (job.hook_archetype) keys.push(["hook", job.hook_archetype]);
    if (job.thumbnail_phash) keys.push(["thumbnail_phash", job.thumbnail_phash]);
    if (job.overlay_text_hash) keys.push(["overlay_text", job.overlay_text_hash]);
    for (const [t, v] of keys) {
      const k = `${t}|${v}`;
      const cur = agg.get(k) ?? { type: t, value: v, impressions: 0, eng: 0 };
      cur.impressions += imp; cur.eng += eng;
      agg.set(k, cur);
    }
  }
  const quarantines: any[] = [];
  for (const a of agg.values()) {
    if (a.impressions < MIN_IMPRESSIONS) continue;
    const rate = a.eng / a.impressions;
    if (rate < BAD_ENGAGEMENT_RATE) {
      quarantines.push({
        pattern_type: a.type,
        pattern_value: a.value,
        reason: `underperformer rate=${rate.toFixed(4)} imp=${a.impressions}`,
        quarantined_until: new Date(Date.now() + QUARANTINE_DAYS * 86400000).toISOString(),
      });
    }
  }
  let quarantined = 0;
  if (quarantines.length) {
    const { error: qErr } = await admin
      .from("cinematic_quarantine_patterns")
      .upsert(quarantines, { onConflict: "pattern_type,pattern_value" });
    if (!qErr) quarantined = quarantines.length;
  }

  return json(200, {
    ok: true,
    traceId,
    metrics_rows: metrics?.length ?? 0,
    performance_upserts: perfRows.length,
    patterns_evaluated: agg.size,
    patterns_quarantined: quarantined,
  });
});