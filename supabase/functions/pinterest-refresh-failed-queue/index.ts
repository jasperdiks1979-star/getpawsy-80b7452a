// ─────────────────────────────────────────────────────────────────────────────
// pinterest-refresh-failed-queue
//
// One-click refresh for queued/draft pins that would fail the runtime QA gate
// with any of:
//   • supplier_image
//   • unreadable_text
//   • unreadable_overlay
//   • missing_cta
//
// For each failing pin we:
//   1. Re-rank by per-product performance (top performers first).
//   2. Invoke pinterest-creative-director (action=run_full, count=1) which
//      renders a NEW lifestyle Pinterest image (no supplier images, cat +
//      product visible, 1000×1500, readable overlay ≤6 words + GetPawsy
//      wordmark + CTA) and inserts it as a draft into pinterest_pin_queue.
//   3. Re-run runPinQa() (domination_mode=true) on the newly inserted draft
//      AND assert overlay carries a CTA from the approved list. Only the
//      drafts that PASS are kept; failing drafts are immediately rejected so
//      they cannot reach Pinterest.
//   4. The original failing row is marked status='rejected' with
//      rejection_reason='qa_failure_refresh' and the new row carries
//      replacement_for_pin_id → old id.
//   5. After processing, optionally invoke pinterest-cron-worker ONCE so the
//      next eligible refreshed pin publishes immediately (warm-up / per-cat
//      cap / governance still enforced by the worker itself — we never
//      bypass).
//
// Returns a structured report the admin UI renders verbatim.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { runPinQa, type PinQaInput, type PinQaReason } from "../_shared/pinterest-qa.ts";

type Json = Record<string, unknown>;

const TARGET_REASONS = new Set<PinQaReason>([
  "supplier_image",
  "unreadable_text",
  "unreadable_overlay",
  "missing_cta",
]);

const APPROVED_CTAS = [
  "Shop Now",
  "See Details",
  "Explore More",
  "Get Yours",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hasCta(overlay: string | null | undefined): boolean {
  if (!overlay) return false;
  const parts = overlay.split(/\s*[|•]\s*/u).map((p) => p.trim()).filter(Boolean);
  const cta = (parts[1] ?? parts[parts.length - 1] ?? "").toLowerCase();
  if (!cta || cta.length < 2) return false;
  // Approved CTA bank OR any short imperative ≤ 18 chars containing a verb.
  if (APPROVED_CTAS.some((c) => cta.includes(c.toLowerCase()))) return true;
  return cta.length <= 18 && /\b(shop|see|get|explore|try|grab|view|order|discover|find)\b/.test(cta);
}

function overlayWordCount(overlay: string | null | undefined): number {
  if (!overlay) return 0;
  const parts = overlay.split(/\s*[|•]\s*/u).map((p) => p.trim()).filter(Boolean);
  const top = parts[0] ?? "";
  return top.split(/\s+/).filter(Boolean).length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();

  let body: Json = {};
  if (req.method === "POST") {
    try { body = (await req.json()) as Json; } catch { /* empty body ok */ }
  }
  const limit = Math.max(1, Math.min(50, Number(body.limit ?? 10)));
  const dryRun = body.dry_run === true;
  const runCron = body.run_cron !== false; // default true

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Admin auth ────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return jsonResponse({ ok: false, traceId, message: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return jsonResponse({ ok: false, traceId, message: "forbidden_admin_only" }, 403);

  // ── 1. Snapshot the queued-total BEFORE we touch anything ────────────────
  const { count: beforeQueued } = await admin
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "draft"]);

  // ── 2. Pull queued/draft rows, run runPinQa, keep those failing on target
  //       reasons (supplier_image / unreadable_text / unreadable_overlay /
  //       missing_cta). Domination_mode=true so the allowlist gate doesn't
  //       mask real content failures.
  const SELECT_COLS = [
    "id", "product_id", "product_slug", "product_name",
    "board_id", "board_name", "category_key",
    "destination_link", "pin_image_url", "pin_title", "pin_description",
    "overlay_text", "hook_group", "status",
  ].join(", ");

  const { data: candidates, error: scanErr } = await admin
    .from("pinterest_pin_queue")
    .select(SELECT_COLS)
    .in("status", ["queued", "draft"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (scanErr) return jsonResponse({ ok: false, traceId, message: "scan_failed", error: scanErr.message }, 500);

  const failing: Array<{ row: any; reasons: PinQaReason[] }> = [];
  for (const row of candidates ?? []) {
    const reasons = runPinQa({
      product_slug: row.product_slug,
      product_name: row.product_name,
      pin_title: row.pin_title,
      pin_description: row.pin_description,
      pin_image_url: row.pin_image_url,
      destination_link: row.destination_link,
      board_name: row.board_name,
      category_key: row.category_key,
      overlay_text: row.overlay_text,
      domination_mode: true,
    } as PinQaInput);
    if (reasons.some((r) => TARGET_REASONS.has(r))) {
      failing.push({ row, reasons });
    }
  }

  // ── 3. Rank by per-product performance ───────────────────────────────────
  const productIds = Array.from(new Set(failing.map((f) => f.row.product_id).filter(Boolean))) as string[];
  const perfByProduct = new Map<string, number>();
  if (productIds.length) {
    const { data: perfRows } = await admin
      .from("pinterest_pin_performance")
      .select("product_id, impressions, clicks, performance_score")
      .in("product_id", productIds);
    for (const p of perfRows ?? []) {
      const score =
        Number((p as any).performance_score ?? 0) * 100 +
        Number((p as any).clicks ?? 0) * 10 +
        Number((p as any).impressions ?? 0);
      const pid = (p as any).product_id as string;
      perfByProduct.set(pid, Math.max(perfByProduct.get(pid) ?? 0, score));
    }
  }
  failing.sort((a, b) =>
    (perfByProduct.get(b.row.product_id ?? "") ?? 0) - (perfByProduct.get(a.row.product_id ?? "") ?? 0));

  const work = failing.slice(0, limit);

  // ── 4. For each failing pin, regenerate via creative-director, QA-gate
  //       the result, then archive the old row ────────────────────────────
  type ReportRow = {
    old_pin_id: string;
    new_pin_id: string | null;
    product_slug: string | null;
    board: string | null;
    qa_failures: PinQaReason[];
    post_qa_failures: PinQaReason[];
    extra_failures?: string[];
    status: "refreshed" | "passed_qa_no_requeue" | "regen_failed" | "still_failing" | "dry_run" | "skipped";
    reason?: string;
  };

  const report: ReportRow[] = [];
  let refreshed = 0, passedQa = 0, requeued = 0, stillFailing = 0;

  for (const { row, reasons } of work) {
    const base: ReportRow = {
      old_pin_id: row.id as string,
      new_pin_id: null,
      product_slug: row.product_slug as string | null,
      board: (row.board_name ?? row.board_id) as string | null,
      qa_failures: reasons,
      post_qa_failures: [],
      status: "skipped",
    };

    if (!row.product_id) {
      report.push({ ...base, status: "regen_failed", reason: "missing_product_id" });
      continue;
    }

    if (dryRun) {
      report.push({ ...base, status: "dry_run" });
      continue;
    }

    // 4a. Regenerate via creative-director (lifestyle AI render).
    let directorRes: any = null;
    try {
      const r = await admin.functions.invoke("pinterest-creative-director", {
        body: { action: "run_full", productId: row.product_id, count: 1, force: true },
      });
      if (r.error) throw new Error(r.error.message ?? String(r.error));
      directorRes = r.data;
    } catch (e) {
      report.push({ ...base, status: "regen_failed", reason: `director_invoke_failed:${(e as Error).message}` });
      continue;
    }

    const newDraftId: string | null =
      directorRes?.drafts?.[0]?.queueId ?? directorRes?.drafts?.[0]?.id ?? null;
    if (!newDraftId) {
      report.push({
        ...base,
        status: "regen_failed",
        reason: directorRes?.message ?? "director_no_draft_returned",
      });
      continue;
    }

    // 4b. Re-fetch the inserted row and run the same QA gate locally + our
    //     extra "≤ 6 word overlay + CTA from approved bank" rule.
    const { data: newRow, error: newErr } = await admin
      .from("pinterest_pin_queue")
      .select(SELECT_COLS)
      .eq("id", newDraftId)
      .maybeSingle();
    if (newErr || !newRow) {
      report.push({ ...base, new_pin_id: newDraftId, status: "regen_failed", reason: "newdraft_fetch_failed" });
      continue;
    }

    const postReasons = runPinQa({
      product_slug: newRow.product_slug,
      product_name: newRow.product_name,
      pin_title: newRow.pin_title,
      pin_description: newRow.pin_description,
      pin_image_url: newRow.pin_image_url,
      destination_link: newRow.destination_link,
      board_name: newRow.board_name,
      category_key: newRow.category_key,
      overlay_text: newRow.overlay_text,
      domination_mode: true,
    });
    const extra: string[] = [];
    if (!hasCta(newRow.overlay_text)) extra.push("cta_not_present");
    if (overlayWordCount(newRow.overlay_text) > 6) extra.push("overlay_too_long");
    // image_quality + destination_url_valid are already enforced by runPinQa
    // (low_resolution / bad_crop / wrong_destination_url / malformed_url).

    refreshed++;
    const passes = postReasons.length === 0 && extra.length === 0;

    if (!passes) {
      // Reject the freshly inserted draft so it cannot publish, leave the
      // original row alone so we can try again on the next run.
      await admin
        .from("pinterest_pin_queue")
        .update({
          status: "rejected",
          rejection_reason: "refresh_postqa_failed",
          qa_reasons: [...postReasons, ...extra],
        })
        .eq("id", newDraftId);
      stillFailing++;
      report.push({
        ...base,
        new_pin_id: newDraftId,
        post_qa_failures: postReasons,
        extra_failures: extra,
        status: "still_failing",
        reason: [...postReasons, ...extra].join(",") || "unknown",
      });
      continue;
    }

    passedQa++;

    // 4c. Stamp replacement_for_pin_id on the new row, link to original
    //     destination (already preserved by director — it always points at
    //     the same product_slug PDP).
    const { error: stampErr } = await admin
      .from("pinterest_pin_queue")
      .update({ replacement_for_pin_id: row.id })
      .eq("id", newDraftId);
    if (stampErr) {
      report.push({
        ...base,
        new_pin_id: newDraftId,
        post_qa_failures: [],
        status: "passed_qa_no_requeue",
        reason: `stamp_failed:${stampErr.message}`,
      });
      continue;
    }

    // 4d. Archive the failing original.
    const { error: archErr } = await admin
      .from("pinterest_pin_queue")
      .update({
        status: "rejected",
        rejection_reason: "qa_failure_refresh",
        qa_reasons: reasons,
      })
      .eq("id", row.id);
    if (archErr) {
      report.push({
        ...base,
        new_pin_id: newDraftId,
        post_qa_failures: [],
        status: "passed_qa_no_requeue",
        reason: `archive_failed:${archErr.message}`,
      });
      continue;
    }

    requeued++;
    report.push({
      ...base,
      new_pin_id: newDraftId,
      post_qa_failures: [],
      status: "refreshed",
    });
  }

  // ── 5. Trigger the real cron worker exactly once ─────────────────────────
  let cronResult: any = null;
  let publishedPinId: string | null = null;
  if (runCron && !dryRun) {
    try {
      const r = await admin.functions.invoke("pinterest-cron-worker", { body: {} });
      cronResult = r.data ?? { error: r.error?.message };
      const posted = (cronResult?.results || []).filter((x: any) => x.status === "posted");
      publishedPinId = posted[0]?.externalId ?? null;
    } catch (e) {
      cronResult = { ok: false, error: (e as Error).message };
    }
  }

  // ── 6. Snapshot the after-queued count for the report ───────────────────
  const { count: afterQueued } = await admin
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "draft"]);

  return jsonResponse({
    ok: true,
    traceId,
    dry_run: dryRun,
    target_reasons: Array.from(TARGET_REASONS),
    scanned: candidates?.length ?? 0,
    failing_total: failing.length,
    processed: work.length,
    refreshed,                       // pins regenerated (new draft inserted)
    passed_qa: passedQa,             // new drafts that passed runPinQa+CTA
    requeued,                        // new drafts kept + old archived
    still_failing: stillFailing,     // regenerated but still failing post-QA
    before_queued: beforeQueued ?? null,
    after_queued: afterQueued ?? null,
    cron_triggered: runCron && !dryRun,
    published_pin_id: publishedPinId,
    cron_result: cronResult,
    report,
    message:
      dryRun
        ? "dry_run_complete"
        : `refreshed=${refreshed} passed_qa=${passedQa} requeued=${requeued} still_failing=${stillFailing}`,
  });
});