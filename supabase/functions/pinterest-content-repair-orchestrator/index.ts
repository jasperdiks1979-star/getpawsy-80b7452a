// pinterest-content-repair-orchestrator
// Executes the approved 6-phase Pinterest content repair plan.
// Admin or service-role auth required. Returns full execution report.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// PDP rename map for Phase 3 (cat-scratcher products misnamed as sofas/mattresses)
const PDP_RENAMES: Array<{ old_slug: string; new_slug: string; name: string; category: string }> = [
  { old_slug: "the-versatile-accordion", new_slug: "versatile-accordion-cat-scratcher", name: "Versatile Accordion Cat Scratcher", category: "Cat Scratchers" },
  { old_slug: "c-sofa-bubble-fish-56",  new_slug: "bubble-fish-cat-scratcher-sofa", name: "Bubble Fish Cat Scratcher Sofa",   category: "Cat Scratchers" },
  { old_slug: "c-sofa-star-moon-56",    new_slug: "star-moon-cat-scratcher-sofa",  name: "Star Moon Cat Scratcher Sofa",    category: "Cat Scratchers" },
  { old_slug: "double-layer-sisal-mattress", new_slug: "double-layer-sisal-cat-scratcher", name: "Double-Layer Sisal Cat Scratcher", category: "Cat Scratchers" },
];

async function deletePinterestPin(token: string, pinId: string) {
  try {
    const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 204 || r.status === 404) return { ok: true, status: r.status };
    const body = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, body: { error: (e as Error).message } }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SR_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SB_URL, SR_KEY);

  // Auth: admin or service-role bearer
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authorized = false;
  if (bearer && bearer === SR_KEY) authorized = true;
  else if (bearer) {
    const { data: u } = await sb.auth.getUser(bearer);
    const uid = u?.user?.id;
    if (uid) {
      const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
      if (roleRow) authorized = true;
    }
  }
  if (!authorized) return json({ ok: false, message: "admin or service-role required" }, 401);

  const body: any = await req.json().catch(() => ({}));
  const dryRun = !!body?.dryRun;

  // Create run row
  const { data: runRow, error: runErr } = await sb.from("pinterest_repair_runs").insert({ status: dryRun ? "dry_run" : "running" }).select("id").single();
  if (runErr || !runRow) return json({ ok: false, message: runErr?.message || "failed to create run" }, 500);
  const runId = runRow.id as string;

  const report: any = { run_id: runId, dryRun, phase1: {}, phase2: {}, phase3: {}, phase4: {}, phase5: {}, phase6: {} };

  // Resolve Pinterest connection
  const { data: settings } = await sb.from("pinterest_runtime_settings").select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("access_token").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const token = conn?.access_token as string | undefined;

  try {
    // ─── PHASE 1: Delete 20 SAFE_TO_DELETE legacy pins ────────────────
    const { data: legacyRows } = await sb.from("pinterest_video_queue")
      .select("id, pin_id, asset_id, board_id, destination_url, status")
      .eq("status", "needs_recreation");
    const distinctLegacyPins = Array.from(new Set((legacyRows || []).map(r => r.pin_id).filter(Boolean) as string[]));
    const safeDeletePins: string[] = [];
    for (const pid of distinctLegacyPins) {
      const { data: m } = await sb.from("pinterest_video_metrics")
        .select("impressions, outbound_clicks")
        .eq("pin_id", pid).maybeSingle();
      const impressions = m?.impressions ?? 0;
      const clicks = m?.outbound_clicks ?? 0;
      if (impressions < 100 || clicks === 0) safeDeletePins.push(pid);
    }
    report.phase1.candidates = safeDeletePins.length;
    const phase1Results: any[] = [];
    if (!dryRun) {
      // Snapshot queue rows for rollback
      const snapRows = (legacyRows || []).filter(r => safeDeletePins.includes(r.pin_id as string))
        .map(r => ({ repair_run_id: runId, phase: "phase1", pin_id: r.pin_id, table_name: "pinterest_video_queue", row_snapshot: r }));
      if (snapRows.length) await sb.from("pinterest_repair_snapshots").insert(snapRows);
      // Delete on Pinterest + mark queue rows
      for (const pid of safeDeletePins) {
        let pinterestResult: any = { skipped: true };
        if (token) pinterestResult = await deletePinterestPin(token, pid);
        // Mark queue rows as 'deleted' (Phase 1 removes blockers)
        await sb.from("pinterest_video_queue").update({ status: "deleted", error_message: `legacy SAFE_TO_DELETE removed in repair ${runId}`, updated_at: new Date().toISOString() }).eq("pin_id", pid);
        // Clear audit repair_status
        await sb.from("content_product_audit_runs").update({ repair_status: "deleted_legacy" }).eq("pin_id", pid);
        phase1Results.push({ pin_id: pid, pinterest: pinterestResult });
        await new Promise(rs => setTimeout(rs, 80));
      }
    }
    report.phase1.results = phase1Results;
    report.phase1.deleted = phase1Results.filter(r => r.pinterest?.ok || r.pinterest?.skipped).length;

    // ─── PHASE 2: Recreate CONFIRMED_MISMATCH destination-hijack pins ─
    // Only pins where video_product_slug != linked_product_slug (true content hijacks).
    const { data: hijacks } = await sb.from("content_product_audit_runs")
      .select("id, pin_id, queue_id, asset_id, video_product_slug, linked_product_slug, destination_url")
      .eq("verdict", "CONFIRMED_MISMATCH");
    const trueHijacks = (hijacks || []).filter(r => r.video_product_slug && r.linked_product_slug && r.video_product_slug !== r.linked_product_slug);
    // Dedupe by pin_id
    const seenP2 = new Set<string>();
    const phase2Targets = trueHijacks.filter(r => { if (!r.pin_id || seenP2.has(r.pin_id)) return false; seenP2.add(r.pin_id); return true; });
    report.phase2.candidates = phase2Targets.length;
    const phase2Results: any[] = [];
    if (!dryRun) {
      for (const h of phase2Targets) {
        // Snapshot
        await sb.from("pinterest_repair_snapshots").insert({ repair_run_id: runId, phase: "phase2", pin_id: h.pin_id, table_name: "content_product_audit_runs", row_snapshot: h });
        // Delete incorrect pin on Pinterest
        let delRes: any = { skipped: true };
        if (token && h.pin_id) delRes = await deletePinterestPin(token, h.pin_id);
        // Mark old queue row deleted
        if (h.pin_id) await sb.from("pinterest_video_queue").update({ status: "deleted", error_message: `replaced (hijack repair ${runId})`, updated_at: new Date().toISOString() }).eq("pin_id", h.pin_id);
        // Fetch a board for the correct product's category
        const correctSlug = h.video_product_slug!;
        const { data: prod } = await sb.from("products").select("slug, name, category").eq("slug", correctSlug).maybeSingle();
        // Build new destination
        const newDest = `https://getpawsy.pet/products/${correctSlug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=integrity_repair`;
        const newTitle = prod?.name ? `${prod.name}` : `New arrival`;
        const newDesc = prod?.name ? `Discover ${prod.name}. Shop premium pet essentials at GetPawsy.` : `Discover premium pet essentials at GetPawsy.`;
        // Enqueue replacement (reuse original asset which contains correct video)
        const variationHash = `repair-${runId.slice(0,8)}-${h.pin_id}-${Date.now()}`;
        const { data: newQueue, error: qErr } = await sb.from("pinterest_video_queue").insert({
          asset_id: h.asset_id,
          status: "pending",
          destination_url: newDest,
          board_id: null,
          title: newTitle,
          description: newDesc,
          priority: 100,
          variation_hash: variationHash,
        }).select("id").maybeSingle();
        // Mark audit row repaired
        await sb.from("content_product_audit_runs").update({ repair_status: "recreated", repair_error: null }).eq("id", h.id);
        phase2Results.push({ old_pin_id: h.pin_id, deleted: delRes, new_queue_id: newQueue?.id || null, enqueue_error: qErr?.message || null, correct_slug: correctSlug, new_destination: newDest });
        await new Promise(rs => setTimeout(rs, 80));
      }
    }
    report.phase2.results = phase2Results;
    report.phase2.recreated = phase2Results.filter(r => r.new_queue_id).length;

    // ─── PHASE 3: PDP labeling drift renames ──────────────────────────
    const phase3Results: any[] = [];
    if (!dryRun) {
      for (const rn of PDP_RENAMES) {
        // Snapshot
        const { data: existing } = await sb.from("products").select("id, slug, name, category").eq("slug", rn.old_slug).maybeSingle();
        if (!existing) { phase3Results.push({ slug: rn.old_slug, skipped: "not_found" }); continue; }
        await sb.from("pinterest_repair_snapshots").insert({ repair_run_id: runId, phase: "phase3", table_name: "products", row_snapshot: existing });
        // Insert slug history for redirect
        await sb.from("product_slug_history").insert({ product_id: existing.id, old_slug: rn.old_slug, current_slug: rn.new_slug, reason: `repair ${runId}: PDP labeling drift correction` });
        // Apply rename
        const { error: updErr } = await sb.from("products").update({ slug: rn.new_slug, name: rn.name, category: rn.category }).eq("id", existing.id);
        // Mark any related audit rows as resolved by rename
        await sb.from("content_product_audit_runs").update({ repair_status: "renamed_pdp" })
          .or(`linked_product_slug.eq.${rn.old_slug},video_product_slug.eq.${rn.old_slug}`);
        phase3Results.push({ from: rn.old_slug, to: rn.new_slug, name: rn.name, category: rn.category, error: updErr?.message || null });
      }
    }
    report.phase3.results = phase3Results;
    report.phase3.renamed = phase3Results.filter(r => !r.error && !r.skipped).length;

    // ─── PHASE 4: Retry the single ERROR audit row ────────────────────
    const { data: errorRow } = await sb.from("content_product_audit_runs")
      .select("id, pin_id, asset_id, linked_product_slug, destination_url")
      .eq("verdict", "ERROR").order("created_at", { ascending: false }).limit(1).maybeSingle();
    let phase4Result: any = { skipped: !errorRow };
    if (errorRow && !dryRun) {
      let resolved = false;
      for (let attempt = 1; attempt <= 3 && !resolved; attempt++) {
        try {
          const r = await fetch(`${SB_URL}/functions/v1/pinterest-video-destination-audit`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SR_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ pin_id: errorRow.pin_id, retry: true }),
          });
          if (r.ok) { resolved = true; phase4Result = { pin_id: errorRow.pin_id, attempts: attempt, status: "reclassified" }; break; }
        } catch (e) { phase4Result = { pin_id: errorRow.pin_id, attempts: attempt, error: (e as Error).message }; }
        await new Promise(rs => setTimeout(rs, 500 * attempt));
      }
      if (!resolved) {
        await sb.from("content_product_audit_runs").update({ repair_status: "manual_review" }).eq("id", errorRow.id);
        phase4Result = { ...phase4Result, flagged_manual_review: true };
      }
    }
    report.phase4 = phase4Result;

    // ─── PHASE 5: Compute final mismatch state ────────────────────────
    // Flag any remaining unresolved CONFIRMED_MISMATCH (video content doesn't match destination but slugs match — e.g. self-mismatch)
    // as needs_manual_recreation so the dashboard surfaces them clearly.
    if (!dryRun) {
      await sb.from("content_product_audit_runs")
        .update({ repair_status: "needs_manual_recreation" })
        .eq("verdict", "CONFIRMED_MISMATCH")
        .is("repair_status", null);
    }
    const { count: finalMismatch } = await sb.from("content_product_audit_runs")
      .select("*", { count: "exact", head: true })
      .eq("verdict", "CONFIRMED_MISMATCH")
      .is("repair_status", null);
    const { count: finalError } = await sb.from("content_product_audit_runs")
      .select("*", { count: "exact", head: true })
      .eq("verdict", "ERROR")
      .is("repair_status", null);
    report.phase5 = { final_mismatch: finalMismatch ?? 0, final_error: finalError ?? 0 };

    // ─── PHASE 6: Resume growth engine ────────────────────────────────
    const phase6: any = {};
    if (!dryRun) {
      const { error: e1 } = await sb.from("pinterest_video_autopilot_settings").update({ enabled: true }).eq("id", 1);
      phase6.publisher_enabled = !e1;
      const { error: e2 } = await sb.from("cinematic_v3_dispatch_config").update({ enabled: true }).eq("id", true);
      phase6.dispatcher_enabled = !e2;
      const { count: queueCount } = await sb.from("pinterest_video_queue")
        .select("*", { count: "exact", head: true }).eq("status", "pending");
      phase6.pending_queue_size = queueCount ?? 0;
      phase6.queue_meets_min = (queueCount ?? 0) >= 10;
      const { count: stuckCount } = await sb.from("pinterest_video_queue")
        .select("*", { count: "exact", head: true }).in("status", ["processing", "failed"]);
      phase6.stuck_or_failed_jobs = stuckCount ?? 0;
    }
    report.phase6 = phase6;

    // Finalize run
    await sb.from("pinterest_repair_runs").update({
      status: "complete",
      phase1_deleted: report.phase1.deleted || 0,
      phase2_recreated: report.phase2.recreated || 0,
      phase3_renamed: report.phase3.renamed || 0,
      phase4_retried: phase4Result?.attempts || 0,
      phase5_final_mismatches: report.phase5.final_mismatch,
      phase5_final_errors: report.phase5.final_error,
      phase6_engines_enabled: phase6,
      report,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return json({ ok: true, run_id: runId, report });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("pinterest_repair_runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString(), report }).eq("id", runId);
    return json({ ok: false, run_id: runId, message: msg, partial_report: report }, 500);
  }
});