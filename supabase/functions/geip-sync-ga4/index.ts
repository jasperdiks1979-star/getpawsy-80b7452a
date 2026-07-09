import { callGA4, ga4Available } from "../_shared/google-gateway.ts";
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun, markConnection } from "../_shared/geip-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "ga4");
  const avail = ga4Available();
  if (!avail.ok) {
    await markConnection(sb, "ga4", "waiting_for_auth", avail.blocker);
    await finishRun(sb, runId, { status: "waiting_for_auth", blocker: avail.blocker });
    return jsonResponse({ ok: false, blocker: avail.blocker });
  }

  const propId = Deno.env.get("GA4_PROPERTY_ID") ?? "";
  const body = {
    dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
    dimensions: [
      { name: "date" }, { name: "sessionDefaultChannelGroup" },
      { name: "sessionSource" }, { name: "sessionMedium" }, { name: "landingPage" },
    ],
    metrics: [
      { name: "sessions" }, { name: "totalUsers" }, { name: "engagedSessions" },
      { name: "transactions" }, { name: "purchaseRevenue" },
    ],
    limit: "10000",
  };
  const r = await callGA4<any>(body);
  if (!r.ok) {
    await markConnection(sb, "ga4", "error", r.blocker);
    await finishRun(sb, runId, { status: "error", blocker: r.blocker, error: r.error });
    return jsonResponse({ ok: false, blocker: r.blocker });
  }

  const rows = (r.data?.rows ?? []).map((row: any) => {
    const d = row.dimensionValues.map((v: any) => v.value);
    const m = row.metricValues.map((v: any) => Number(v.value || 0));
    return {
      property_id: propId,
      date: `${d[0].slice(0, 4)}-${d[0].slice(4, 6)}-${d[0].slice(6, 8)}`,
      channel_group: d[1] ?? "",
      source: d[2] ?? "",
      medium: d[3] ?? "",
      landing_page: (d[4] ?? "").slice(0, 500),
      sessions: m[0] | 0,
      users: m[1] | 0,
      engaged_sessions: m[2] | 0,
      purchases: m[3] | 0,
      revenue_cents: Math.round((m[4] ?? 0) * 100),
    };
  });

  if (rows.length) {
    // Chunk to keep payloads modest
    const chunk = 1000;
    for (let i = 0; i < rows.length; i += chunk) {
      await sb.from("geip_ga4_daily").upsert(rows.slice(i, i + chunk), {
        onConflict: "property_id,date,channel_group,source,medium,landing_page",
      });
    }
  }

  await markConnection(sb, "ga4", "ready");
  await finishRun(sb, runId, { status: "ok", rows_ingested: rows.length });
  return jsonResponse({ ok: true, rows: rows.length });
});