// Bundles the existing Pinterest integrity evidence into a downloadable report
// (JSON + CSV + HTML) and writes it to the private `admin-reports` bucket at
// pinterest-integrity/<ISO>/. Also inserts an index row in
// pinterest_integrity_reports for the dashboard.
//
// This function does NOT recompute anything - it reads from the existing
// production tables (pinterest_pin_audit_runs, pinterest_pin_audit,
// pinterest_hero_sync_log) so numbers match what the audit engine produced.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function htmlReport(summary: any, rows: any[]): string {
  const rowHtml = rows.slice(0, 500).map((r) => `
    <tr>
      <td>${r.source ?? ""}</td>
      <td><code>${r.pinterest_pin_id ?? ""}</code></td>
      <td class="url">${r.destination_url ?? ""}</td>
      <td>${r.http_status ?? ""}</td>
      <td>${r.repair_strategy ?? ""}</td>
      <td>${(r.notes ?? "").toString().replace(/</g, "&lt;")}</td>
    </tr>
  `).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pinterest Integrity Report</title>
  <style>
    body { font: 13px system-ui, -apple-system, Segoe UI, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #666; margin-bottom: 20px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0 24px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    .kpi .l { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
    .kpi .v { font-size: 22px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    th { background: #f8fafc; font-weight: 600; }
    td.url { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  </style></head><body>
    <h1>Pinterest Integrity Report</h1>
    <div class="sub">Generated ${new Date().toISOString()} · run ${summary.run_id ?? "n/a"}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Audited</div><div class="v">${summary.pins_audited}</div></div>
      <div class="kpi"><div class="l">PASS (>=98)</div><div class="v">${summary.pins_pass}</div></div>
      <div class="kpi"><div class="l">WARNING</div><div class="v">${summary.pins_warning}</div></div>
      <div class="kpi"><div class="l">FAIL (<95)</div><div class="v">${summary.pins_fail}</div></div>
      <div class="kpi"><div class="l">Repaired</div><div class="v">${summary.pins_repaired}</div></div>
      <div class="kpi"><div class="l">Archived</div><div class="v">${summary.pins_archived}</div></div>
      <div class="kpi"><div class="l">Hero syncs</div><div class="v">${summary.hero_syncs}</div></div>
      <div class="kpi"><div class="l">Wrong URLs fixed</div><div class="v">${summary.wrong_url_fixed}</div></div>
    </div>
    <h2>Pin-level evidence (first 500)</h2>
    <table>
      <thead><tr>
        <th>Source</th><th>Pin ID</th><th>Destination</th><th>HTTP</th><th>Strategy</th><th>Notes</th>
      </tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => ({}));
  const runId: string | undefined = body?.run_id;

  // Latest run when not specified.
  let run: any;
  if (runId) {
    const { data } = await supabase.from("pinterest_pin_audit_runs")
      .select("*").eq("id", runId).maybeSingle();
    run = data;
  } else {
    const { data } = await supabase.from("pinterest_pin_audit_runs")
      .select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
    run = data;
  }
  if (!run) {
    return new Response(JSON.stringify({ error: "no audit runs found; run pinterest-integrity-audit first" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: rows } = await supabase.from("pinterest_pin_audit")
    .select("id, source, destination_url, final_resolved_url, http_status, repair_strategy, notes, pinterest_pin_id, created_at")
    .eq("run_id", run.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  const auditRows = rows ?? [];

  const since = run.started_at ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: heroSyncsCount } = await supabase.from("pinterest_hero_sync_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .is("rolled_back_at", null);

  const s: any = run.summary || {};
  // Classify per phase-B thresholds using existing repair_strategy semantics.
  const pass = auditRows.filter((r) => r.repair_strategy === "valid").length;
  const repaired = auditRows.filter((r) => r.repair_strategy === "auto_repaired").length;
  const fail = auditRows.filter((r) => r.repair_strategy === "needs_replacement").length;
  const warning = Math.max(0, auditRows.length - pass - repaired - fail);
  const wrongUrlFixed = auditRows.filter((r) =>
    r.repair_strategy === "auto_repaired" && (r.notes ?? "").toString().toLowerCase().includes("slug")
  ).length;

  const summary = {
    run_id: run.id,
    started_at: run.started_at,
    finished_at: run.finished_at,
    pins_audited: auditRows.length || run.pins_total,
    pins_pass: pass,
    pins_warning: warning,
    pins_fail: fail,
    pins_repaired: repaired,
    pins_archived: Number(s.archived ?? 0),
    hero_syncs: heroSyncsCount ?? 0,
    wrong_url_fixed: wrongUrlFixed,
    visual_mismatches: Number(s.visual_mismatches ?? fail),
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `pinterest-integrity/${ts}`;
  const jsonPath = `${prefix}/report.json`;
  const csvPath = `${prefix}/pins.csv`;
  const htmlPath = `${prefix}/report.html`;

  const bucket = supabase.storage.from("admin-reports");
  const jsonBlob = new Blob([JSON.stringify({ summary, rows: auditRows }, null, 2)], { type: "application/json" });
  const csvBlob = new Blob([toCsv(auditRows as any)], { type: "text/csv" });
  const htmlBlob = new Blob([htmlReport(summary, auditRows)], { type: "text/html" });

  const uploads = await Promise.all([
    bucket.upload(jsonPath, jsonBlob, { contentType: "application/json", upsert: true }),
    bucket.upload(csvPath, csvBlob, { contentType: "text/csv", upsert: true }),
    bucket.upload(htmlPath, htmlBlob, { contentType: "text/html", upsert: true }),
  ]);
  const uploadErr = uploads.find((u) => u.error)?.error;
  if (uploadErr) {
    return new Response(JSON.stringify({ error: uploadErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: inserted } = await supabase.from("pinterest_integrity_reports").insert({
    run_id: run.id,
    pins_audited: summary.pins_audited,
    pins_pass: summary.pins_pass,
    pins_warning: summary.pins_warning,
    pins_fail: summary.pins_fail,
    pins_archived: summary.pins_archived,
    pins_repaired: summary.pins_repaired,
    hero_syncs: summary.hero_syncs,
    wrong_url_fixed: summary.wrong_url_fixed,
    visual_mismatches: summary.visual_mismatches,
    storage_prefix: prefix,
    json_path: jsonPath,
    csv_path: csvPath,
    html_path: htmlPath,
    summary,
  }).select().maybeSingle();

  const [{ data: jsonUrl }, { data: csvUrl }, { data: htmlUrl }] = await Promise.all([
    bucket.createSignedUrl(jsonPath, 3600),
    bucket.createSignedUrl(csvPath, 3600),
    bucket.createSignedUrl(htmlPath, 3600),
  ]);

  return new Response(JSON.stringify({
    ok: true,
    report_id: inserted?.id,
    summary,
    signed_urls: {
      json: jsonUrl?.signedUrl,
      csv: csvUrl?.signedUrl,
      html: htmlUrl?.signedUrl,
    },
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
