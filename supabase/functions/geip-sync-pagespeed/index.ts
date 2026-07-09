import { callPageSpeed, pagespeedAvailable } from "../_shared/google-gateway.ts";
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun, markConnection } from "../_shared/geip-common.ts";

const TOP_URLS = [
  "https://getpawsy.pet/",
  "https://getpawsy.pet/products",
  "https://getpawsy.pet/collections",
  "https://getpawsy.pet/guides",
  "https://getpawsy.pet/blog",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "pagespeed");
  const avail = pagespeedAvailable();
  if (!avail.ok) {
    await markConnection(sb, "pagespeed", "waiting_for_auth", avail.blocker);
    await finishRun(sb, runId, { status: "waiting_for_auth", blocker: avail.blocker });
    return jsonResponse({ ok: false, blocker: avail.blocker });
  }

  // Optional: use custom URLs from request
  let urls = TOP_URLS;
  try {
    const b = await req.json();
    if (Array.isArray(b?.urls) && b.urls.length) urls = b.urls.slice(0, 25);
  } catch { /* default */ }

  let rows = 0;
  for (const url of urls) {
    for (const strategy of ["mobile", "desktop"] as const) {
      const r = await callPageSpeed(url, strategy);
      if (!r.ok) continue;
      const d: any = r.data;
      const lh = d?.lighthouseResult?.categories ?? {};
      const audits = d?.lighthouseResult?.audits ?? {};
      await sb.from("geip_pagespeed_runs").insert({
        url, strategy,
        performance: (lh["performance"]?.score ?? 0) * 100,
        accessibility: (lh["accessibility"]?.score ?? 0) * 100,
        best_practices: (lh["best-practices"]?.score ?? 0) * 100,
        seo: (lh["seo"]?.score ?? 0) * 100,
        lcp_ms: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
        cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
        inp_ms: Math.round(audits["interaction-to-next-paint"]?.numericValue ?? audits["experimental-interaction-to-next-paint"]?.numericValue ?? 0),
        ttfb_ms: Math.round(audits["server-response-time"]?.numericValue ?? 0),
        fcp_ms: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
        raw: { fetched_at: new Date().toISOString(), analysisUTCTimestamp: d?.analysisUTCTimestamp },
      });
      rows += 1;
    }
  }

  await markConnection(sb, "pagespeed", rows ? "ready" : "error", rows ? undefined : "provider_error");
  await finishRun(sb, runId, { status: rows ? "ok" : "error", rows_ingested: rows });
  return jsonResponse({ ok: true, rows });
});