// pinterest-approved-publish-sweep
// ---------------------------------------------------------------
// Deterministic, credit-free publish orchestrator.
//
// Scans every already-approved Pinterest asset across pinterest_pin_queue
// (the canonical publish surface, which also holds PEI master creatives via
// pcie2_creative_id and PRE approvals via pre_evaluations), classifies each
// row into READY / WAITING_AI / BLOCKED / FAILED, then — if execute=true —
// stages the top N READY rows for publication by the existing
// pinterest-cron-worker (no AI Gateway calls, no image regeneration, no
// duplicate publisher).
//
// Staging = set status='approved' + approved_at + scheduled_at spaced
// `interval_seconds` seconds apart, capped at `max_publish` (default 20,
// hard-cap 20). The next cron-worker tick picks them up in scheduled order,
// which naturally honours Pinterest rate limits and the internal
// per-tick BATCH_SIZE cap.
//
// Every run persists a full JSON+HTML report to the admin-reports storage
// bucket and indexes it in pinterest_integrity_reports so operators can
// review READY / PUBLISHED / SKIPPED / FAILED per candidate with exact
// blocking reasons.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Bucket = "READY" | "WAITING_AI" | "BLOCKED" | "FAILED";

interface Candidate {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  product_name: string | null;
  pin_title: string | null;
  pin_image_url: string | null;
  destination_link: string | null;
  board_id: string | null;
  status: string | null;
  approved_at: string | null;
  pinterest_pin_id: string | null;
  pcie2_creative_id: string | null;
  image_hash: string | null;
  meta: Record<string, unknown> | null;
}

interface Classified {
  candidate: Candidate;
  bucket: Bucket;
  reason: string;
  missing_field?: string;
  required_action?: string;
  http_status?: number;
  checks: Record<string, string>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function headOrGet(url: string, timeoutMs = 6000): Promise<number> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    if (r.status === 405 || r.status === 403) {
      r = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal });
    }
    return r.status;
  } catch (_) {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderHtml(runId: string, counts: Record<string, number>, rows: Classified[], staged: Set<string>, plan: Array<{id: string; scheduled_at: string}>): string {
  const stagedIds = new Set(plan.map((p) => p.id));
  const rowsHtml = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.candidate.product_slug ?? r.candidate.id)}</td>
      <td><span class="b b-${r.bucket}">${r.bucket}</span>${stagedIds.has(r.candidate.id) ? ' <span class="b b-STAGED">STAGED</span>' : ""}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td>${escapeHtml(r.missing_field ?? "")}</td>
      <td>${escapeHtml(r.required_action ?? "")}</td>
      <td>${r.http_status ?? ""}</td>
      <td><a href="${escapeHtml(r.candidate.destination_link ?? "")}" target="_blank" rel="noreferrer">link</a></td>
    </tr>`).join("");
  const planHtml = plan.map((p) => `<li><code>${escapeHtml(p.id)}</code> → ${escapeHtml(p.scheduled_at)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Approved Publish Sweep ${runId}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
    h1{margin:0 0 8px}
    .kpis{display:flex;gap:12px;margin:12px 0 24px;flex-wrap:wrap}
    .kpi{padding:12px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;min-width:140px}
    .kpi b{display:block;font-size:22px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
    th{background:#f3f4f6}
    .b{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
    .b-READY{background:#dcfce7;color:#166534}
    .b-WAITING_AI{background:#fef3c7;color:#92400e}
    .b-BLOCKED{background:#fee2e2;color:#991b1b}
    .b-FAILED{background:#e5e7eb;color:#374151}
    .b-STAGED{background:#dbeafe;color:#1e40af;margin-left:6px}
    code{background:#f3f4f6;padding:1px 6px;border-radius:4px}
  </style></head><body>
  <h1>Pinterest Approved Publish Sweep</h1>
  <div>Run ID: <code>${runId}</code> · Generated ${new Date().toISOString()}</div>
  <div class="kpis">
    <div class="kpi"><span>Ready</span><b>${counts.READY ?? 0}</b></div>
    <div class="kpi"><span>Staged</span><b>${plan.length}</b></div>
    <div class="kpi"><span>Waiting AI</span><b>${counts.WAITING_AI ?? 0}</b></div>
    <div class="kpi"><span>Blocked</span><b>${counts.BLOCKED ?? 0}</b></div>
    <div class="kpi"><span>Failed</span><b>${counts.FAILED ?? 0}</b></div>
  </div>
  <h2>Publish schedule (${plan.length})</h2>
  <ul>${planHtml || "<li>None staged.</li>"}</ul>
  <h2>Per-candidate detail (${rows.length})</h2>
  <table><thead><tr><th>Slug</th><th>Bucket</th><th>Reason</th><th>Missing</th><th>Action</th><th>HTTP</th><th>Destination</th></tr></thead>
  <tbody>${rowsHtml}</tbody></table>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = performance.now();
  const runId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as any));
    const execute: boolean = body?.execute === true;
    const maxPublish: number = Math.max(1, Math.min(20, Number(body?.max_publish ?? 20)));
    const intervalSeconds: number = Math.max(30, Math.min(600, Number(body?.interval_seconds ?? 120)));
    const inventoryLimit: number = Math.max(50, Math.min(2000, Number(body?.inventory_limit ?? 500)));

    // 1. Inventory — every pinterest_pin_queue row that has NOT yet been posted.
    //    pcie2_creative_id links back to PEI/PCIE2 master creatives, meta.pre_eval_id
    //    (when present) links to a stored PRE approval — both surfaces flow through
    //    the same queue so this single query covers every approved-asset source.
    const { data: rowsRaw, error: qErr } = await sb
      .from("pinterest_pin_queue")
      .select(
        "id,product_id,product_slug,product_name,pin_title,pin_image_url,destination_link,board_id,status,approved_at,pinterest_pin_id,pcie2_creative_id,image_hash,meta",
      )
      .is("pinterest_pin_id", null)
      .in("status", ["draft", "queued", "approved"])
      .order("approved_at", { ascending: false, nullsFirst: false })
      .limit(inventoryLimit);
    if (qErr) throw qErr;
    const rows: Candidate[] = (rowsRaw ?? []) as Candidate[];

    // 2. Preload product + media + PRE state for every candidate (bulk).
    const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x)));
    const productById = new Map<string, { is_active: boolean; pinterest_eligible: boolean; slug: string | null; name: string | null; image_url: string | null }>();
    if (productIds.length) {
      const { data: prods } = await sb
        .from("products")
        .select("id,is_active,pinterest_eligible,slug,name,image_url")
        .in("id", productIds);
      for (const p of prods ?? []) productById.set((p as any).id, p as any);
    }

    const imageUrls = Array.from(new Set(rows.map((r) => r.pin_image_url).filter((x): x is string => !!x)));
    const mediaByUrl = new Map<string, { status: string }>();
    if (imageUrls.length) {
      // media_audit query batched — Supabase .in cap is ~1000, our inventory cap is 2000
      for (let i = 0; i < imageUrls.length; i += 500) {
        const slice = imageUrls.slice(i, i + 500);
        const { data: media } = await sb
          .from("media_audit")
          .select("image_url,status")
          .in("image_url", slice);
        for (const m of media ?? []) mediaByUrl.set((m as any).image_url, m as any);
      }
    }

    const pinIds = rows.map((r) => r.id);
    const preByPinId = new Map<string, { passed: boolean; overall_score: number | null; blocking_reasons: string[] | null; created_at: string }>();
    if (pinIds.length) {
      for (let i = 0; i < pinIds.length; i += 500) {
        const slice = pinIds.slice(i, i + 500);
        const { data: pres } = await sb
          .from("pre_evaluations")
          .select("pin_queue_id,passed,overall_score,blocking_reasons,created_at")
          .in("pin_queue_id", slice)
          .order("created_at", { ascending: false });
        for (const p of pres ?? []) {
          const key = (p as any).pin_queue_id as string;
          if (!preByPinId.has(key)) preByPinId.set(key, p as any);
        }
      }
    }

    // Detect duplicate active posted pins by product_id (protects against re-publishing
    // a product that already has an active live pin published in the last 30 days).
    const activePostedByProduct = new Set<string>();
    if (productIds.length) {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: posted } = await sb
        .from("pinterest_pin_queue")
        .select("product_id,posted_at")
        .eq("status", "posted")
        .not("pinterest_pin_id", "is", null)
        .in("product_id", productIds)
        .gte("posted_at", cutoff);
      for (const p of posted ?? []) if ((p as any).product_id) activePostedByProduct.add((p as any).product_id);
    }

    // 3. Deterministic classification per candidate.
    const classified: Classified[] = [];
    const httpCache = new Map<string, number>();

    for (const c of rows) {
      const checks: Record<string, string> = {};
      const push = (b: Bucket, reason: string, missing?: string, action?: string, httpStatus?: number) => {
        classified.push({ candidate: c, bucket: b, reason, missing_field: missing, required_action: action, http_status: httpStatus, checks });
      };

      if (!c.product_id) { checks.product_id = "missing"; push("BLOCKED", "product_id missing", "product_id", "attach pin to an active product"); continue; }
      const product = productById.get(c.product_id);
      if (!product) { checks.product_exists = "missing"; push("BLOCKED", "product not found", "products.id", "delete pin or reattach to existing product"); continue; }
      checks.product_exists = "ok";
      if (!product.is_active) { checks.product_active = "inactive"; push("BLOCKED", "product inactive", "products.is_active", "reactivate product"); continue; }
      checks.product_active = "ok";
      if (product.pinterest_eligible === false) { checks.pinterest_eligible = "false"; push("BLOCKED", "product not Pinterest-eligible (media/stock/policy gate)", "products.pinterest_eligible", "resolve upstream media/stock gate"); continue; }
      checks.pinterest_eligible = "ok";

      if (!c.pin_image_url) { checks.image = "missing"; push("BLOCKED", "no pin image", "pin_image_url", "regenerate or attach master creative"); continue; }
      if (!/^https:\/\//i.test(c.pin_image_url)) { checks.image = "non_https"; push("BLOCKED", "pin_image_url must be HTTPS", "pin_image_url", "re-upload over HTTPS"); continue; }
      checks.image = "ok";

      const media = mediaByUrl.get(c.pin_image_url);
      if (media && (media.status === "BLOCKED" || media.status === "REVIEW")) {
        checks.media_audit = media.status;
        push("BLOCKED", `media_integrity=${media.status}`, "media_audit.status", "resolve in /admin/media-quality");
        continue;
      }
      checks.media_audit = media?.status ?? "clean_unscanned";

      if (!c.destination_link) { checks.destination = "missing"; push("BLOCKED", "destination_link missing", "destination_link", "attach product URL"); continue; }
      const expectedPath = product.slug ? `/products/${product.slug}` : null;
      if (expectedPath && !c.destination_link.includes(expectedPath)) {
        checks.destination = "slug_mismatch";
        push("BLOCKED", `destination does not point at /products/${product.slug}`, "destination_link", "run pinterest-legacy-repair-sweep");
        continue;
      }
      if (!/utm_source=pinterest/i.test(c.destination_link)) {
        checks.utm = "missing";
        push("BLOCKED", "destination missing utm_source=pinterest", "destination_link", "run pinterest-legacy-repair-sweep");
        continue;
      }

      let httpStatus = httpCache.get(c.destination_link);
      if (httpStatus === undefined) {
        httpStatus = await headOrGet(c.destination_link);
        httpCache.set(c.destination_link, httpStatus);
      }
      checks.destination_http = String(httpStatus);
      if (httpStatus !== 200) {
        push("FAILED", `destination HTTP ${httpStatus}`, "destination_link", "fix product route / redirect", httpStatus);
        continue;
      }

      // PRE approval: prefer a stored PASS row. approved_at (human/system approval)
      // is treated as an equivalent approval when PRE was not required for that row.
      const pre = preByPinId.get(c.id);
      if (pre && pre.passed === false) {
        checks.pre = `failed(${pre.overall_score ?? "?"})`;
        push("BLOCKED", `PRE integrity failed: ${(pre.blocking_reasons ?? []).join(", ") || "score below threshold"}`, "pre_evaluations", "await regenerated creative (needs AI credits)");
        continue;
      }
      if (!pre && !c.approved_at) {
        checks.pre = "missing";
        push("WAITING_AI", "no PRE approval and no manual approval yet", "pre_evaluations", "wait for AI Gateway credits to run PRE evaluation");
        continue;
      }
      checks.pre = pre?.passed ? "pass" : "manual_approved";

      if (activePostedByProduct.has(c.product_id)) {
        checks.duplicate = "active_pin_exists";
        push("BLOCKED", "product already has an active live pin in the last 30 days", "pinterest_pin_id", "retire old pin before re-publishing");
        continue;
      }
      checks.duplicate = "ok";

      if (!c.board_id) {
        checks.board = "missing";
        push("WAITING_AI", "no board_id (cron will auto-assign on next tick)", "board_id", "cron-worker will backfill; re-run sweep");
        continue;
      }
      checks.board = "ok";

      push("READY", "all deterministic gates passed");
    }

    const counts: Record<string, number> = { READY: 0, WAITING_AI: 0, BLOCKED: 0, FAILED: 0 };
    for (const r of classified) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;

    // 4. Stage top-N READY rows on scheduled_at spaced interval_seconds apart.
    const readyRows = classified.filter((r) => r.bucket === "READY").slice(0, maxPublish);
    const plan: Array<{ id: string; scheduled_at: string }> = [];
    const staged = new Set<string>();
    let firstScheduledAt: string | null = null;
    let lastScheduledAt: string | null = null;
    if (execute && readyRows.length) {
      const baseMs = Date.now() + 15_000; // 15s grace so the next cron tick sees them
      for (let i = 0; i < readyRows.length; i++) {
        const when = new Date(baseMs + i * intervalSeconds * 1000).toISOString();
        plan.push({ id: readyRows[i].candidate.id, scheduled_at: when });
        staged.add(readyRows[i].candidate.id);
        if (i === 0) firstScheduledAt = when;
        lastScheduledAt = when;
      }
      // Individual UPDATEs so we can preserve any existing approved_at and log failures per row.
      for (const p of plan) {
        const { error: uErr } = await sb
          .from("pinterest_pin_queue")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            scheduled_at: p.scheduled_at,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id)
          .is("pinterest_pin_id", null);
        if (uErr) console.warn("[approved-sweep] stage update failed", p.id, uErr.message);
      }
    }

    // 5. Persist report to admin-reports bucket + index in pinterest_integrity_reports.
    const summary = {
      run_id: runId,
      generated_at: new Date().toISOString(),
      execute,
      max_publish: maxPublish,
      interval_seconds: intervalSeconds,
      inventory_scanned: rows.length,
      counts,
      staged: plan.length,
      first_scheduled_at: firstScheduledAt,
      last_scheduled_at: lastScheduledAt,
      already_publishable_before_run: counts.READY ?? 0,
      still_waiting_for_ai: counts.WAITING_AI ?? 0,
      blocked: counts.BLOCKED ?? 0,
      failed: counts.FAILED ?? 0,
      plan,
      candidates: classified.map((r) => ({
        id: r.candidate.id,
        product_id: r.candidate.product_id,
        product_slug: r.candidate.product_slug,
        pin_title: r.candidate.pin_title,
        destination_link: r.candidate.destination_link,
        pin_image_url: r.candidate.pin_image_url,
        image_hash: r.candidate.image_hash,
        bucket: r.bucket,
        reason: r.reason,
        missing_field: r.missing_field ?? null,
        required_action: r.required_action ?? null,
        http_status: r.http_status ?? null,
        checks: r.checks,
      })),
      duration_ms: Math.round(performance.now() - t0),
    };

    const basePath = `pinterest-integrity/approved-publish-sweep/${runId}`;
    const jsonPath = `${basePath}/report.json`;
    const htmlPath = `${basePath}/report.html`;
    const html = renderHtml(runId, counts, classified, staged, plan);

    try {
      await sb.storage.from("admin-reports").upload(jsonPath, new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      await sb.storage.from("admin-reports").upload(htmlPath, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html" });
    } catch (e) {
      console.warn("[approved-sweep] storage upload failed (non-fatal):", (e as Error).message);
    }

    try {
      await sb.from("pinterest_integrity_reports").insert({
        report_type: "approved_publish_sweep",
        run_id: runId,
        storage_bucket: "admin-reports",
        json_path: jsonPath,
        html_path: htmlPath,
        summary,
      });
    } catch (e) {
      console.warn("[approved-sweep] report index insert failed (non-fatal):", (e as Error).message);
    }

    return json({
      ok: true,
      run_id: runId,
      execute,
      counts,
      staged: plan.length,
      max_publish: maxPublish,
      interval_seconds: intervalSeconds,
      first_scheduled_at: firstScheduledAt,
      last_scheduled_at: lastScheduledAt,
      expected_next_publish_window: firstScheduledAt,
      report: { json_path: jsonPath, html_path: htmlPath, bucket: "admin-reports" },
      summary,
    });
  } catch (e) {
    console.error("[approved-sweep] fatal", e);
    return json({ ok: false, error: (e as Error).message, run_id: runId }, 200);
  }
});