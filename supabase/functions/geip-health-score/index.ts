// Computes 11 sub-scores + overall, each with a `why` explanation.
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun } from "../_shared/geip-common.ts";

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "health_score");

  const why: Record<string, string> = {};

  // GSC score: last 14 days clicks trend
  const { data: gsc } = await sb.from("geip_gsc_daily")
    .select("date, clicks, impressions, position")
    .eq("dimension", "total")
    .gte("date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
    .order("date");
  const clicks = (gsc ?? []).reduce((a, r: any) => a + (r.clicks | 0), 0);
  const impressions = (gsc ?? []).reduce((a, r: any) => a + (r.impressions | 0), 0);
  const avgPos = (gsc ?? []).reduce((a, r: any) => a + Number(r.position || 0), 0) / Math.max(1, gsc?.length ?? 1);
  const searchConsole = gsc?.length ? clamp(60 + Math.min(30, clicks / 10) + Math.max(0, 20 - avgPos)) : 0;
  why.search_console = gsc?.length ? `${clicks} clicks / ${impressions} impressions over ${gsc.length}d, avg pos ${avgPos.toFixed(1)}` : "No GSC data yet";

  // Merchant score: approved ratio
  const { data: mp } = await sb.from("geip_merchant_products").select("status");
  const total = mp?.length ?? 0;
  const approved = (mp ?? []).filter((r: any) => r.status === "approved").length;
  const merchant = total ? clamp((approved / total) * 100) : 0;
  why.merchant = total ? `${approved}/${total} products approved` : "No Merchant data yet";

  // PageSpeed score: average performance last 7d
  const { data: ps } = await sb.from("geip_pagespeed_runs")
    .select("performance, captured_at")
    .gte("captured_at", new Date(Date.now() - 7 * 864e5).toISOString());
  const perfAvg = ps?.length ? ps.reduce((a, r: any) => a + Number(r.performance || 0), 0) / ps.length : 0;
  const pagespeed = clamp(perfAvg);
  why.pagespeed = ps?.length ? `avg Lighthouse perf ${perfAvg.toFixed(1)} across ${ps.length} runs` : "No PageSpeed data yet";

  // Index score: from URL inspection
  const { data: ins } = await sb.from("geip_url_inspection")
    .select("verdict")
    .gte("inspected_at", new Date(Date.now() - 30 * 864e5).toISOString());
  const passed = (ins ?? []).filter((r: any) => r.verdict === "PASS").length;
  const indexScore = ins?.length ? clamp((passed / ins.length) * 100) : 0;
  why.index_score = ins?.length ? `${passed}/${ins.length} inspected URLs PASS` : "No URL inspections yet";

  // Schema / SEO / AI Search
  const { data: tech } = await sb.from("geip_technical_seo")
    .select("has_title, has_description, has_canonical, has_og, has_twitter, schema_types, is_noindex")
    .gte("captured_at", new Date(Date.now() - 30 * 864e5).toISOString());
  const seoScore = tech?.length
    ? clamp(tech.reduce((a, r: any) => a + (r.has_title ? 20 : 0) + (r.has_description ? 20 : 0) + (r.has_canonical ? 20 : 0) + (r.has_og ? 20 : 0) + (r.has_twitter ? 20 : 0), 0) / tech.length)
    : 0;
  const schemaScore = tech?.length
    ? clamp(tech.reduce((a, r: any) => a + Math.min(100, (r.schema_types?.length ?? 0) * 20), 0) / tech.length)
    : 0;
  why.seo = tech?.length ? `${tech.length} URLs audited, avg SEO tag coverage ${seoScore.toFixed(0)}%` : "No SEO audit yet";
  why.schema_score = tech?.length ? `avg ${(schemaScore / 20).toFixed(1)} schema types per URL` : "No schema data yet";

  const { data: ai } = await sb.from("geip_ai_search_signals").select("ai_overview_ready, entity_coverage_score")
    .gte("captured_at", new Date(Date.now() - 30 * 864e5).toISOString());
  const aiSearch = ai?.length ? clamp(ai.reduce((a, r: any) => a + Number(r.entity_coverage_score || 0), 0) / ai.length) : 0;
  why.ai_search = ai?.length ? `${ai.length} URLs scored, avg entity coverage ${aiSearch.toFixed(0)}` : "No AI-search signals yet";

  // E-E-A-T / Trust — derived from schema + technical SEO for now
  const eeat = clamp((schemaScore + seoScore) / 2);
  why.eeat = "Weighted average of schema completeness and SEO tag hygiene";
  const trust = eeat;
  why.trust = "Trust proxy = E-E-A-T (schema + SEO hygiene) until backlink/citation feeds land";

  // Organic growth — GA4 organic sessions trend
  const { data: ga4 } = await sb.from("geip_ga4_daily")
    .select("sessions, channel_group, date")
    .gte("date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const orgSessions = (ga4 ?? []).filter((r: any) => (r.channel_group ?? "").toLowerCase().includes("organic")).reduce((a, r: any) => a + (r.sessions | 0), 0);
  const organicGrowth = ga4?.length ? clamp(40 + Math.min(60, orgSessions / 20)) : 0;
  why.organic_growth = ga4?.length ? `${orgSessions} organic sessions in last 30d` : "No GA4 data yet";

  // Overall (weighted: GSC + Merchant + PageSpeed doubled)
  const weights: Record<string, number> = {
    search_console: 2, merchant: 2, pagespeed: 2,
    seo: 1, index_score: 1, schema_score: 1, ai_search: 1, eeat: 1, trust: 1, organic_growth: 1,
  };
  const scores: Record<string, number> = {
    search_console: searchConsole, merchant, pagespeed, seo: seoScore, index_score: indexScore,
    schema_score: schemaScore, ai_search: aiSearch, eeat, trust, organic_growth: organicGrowth,
  };
  let num = 0, den = 0;
  for (const k of Object.keys(scores)) { const w = weights[k] ?? 1; num += scores[k] * w; den += w; }
  const overall = clamp(num / den);
  why.overall = "Weighted mean (GSC/Merchant/PageSpeed 2x, others 1x)";

  const { data: inserted } = await sb.from("geip_health_scores").insert({
    overall, search_console: searchConsole, merchant, seo: seoScore, index_score: indexScore,
    schema_score: schemaScore, pagespeed, ai_search: aiSearch, eeat, trust,
    organic_growth: organicGrowth, why,
  }).select("id").single();

  await finishRun(sb, runId, { status: "ok", rows_ingested: 1 });
  return jsonResponse({ ok: true, id: inserted?.id, overall, scores, why });
});