import { callGSC, gscAvailable } from "../_shared/google-gateway.ts";
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun, markConnection } from "../_shared/geip-common.ts";

const PROPERTY = "sc-domain:getpawsy.pet";
const encoded = encodeURIComponent(PROPERTY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "gsc");
  const avail = gscAvailable();
  if (!avail.ok) {
    await markConnection(sb, "gsc", "waiting_for_auth", avail.blocker);
    await finishRun(sb, runId, { status: "waiting_for_auth", blocker: avail.blocker });
    return jsonResponse({ ok: false, blocker: avail.blocker });
  }

  const end = new Date(); end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - 28);
  const dateRange = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };

  const dims = [
    { key: "total", body: { ...dateRange, dimensions: [] } },
    { key: "query", body: { ...dateRange, dimensions: ["query"], rowLimit: 500 } },
    { key: "page", body: { ...dateRange, dimensions: ["page"], rowLimit: 500 } },
    { key: "country", body: { ...dateRange, dimensions: ["country"], rowLimit: 100 } },
    { key: "device", body: { ...dateRange, dimensions: ["device"], rowLimit: 20 } },
    { key: "search_appearance", body: { ...dateRange, dimensions: ["searchAppearance"], rowLimit: 50 } },
  ];

  let rows = 0;
  const errors: string[] = [];
  for (const d of dims) {
    const r = await callGSC<any>(
      `/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
      { method: "POST", body: JSON.stringify(d.body) },
    );
    if (!r.ok) { errors.push(`${d.key}: ${r.blocker}`); continue; }
    const payload = (r.data?.rows ?? []) as any[];
    const day = dateRange.endDate;
    const batch = payload.map((row) => ({
      property_id: PROPERTY,
      date: day,
      dimension: d.key,
      dimension_value: (row.keys ?? [""]).join(" | "),
      clicks: row.clicks | 0,
      impressions: row.impressions | 0,
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    }));
    if (d.key === "total" && !batch.length && r.data) {
      // aggregate row
      batch.push({
        property_id: PROPERTY, date: day, dimension: "total", dimension_value: "",
        clicks: 0, impressions: 0, ctr: 0, position: 0,
      });
    }
    if (batch.length) {
      await sb.from("geip_gsc_daily").upsert(batch, { onConflict: "property_id,date,dimension,dimension_value" });
      rows += batch.length;
    }
  }

  // Sitemaps
  const sm = await callGSC<any>(`/webmasters/v3/sites/${encoded}/sitemaps`);
  if (sm.ok && Array.isArray(sm.data?.sitemap)) {
    const smRows = sm.data.sitemap.map((s: any) => ({
      property_id: PROPERTY, path: s.path,
      last_submitted: s.lastSubmitted ?? null,
      last_downloaded: s.lastDownloaded ?? null,
      is_pending: !!s.isPending,
      errors: (s.contents ?? []).reduce((a: number, c: any) => a + (c.indexed ? 0 : 0), 0),
      warnings: s.warnings ?? 0,
      contents: s.contents ?? [],
      captured_at: new Date().toISOString(),
    }));
    if (smRows.length) await sb.from("geip_sitemaps").upsert(smRows, { onConflict: "property_id,path" });
  }

  await markConnection(sb, "gsc", errors.length ? "error" : "ready", errors[0]);
  await finishRun(sb, runId, {
    status: errors.length && !rows ? "error" : rows ? "ok" : "partial",
    rows_ingested: rows,
    error: errors.join("; ") || undefined,
  });
  return jsonResponse({ ok: true, rows, errors });
});