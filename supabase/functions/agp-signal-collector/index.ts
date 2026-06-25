import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  let body: any = {}; try { body = await req.json(); } catch {}
  const dry = body?.dry_run ?? false;
  const targetDay = body?.day ?? ymd(new Date(Date.now() - 86_400_000)); // yesterday by default

  const { data: run } = await sb.from("agp_runs").insert({
    engine: "signal_collector", trigger: body?.trigger ?? "manual", dry_run: dry, status: "running",
  }).select("id").single();
  const runId = run!.id;

  try {
    // Pinterest aggregates for the day
    const { data: pad } = await sb.from("pinterest_analytics_daily")
      .select("impressions,saves,outbound_clicks,pin_clicks,ctr")
      .eq("day", targetDay);
    const pin_impressions = (pad ?? []).reduce((a, r: any) => a + (r.impressions ?? 0), 0);
    const pin_saves = (pad ?? []).reduce((a, r: any) => a + (r.saves ?? 0), 0);
    const pin_clicks = (pad ?? []).reduce((a, r: any) => a + ((r.outbound_clicks ?? 0) + (r.pin_clicks ?? 0)), 0);
    const pin_ctr = pin_impressions > 0 ? pin_clicks / pin_impressions : 0;

    const { count: pins_published } = await sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("posted_at", `${targetDay}T00:00:00`)
      .lt("posted_at", `${targetDay}T23:59:59`);

    // GSC aggregates
    const { data: gsc } = await sb.from("gsc_keywords")
      .select("clicks,impressions,position")
      .eq("sync_date", targetDay);
    const gsc_clicks = (gsc ?? []).reduce((a, r: any) => a + (r.clicks ?? 0), 0);
    const gsc_impressions = (gsc ?? []).reduce((a, r: any) => a + (r.impressions ?? 0), 0);
    const gsc_ctr = gsc_impressions > 0 ? gsc_clicks / gsc_impressions : 0;
    const gsc_avg_position = (gsc ?? []).length > 0
      ? (gsc ?? []).reduce((a, r: any) => a + (r.position ?? 0), 0) / (gsc as any[]).length
      : 0;

    // GA4
    const { data: ga } = await sb.from("ga4_daily_snapshots")
      .select("sessions,purchases,revenue").eq("report_date", targetDay).maybeSingle();
    const ga_sessions = (ga as any)?.sessions ?? 0;
    const ga_purchases = (ga as any)?.purchases ?? 0;
    const ga_revenue_cents = Math.round(Number((ga as any)?.revenue ?? 0) * 100);

    // CJ inventory snapshot (today, not historical)
    const { count: activeCount } = await sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true);
    const { count: oosCount } = await sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).eq("effective_stock", 0);
    const cj_in_stock_pct = (activeCount ?? 0) > 0 ? 1 - ((oosCount ?? 0) / (activeCount as number)) : 0;

    // Catalog creative readiness
    const { count: seoCount } = await sb.from("products").select("id", { count: "exact", head: true })
      .eq("is_active", true).not("seo_title", "is", null);
    const catalog_creative_ready_pct = (activeCount ?? 0) > 0 ? (seoCount ?? 0) / (activeCount as number) : 0;
    const { count: withImg } = await sb.from("products").select("id", { count: "exact", head: true })
      .eq("is_active", true).not("image_url", "is", null);
    const catalog_media_coverage_pct = (activeCount ?? 0) > 0 ? (withImg ?? 0) / (activeCount as number) : 0;

    // CPE jobs for the day
    const { data: cpeJobs } = await sb.from("cpe_creative_jobs")
      .select("status").gte("updated_at", `${targetDay}T00:00:00`).lt("updated_at", `${targetDay}T23:59:59`);
    const cpe_jobs_run = (cpeJobs ?? []).length;
    const cpe_qa_pass_pct = cpe_jobs_run > 0
      ? (cpeJobs ?? []).filter((j: any) => j.status === "succeeded" || j.status === "done").length / cpe_jobs_run
      : 0;

    // Cinematic V3
    const { data: cv3 } = await sb.from("cinematic_v3_jobs")
      .select("status").gte("updated_at", `${targetDay}T00:00:00`).lt("updated_at", `${targetDay}T23:59:59`);
    const cv3_renders = (cv3 ?? []).length;
    const cv3_success_pct = cv3_renders > 0
      ? (cv3 ?? []).filter((j: any) => j.status === "succeeded" || j.status === "done" || j.status === "completed").length / cv3_renders
      : 0;

    // AGP daily AI spend
    const { data: agpRuns } = await sb.from("agp_runs")
      .select("ai_cost_usd").gte("started_at", `${targetDay}T00:00:00`).lt("started_at", `${targetDay}T23:59:59`);
    const cpe_spend_usd = (agpRuns ?? []).reduce((a, r: any) => a + Number(r.ai_cost_usd ?? 0), 0);

    const row = {
      day: targetDay,
      pin_impressions, pin_saves, pin_clicks, pin_ctr, pin_revenue_cents: 0, pins_published: pins_published ?? 0,
      gsc_clicks, gsc_impressions, gsc_ctr, gsc_avg_position,
      ga_sessions, ga_atc: 0, ga_checkouts: 0, ga_purchases, ga_revenue_cents,
      cj_in_stock_pct, cj_oos_count: oosCount ?? 0,
      catalog_active: activeCount ?? 0, catalog_creative_ready_pct, catalog_media_coverage_pct,
      cpe_jobs_run, cpe_spend_usd, cpe_qa_pass_pct,
      cv3_renders, cv3_success_pct,
      updated_at: new Date().toISOString(),
    };

    if (!dry) {
      await sb.from("agp_signals_daily").upsert(row, { onConflict: "day" });
    }

    await sb.from("agp_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(),
      counts: { day: targetDay, fields: Object.keys(row).length },
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, day: targetDay, row, dry_run: dry }),
      { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    await sb.from("agp_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: String(e) }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});