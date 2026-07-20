import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { runPinQa } from "../_shared/pinterest-qa.ts";
import {
  collectPinterestBannedCopyHits,
  pickSafePinterestOverlay,
  rejectReasonForBannedCopy,
  sanitizePinterestBannedCopy,
} from "../_shared/pinterest-banned-copy.ts";

type Json = Record<string, unknown>;

const ACTIVE_STATUSES = ["queued", "draft", "approved", "publishing"];
const REFRESH_STATUSES = [...ACTIVE_STATUSES, "failed", "skipped"];
const TARGET_REASONS = new Set(["supplier_image", "unreadable_text", "unreadable_overlay", "missing_cta", "weak_hook", "wrong_destination_url", "banned_phrase_leak"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function destinationFor(row: any): string {
  const slug = String(row.product_slug || "").trim();
  return slug
    ? `https://getpawsy.pet/products/${slug}?utm_source=pinterest&utm_medium=social&utm_campaign=refresh_failed_queue&utm_content=${slug}`
    : String(row.destination_link || "");
}

async function countCleanQueued(admin: any): Promise<number> {
  const { data } = await admin.from("pinterest_pin_queue").select("*").eq("status", "queued").limit(1000);
  return (data || []).filter((row: any) => runPinQa({ ...row, domination_mode: true }).length === 0 && collectPinterestBannedCopyHits(row).length === 0).length;
}

async function nextCleanQueued(admin: any): Promise<any | null> {
  const { data } = await admin
    .from("pinterest_pin_queue")
    .select("id, product_slug, board_id, scheduled_at, pin_title, overlay_text, destination_link, us_audience_score")
    .eq("status", "queued")
    .not("approved_at", "is", null)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(25);
  return (data || []).find((row: any) => runPinQa({ ...row, domination_mode: true }).length === 0 && collectPinterestBannedCopyHits(row).length === 0) || null;
}

async function handle(req: Request, traceId: string) {
  let body: Json = {};
  if (req.method === "POST") {
    try { body = (await req.json()) as Json; } catch { body = {}; }
  }
  const limit = Math.max(1, Math.min(100, Number(body.limit ?? 25)));
  const dryRun = body.dry_run === true;
  const runCron = body.run_cron !== false;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return jsonResponse({ ok: false, traceId, message: "backend_config_missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return jsonResponse({ ok: false, traceId, message: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return jsonResponse({ ok: false, traceId, message: "forbidden_admin_only" }, 403);

  const { count: beforeQueued } = await admin.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "queued");
  const { data: rows, error: scanErr } = await admin.from("pinterest_pin_queue").select("*").in("status", REFRESH_STATUSES).order("created_at", { ascending: false }).limit(750);
  if (scanErr) throw new Error(`scan_failed:${scanErr.message}`);

  const dirtyActive = (rows || []).filter((row: any) => ACTIVE_STATUSES.includes(row.status) && collectPinterestBannedCopyHits(row).length > 0);
  const qaFailing = (rows || []).map((row: any) => ({ row, reasons: runPinQa({ ...row, domination_mode: true }) }))
    .filter(({ reasons }: any) => reasons.some((reason: string) => TARGET_REASONS.has(reason)))
    .slice(0, limit);
  const work = Array.from(new Map([...dirtyActive.map((row: any) => ({ row, reasons: ["banned_phrase_leak"] })), ...qaFailing].map((item: any) => [item.row.id, item])).values()).slice(0, limit);

  const report: any[] = [];
  let repaired = 0;
  let passedQa = 0;
  let requeued = 0;
  let rejected = 0;
  let stillFailing = 0;

  for (const item of work) {
    const row = { ...item.row };
    const beforeReasons = Array.from(new Set([...(item.reasons || []), ...runPinQa({ ...row, domination_mode: true })]));
    const bannedHits = collectPinterestBannedCopyHits(row);
    const fixes: string[] = [];

    row.overlay_text = pickSafePinterestOverlay(row.product_slug, row.category_key, row.id);
    fixes.push("overlay_rewritten");
    row.pin_title = sanitizePinterestBannedCopy(row.pin_title || row.product_name || row.overlay_text, row.overlay_text).slice(0, 100);
    row.pin_description = sanitizePinterestBannedCopy(row.pin_description || `${row.product_name || "Pet upgrade"} for modern pet homes.`, `${row.overlay_text}. Free US shipping.`).slice(0, 500);
    if (!row.destination_link || beforeReasons.includes("wrong_destination_url")) {
      row.destination_link = destinationFor(row);
      fixes.push("destination_rewritten");
    }
    if (row.meta && typeof row.meta === "object") {
      row.meta = { ...row.meta, prompt: null, image_prompt: null, generated_image_prompt: null, image_alt: sanitizePinterestBannedCopy((row.meta as any).image_alt || row.pin_title, row.pin_title), cta: "Shop Now" };
      fixes.push("metadata_cleaned");
    }

    const afterReasons = runPinQa({ ...row, domination_mode: true });
    const afterBanned = collectPinterestBannedCopyHits(row);
    const passes = afterReasons.length === 0 && afterBanned.length === 0;

    if (dryRun) {
      report.push({ id: row.id, product_slug: row.product_slug, status: "dry_run", fixes, qa_failures: beforeReasons, post_qa_failures: afterReasons, banned_hits: bannedHits });
      continue;
    }

    if (passes) {
      const { error } = await admin.from("pinterest_pin_queue").update({
        overlay_text: row.overlay_text,
        pin_title: row.pin_title,
        pin_description: row.pin_description,
        destination_link: row.destination_link,
        meta: row.meta,
        status: "queued",
        approved_at: row.approved_at || new Date().toISOString(),
        scheduled_at: row.scheduled_at && row.scheduled_at > new Date().toISOString() ? row.scheduled_at : new Date().toISOString(),
        qa_reasons: [],
        rejection_reason: null,
        error_message: null,
        last_publish_error: null,
        publishing_started_at: null,
        us_audience_score: row.us_audience_score ?? 1.0,
      }).eq("id", row.id);
      if (error) throw new Error(`repair_update_failed:${row.id}:${error.message}`);
      repaired++;
      passedQa++;
      requeued++;
      report.push({ id: row.id, product_slug: row.product_slug, status: "requeued", fixes, qa_failures: beforeReasons, post_qa_failures: [] });
    } else {
      const reason = afterBanned.length > 0 ? "banned_phrase_leak" : afterReasons.join(",") || "refresh_postqa_failed";
      await admin.from("pinterest_pin_queue").update({
        overlay_text: row.overlay_text,
        pin_title: row.pin_title,
        pin_description: row.pin_description,
        destination_link: row.destination_link,
        meta: row.meta,
        status: "rejected",
        rejection_reason: afterBanned.length > 0 ? "banned_phrase_leak" : reason,
        qa_reasons: afterBanned.length > 0 ? ["banned_phrase_leak"] : afterReasons,
        error_message: afterBanned.length > 0 ? rejectReasonForBannedCopy(afterBanned) : `QA gate: ${reason}`,
        publishing_started_at: null,
      }).eq("id", row.id);
      rejected++;
      stillFailing++;
      report.push({ id: row.id, product_slug: row.product_slug, status: "rejected", fixes, qa_failures: beforeReasons, post_qa_failures: afterReasons, banned_hits: afterBanned, reason });
    }
  }

  let cronResult: any = null;
  let publishedPinId: string | null = null;
  if (runCron && !dryRun) {
    try {
      const r = await admin.functions.invoke("pinterest-cron-worker", { body: {} });
      cronResult = r.data ?? { ok: false, error: r.error?.message || null };
      const posted = (cronResult?.results || []).filter((x: any) => x.status === "posted");
      publishedPinId = posted[0]?.externalId ?? null;
    } catch (e) {
      cronResult = { ok: false, error: (e as Error).message };
    }
  }

  const { count: afterQueued } = await admin.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "queued");
  const currentQueuedCleanRows = await countCleanQueued(admin);
  const nextEligibleCleanPin = await nextCleanQueued(admin);
  const { data: lastRefreshError } = await admin.from("pinterest_post_logs").select("created_at,error_message,response_data").eq("action", "refresh_failed_queue").eq("status", "error").order("created_at", { ascending: false }).limit(1).maybeSingle();

  return jsonResponse({
    ok: true,
    traceId,
    dry_run: dryRun,
    scanned: rows?.length ?? 0,
    banned_phrase_rows_found: dirtyActive.length,
    failing_total: work.length,
    processed: work.length,
    refreshed: repaired,
    repaired,
    passed_qa: passedQa,
    requeued,
    rejected,
    still_failing: stillFailing,
    before_queued: beforeQueued ?? null,
    after_queued: afterQueued ?? null,
    current_queued_clean_rows: currentQueuedCleanRows,
    next_eligible_clean_pin: nextEligibleCleanPin,
    last_refresh_failed_queue_error: lastRefreshError || null,
    cron_triggered: runCron && !dryRun,
    published_pin_id: publishedPinId,
    cron_result: cronResult,
    report,
    message: dryRun ? "dry_run_complete" : `repaired=${repaired} requeued=${requeued} rejected=${rejected}`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    return await handle(req, traceId);
  } catch (e) {
    const error_message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : null;
    console.error("[refresh_failed_queue]", JSON.stringify({ traceId, error_message, stack }));
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("pinterest_post_logs").insert({ action: "refresh_failed_queue", status: "error", error_message, response_data: { traceId, stack, scanned: 0, repaired: 0, rejected: 0 } });
    } catch { /* keep handled errors as HTTP 200 */ }
    return jsonResponse({ ok: false, traceId, action: "refresh_failed_queue", error_message, stack, scanned: 0, repaired: 0, rejected: 0 }, 200);
  }
});