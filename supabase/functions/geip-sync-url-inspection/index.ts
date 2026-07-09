import { callUrlInspection, gscAvailable } from "../_shared/google-gateway.ts";
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun, markConnection } from "../_shared/geip-common.ts";

const SITE = "https://getpawsy.pet/";
const SAMPLE = [
  "https://getpawsy.pet/",
  "https://getpawsy.pet/products",
  "https://getpawsy.pet/collections",
  "https://getpawsy.pet/guides",
  "https://getpawsy.pet/blog",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "url_inspection");
  const avail = gscAvailable();
  if (!avail.ok) {
    await markConnection(sb, "url_inspection", "waiting_for_auth", avail.blocker);
    await finishRun(sb, runId, { status: "waiting_for_auth", blocker: avail.blocker });
    return jsonResponse({ ok: false, blocker: avail.blocker });
  }

  let urls = SAMPLE;
  try { const b = await req.json(); if (Array.isArray(b?.urls)) urls = b.urls.slice(0, 25); } catch {}

  let rows = 0;
  for (const u of urls) {
    const r = await callUrlInspection(u, SITE);
    if (!r.ok) continue;
    const ir = (r.data as any)?.inspectionResult?.indexStatusResult ?? {};
    const mo = (r.data as any)?.inspectionResult?.mobileUsabilityResult ?? {};
    const rr = (r.data as any)?.inspectionResult?.richResultsResult ?? {};
    await sb.from("geip_url_inspection").insert({
      property_id: "sc-domain:getpawsy.pet",
      url: u,
      verdict: ir.verdict,
      coverage_state: ir.coverageState,
      indexing_state: ir.indexingState,
      mobile_usable: mo.verdict,
      rich_results_state: rr.verdict,
      last_crawl_time: ir.lastCrawlTime ?? null,
      robots_txt_state: ir.robotsTxtState,
      canonical_url: ir.googleCanonical ?? ir.userCanonical,
      raw: r.data,
    });
    rows += 1;
  }

  await markConnection(sb, "url_inspection", rows ? "ready" : "error");
  await finishRun(sb, runId, { status: rows ? "ok" : "error", rows_ingested: rows });
  return jsonResponse({ ok: true, rows });
});