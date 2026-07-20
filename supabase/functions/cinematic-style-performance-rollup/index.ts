// cinematic-style-performance-rollup
//
// Joins cinematic_pin_performance × cinematic_ad_jobs.style_preset_key × hook archetype
// to produce a 14-day rolling composite score per (preset, hook_type, niche).
// Writes upserts into public.cinematic_style_weights so the storyboard /
// hook picker can use epsilon-greedy weighting and bottom-quartile suppression.
//
// Cron: daily 05:30 UTC.
// Manual: { window_days?: 14, suppress_bottom_quartile?: true }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trace = () => `srol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Row {
  style_preset_key: string;
  hook_type: string | null;
  niche_key: string | null;
  ctr: number;
  save_rate: number;
  hold_rate: number;
  completion: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  if (!auth && !apikey) return json(401, { ok: false, traceId, message: "unauthorized" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const windowDays = Math.max(3, Math.min(60, Number(body.window_days ?? 14)));
    const suppressBottomQuartile = body.suppress_bottom_quartile !== false;

    // Settings
    const { data: settings } = await admin.from("cinematic_ad_settings")
      .select("style_suppression_days").eq("id", true).maybeSingle();
    const suppressionDays = Math.max(1, Number(settings?.style_suppression_days ?? 7));

    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

    // Pull jobs with style_preset_key + their performance via product slug join
    // Fallback when cinematic_pin_performance is empty: use job v2/v4 scores
    // so that early days still get directional weights.
    const { data: jobs, error } = await admin
      .from("cinematic_ad_jobs")
      .select("style_preset_key, hook_archetype, hook_type, product_category, qa_composite_score, engagement_pacing_score, realism_score, camera_motion_score, pushed_to_pinterest_at, pinterest_asset_id")
      .not("style_preset_key", "is", null)
      .gte("pushed_to_pinterest_at", cutoff)
      .not("pushed_to_pinterest_at", "is", null);
    if (error) return json(500, { ok: false, traceId, message: error.message });

    // Try real perf data
    const { data: perf } = await admin
      .from("cinematic_pin_performance")
      .select("pin_id, ctr, save_rate, hold_rate, completion_rate, recorded_at")
      .gte("recorded_at", cutoff);
    const perfByPin = new Map<string, { ctr: number; save: number; hold: number; comp: number }>();
    for (const r of perf ?? []) {
      perfByPin.set(String((r as any).pin_id), {
        ctr: Number((r as any).ctr ?? 0),
        save: Number((r as any).save_rate ?? 0),
        hold: Number((r as any).hold_rate ?? 0),
        comp: Number((r as any).completion_rate ?? 0),
      });
    }

    // Bucket: (preset, hook_type, niche)
    const buckets = new Map<string, { rows: Row[]; key: { p: string; h: string | null; n: string | null } }>();
    for (const j of jobs ?? []) {
      const p = String((j as any).style_preset_key);
      const h = ((j as any).hook_archetype ?? (j as any).hook_type ?? null) as string | null;
      const n = ((j as any).product_category ?? null) as string | null;
      const k = `${p}::${h ?? "_"}::${n ?? "_"}`;
      const perfRow = perfByPin.get(String((j as any).pinterest_asset_id ?? ""));
      const row: Row = perfRow
        ? { style_preset_key: p, hook_type: h, niche_key: n,
            ctr: perfRow.ctr, save_rate: perfRow.save, hold_rate: perfRow.hold, completion: perfRow.comp }
        // proxy from job QA scores (0-100 → normalized 0-1)
        : { style_preset_key: p, hook_type: h, niche_key: n,
            ctr: Number((j as any).qa_composite_score ?? 50) / 100 * 0.015,    // ~1.5% baseline CTR proxy
            save_rate: Number((j as any).engagement_pacing_score ?? 50) / 100 * 0.01,
            hold_rate: Number((j as any).realism_score ?? 50) / 100,
            completion: Number((j as any).camera_motion_score ?? 50) / 100 };
      const bucket = buckets.get(k) ?? { rows: [], key: { p, h, n } };
      bucket.rows.push(row);
      buckets.set(k, bucket);
    }

    // Compute composite per bucket
    type Out = { style_preset_key: string; hook_type: string | null; niche_key: string | null;
      sample_size: number; avg_ctr: number; avg_save_rate: number; avg_hold_rate: number;
      avg_completion: number; composite_score: number; weight: number };
    const outs: Out[] = [];
    for (const [, { rows, key }] of buckets) {
      const n = rows.length;
      const ctr = rows.reduce((a, r) => a + r.ctr, 0) / n;
      const sr = rows.reduce((a, r) => a + r.save_rate, 0) / n;
      const hr = rows.reduce((a, r) => a + r.hold_rate, 0) / n;
      const comp = rows.reduce((a, r) => a + r.completion, 0) / n;
      // Composite (0-100): CTR 40% + save 30% + hold 20% + comp 10%, scaled.
      const composite = Math.round(
        Math.min(100,
          (ctr / 0.03) * 40 +        // 3% CTR → full marks
          (sr / 0.02) * 30 +         // 2% save → full marks
          hr * 20 +                  // hold already 0-1
          comp * 10),
      );
      outs.push({
        style_preset_key: key.p, hook_type: key.h, niche_key: key.n,
        sample_size: n, avg_ctr: ctr, avg_save_rate: sr, avg_hold_rate: hr,
        avg_completion: comp, composite_score: composite,
        weight: 1.0, // recomputed below
      });
    }

    // Suppress bottom quartile + boost top quartile via weight
    if (outs.length && suppressBottomQuartile) {
      const sorted = [...outs].sort((a, b) => a.composite_score - b.composite_score);
      const q1 = sorted[Math.floor(sorted.length * 0.25)]?.composite_score ?? 0;
      const q3 = sorted[Math.floor(sorted.length * 0.75)]?.composite_score ?? 100;
      for (const o of outs) {
        if (o.composite_score <= q1 && o.sample_size >= 3) o.weight = 0.2;
        else if (o.composite_score >= q3) o.weight = 1.6;
        else o.weight = 1.0;
      }
    }

    // Upsert
    let upserts = 0, suppressed = 0;
    for (const o of outs) {
      const suppressUntil = o.weight < 1.0
        ? new Date(Date.now() + suppressionDays * 86400000).toISOString() : null;
      const { error: upErr } = await admin.from("cinematic_style_weights").upsert({
        style_preset_key: o.style_preset_key,
        hook_type: o.hook_type,
        niche_key: o.niche_key,
        sample_size: o.sample_size,
        avg_ctr: o.avg_ctr,
        avg_save_rate: o.avg_save_rate,
        avg_hold_rate: o.avg_hold_rate,
        avg_completion: o.avg_completion,
        composite_score: o.composite_score,
        weight: o.weight,
        suppressed_until: suppressUntil,
        computed_at: new Date().toISOString(),
      }, { onConflict: "style_preset_key,hook_type,niche_key" });
      if (!upErr) {
        upserts++;
        if (suppressUntil) suppressed++;
      }
    }

    return json(200, { ok: true, traceId, window_days: windowDays, buckets: outs.length, upserts, suppressed });
  } catch (e) {
    return json(500, { ok: false, traceId, message: e instanceof Error ? e.message : String(e) });
  }
});