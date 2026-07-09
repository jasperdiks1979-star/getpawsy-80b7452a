// Single fan-out envelope powering /admin/google-enterprise.
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/geip-common.ts";
import { gatewayStatus } from "../_shared/google-gateway.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();

  const [
    connections, sync_runs, health_latest, health_series, alerts,
    gsc_totals, gsc_top_queries, gsc_top_pages, gsc_coverage,
    ga4, url_insp, merchant_products, merchant_issues,
    pagespeed, tech_seo, ai_signals, opportunities, readiness,
  ] = await Promise.all([
    sb.from("geip_connections").select("*"),
    sb.from("geip_sync_runs").select("*").order("started_at", { ascending: false }).limit(80),
    sb.from("geip_health_scores").select("*").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("geip_health_scores").select("captured_at, overall").order("captured_at", { ascending: false }).limit(30),
    sb.from("geip_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
    sb.from("geip_gsc_daily").select("date, clicks, impressions, ctr, position").eq("dimension", "total").order("date", { ascending: false }).limit(60),
    sb.from("geip_gsc_daily").select("dimension_value, clicks, impressions, ctr, position").eq("dimension", "query").order("clicks", { ascending: false }).limit(50),
    sb.from("geip_gsc_daily").select("dimension_value, clicks, impressions, ctr, position").eq("dimension", "page").order("clicks", { ascending: false }).limit(50),
    sb.from("geip_gsc_coverage").select("*").order("captured_at", { ascending: false }).limit(20),
    sb.from("geip_ga4_daily").select("date, channel_group, sessions, purchases, revenue_cents").gte("date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
    sb.from("geip_url_inspection").select("url, verdict, coverage_state, indexing_state, inspected_at").order("inspected_at", { ascending: false }).limit(50),
    sb.from("geip_merchant_products").select("status, disapproval_reasons").limit(1000),
    sb.from("geip_merchant_issues").select("*").order("captured_at", { ascending: false }).limit(50),
    sb.from("geip_pagespeed_runs").select("url, strategy, performance, lcp_ms, cls, inp_ms, captured_at").order("captured_at", { ascending: false }).limit(50),
    sb.from("geip_technical_seo").select("*").order("captured_at", { ascending: false }).limit(50),
    sb.from("geip_ai_search_signals").select("*").order("captured_at", { ascending: false }).limit(50),
    sb.from("geip_opportunities").select("*").eq("is_active", true).order("confidence", { ascending: false }).limit(50),
    sb.rpc("geip_readiness"),
  ]);

  const merchantAgg = (() => {
    const rows = merchant_products.data ?? [];
    const total = rows.length;
    const approved = rows.filter((r: any) => r.status === "approved").length;
    const disapproved = rows.filter((r: any) => r.status === "disapproved").length;
    const pending = rows.filter((r: any) => r.status === "pending").length;
    return { total, approved, disapproved, pending };
  })();

  const ga4Agg = (() => {
    const rows = ga4.data ?? [];
    const byChannel: Record<string, { sessions: number; purchases: number; revenue_cents: number }> = {};
    for (const r of rows as any[]) {
      const k = r.channel_group || "(unset)";
      const v = byChannel[k] ??= { sessions: 0, purchases: 0, revenue_cents: 0 };
      v.sessions += r.sessions | 0;
      v.purchases += r.purchases | 0;
      v.revenue_cents += Number(r.revenue_cents || 0);
    }
    return byChannel;
  })();

  return jsonResponse({
    ok: true,
    generated_at: new Date().toISOString(),
    gateway: gatewayStatus(),
    readiness: readiness.data,
    connections: connections.data ?? [],
    sync_runs: sync_runs.data ?? [],
    health: { latest: health_latest.data, series: health_series.data ?? [] },
    alerts: alerts.data ?? [],
    gsc: {
      totals: gsc_totals.data ?? [],
      top_queries: gsc_top_queries.data ?? [],
      top_pages: gsc_top_pages.data ?? [],
      coverage: gsc_coverage.data ?? [],
    },
    ga4: { by_channel: ga4Agg, rows: (ga4.data ?? []).length },
    indexation: { url_inspection: url_insp.data ?? [] },
    merchant: { aggregate: merchantAgg, issues: merchant_issues.data ?? [] },
    pagespeed: pagespeed.data ?? [],
    technical_seo: tech_seo.data ?? [],
    ai_search: ai_signals.data ?? [],
    opportunities: opportunities.data ?? [],
  });
});