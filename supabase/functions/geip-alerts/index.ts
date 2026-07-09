// Delta-detected alerts from canonical GEIP tables.
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun } from "../_shared/geip-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "alerts");
  const alerts: any[] = [];

  // Traffic drop (GSC total clicks 7d vs previous 7d)
  const { data: gsc } = await sb.from("geip_gsc_daily").select("date, clicks")
    .eq("dimension", "total")
    .gte("date", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10))
    .order("date");
  if (gsc && gsc.length >= 14) {
    const last7 = gsc.slice(-7).reduce((a, r: any) => a + (r.clicks | 0), 0);
    const prev7 = gsc.slice(0, 7).reduce((a, r: any) => a + (r.clicks | 0), 0);
    if (prev7 > 50 && last7 < prev7 * 0.8) {
      alerts.push({
        source: "gsc", severity: "warning", code: "traffic_drop_7d",
        title: `Organic clicks down ${Math.round((1 - last7 / prev7) * 100)}% vs prior 7 days`,
        detail: `Last 7d ${last7} clicks vs prior 7d ${prev7}`,
        evidence: { last7, prev7 },
      });
    }
  }

  // Merchant disapprovals
  const { data: mp } = await sb.from("geip_merchant_products").select("status");
  if (mp && mp.length) {
    const disapproved = mp.filter((r: any) => r.status === "disapproved").length;
    if (disapproved > 0) {
      alerts.push({
        source: "merchant", severity: disapproved > 10 ? "critical" : "warning",
        code: "merchant_disapprovals",
        title: `${disapproved} Merchant product(s) disapproved`,
        evidence: { disapproved, total: mp.length },
      });
    }
  }

  // CWV regression (perf < 50)
  const { data: ps } = await sb.from("geip_pagespeed_runs").select("url, performance, captured_at")
    .gte("captured_at", new Date(Date.now() - 3 * 864e5).toISOString());
  const poor = (ps ?? []).filter((r: any) => Number(r.performance || 0) < 50);
  if (poor.length) {
    alerts.push({
      source: "pagespeed", severity: "warning", code: "poor_performance",
      title: `${poor.length} PageSpeed run(s) below 50`,
      evidence: { urls: poor.slice(0, 10).map((r: any) => ({ url: r.url, perf: r.performance })) },
    });
  }

  // Security issues
  const { data: si } = await sb.from("geip_security_issues").select("issue_type").gte("captured_at", new Date(Date.now() - 30 * 864e5).toISOString());
  if (si?.length) {
    alerts.push({
      source: "security", severity: "critical", code: "security_issues_present",
      title: `${si.length} security issue(s) reported by GSC`,
      evidence: {},
    });
  }

  if (alerts.length) await sb.from("geip_alerts").insert(alerts);
  await finishRun(sb, runId, { status: "ok", rows_ingested: alerts.length });
  return jsonResponse({ ok: true, created: alerts.length, alerts });
});