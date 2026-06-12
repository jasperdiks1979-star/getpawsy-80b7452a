// pinterest-diversity-cleanup-execute
// Executes the approved cleanup plan against the latest pinterest_protection_audit_runs:
//   SAFE_TO_REMOVE     -> archive immediately (DELETE on Pinterest + mark queue rejected)
//   REPLACE_FIRST      -> queue 5 diverse replacement drafts per pin via creative-director,
//                         log a replacement job, DO NOT archive original yet
//   UNKNOWN_NO_ANALYTICS -> keep live, schedule a 30-day recheck flag
//   REVIEW             -> untouched
// Then computes diversity scores from OCR cache (board / category / product) and
// writes a single pinterest_diversity_cleanup_runs row with before/after scores.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BANNED_PHRASES = [
  "stop scooping every day",
  "stop scooping",
  "tired of",
  "see how",
  "scooping?",
];
const OVERLAY_REUSE_CAP = 5;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function firstLine(text: string | null | undefined): string {
  if (!text) return "";
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && l.length <= 80);
  return (lines[0] || "").toLowerCase();
}

function diversityScore(unique: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((unique / total) * 1000) / 10; // 0-100, 1 decimal
}

async function adminAuth(req: Request, sb: any): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "");
  // Service-role JWT bypass (server-to-server invocations)
  if (token === SERVICE_KEY) return "service-role";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const { data: roleRow } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  return roleRow ? user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const body = await req.json().catch(() => ({}));
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const provided = req.headers.get("x-internal-secret") || req.headers.get("x-cron-secret");
  const isInternal = body?.trigger === "cron" && internalSecret && provided === internalSecret;
  if (!isInternal) {
    const uid = await adminAuth(req, sb);
    if (!uid) return json({ ok: false, message: "admin only" }, 403);
  }

  const dryRun = !!body?.dryRun;
  const safeLimit = Number(body?.safeLimit) || 300; // delete budget per invocation
  const replaceLimit = Number(body?.replaceLimit) || 10;

  // 1. Load latest protection audit
  const { data: lastRun } = await sb
    .from("pinterest_protection_audit_runs")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastRun) return json({ ok: false, message: "no protection audit run found" }, 412);

  // 36h freshness gate
  const ageH = (Date.now() - new Date(lastRun.created_at).getTime()) / 3_600_000;
  if (ageH > 36) return json({ ok: false, message: `protection audit stale (${ageH.toFixed(1)}h) — re-run protection first` }, 412);

  // 2. Open cleanup run
  const { data: runRow, error: runErr } = await sb
    .from("pinterest_diversity_cleanup_runs")
    .insert({ status: dryRun ? "dry_run" : "running", protection_run_id: lastRun.id })
    .select()
    .single();
  if (runErr || !runRow) return json({ ok: false, message: runErr?.message || "failed to open run" }, 500);
  const runId = runRow.id;

  try {
    // 3. Pull bucketed pins
    const { data: pins } = await sb
      .from("pinterest_protection_audit_pins")
      .select("queue_id, pinterest_pin_id, bucket, product_slug, board_name, overlay_text, impressions")
      .eq("run_id", lastRun.id)
      .order("impressions", { ascending: true })
      .limit(5000);
    const all = pins || [];
    // Skip queue rows already archived by a previous cleanup pass
    const safeAll = all.filter((p) => p.bucket === "SAFE_TO_REMOVE" && p.queue_id);
    const safeIds = safeAll.map((p) => p.queue_id);
    const { data: already } = await sb
      .from("pinterest_pin_queue")
      .select("id, status, rejection_reason")
      .in("id", safeIds.slice(0, 1000));
    const archivedSet = new Set(
      (already || [])
        .filter((q: any) => q.status === "rejected" && q.rejection_reason === "diversity_cleanup_safe_remove")
        .map((q: any) => q.id),
    );
    const safe = safeAll.filter((p) => !archivedSet.has(p.queue_id)).slice(0, safeLimit);
    const replace = all.filter((p) => p.bucket === "REPLACE_FIRST").slice(0, replaceLimit);
    const unknown = all.filter((p) => p.bucket === "UNKNOWN_NO_ANALYTICS");
    const review = all.filter((p) => p.bucket === "REVIEW");
    const keep = all.filter((p) => p.bucket === "KEEP");

    // 4. Compute diversity score BEFORE
    const beforeScore = await computeDiversityScore(sb, null);

    // 5. SAFE_TO_REMOVE → archive immediately
    let archived = 0;
    let impressionsRemoved = 0;
    const safeWithPin = safe.filter((p) => p.pinterest_pin_id);
    if (!dryRun && safeWithPin.length > 0) {
      // Get token
      const { data: settings } = await sb.from("pinterest_runtime_settings")
        .select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
      let connQ = sb.from("pinterest_connection").select("access_token").eq("status", "connected");
      if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
      const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const token = conn?.access_token as string | undefined;
      if (token) {
        const CONC = 4;
        let cursor = 0;
        const successQueueIds: string[] = [];
        async function worker() {
          while (cursor < safeWithPin.length) {
            const idx = cursor++;
            const p = safeWithPin[idx];
            try {
              const r = await fetch(`https://api.pinterest.com/v5/pins/${p.pinterest_pin_id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (r.status === 204 || r.status === 404) {
                archived++;
                impressionsRemoved += p.impressions || 0;
                if (p.queue_id) successQueueIds.push(p.queue_id);
              }
            } catch (_e) { /* swallow */ }
            await new Promise((rs) => setTimeout(rs, 80));
          }
        }
        await Promise.all(Array.from({ length: CONC }, worker));
        if (successQueueIds.length > 0) {
          // Update in chunks of 200 to avoid query size issues
          for (let i = 0; i < successQueueIds.length; i += 200) {
            await sb.from("pinterest_pin_queue")
              .update({ status: "rejected", rejection_reason: "diversity_cleanup_safe_remove", updated_at: new Date().toISOString() })
              .in("id", successQueueIds.slice(i, i + 200));
          }
        }
      }
    }

    // 6. REPLACE_FIRST → queue 5 diverse drafts per pin via creative-director
    let replacedCount = 0;
    let draftsCount = 0;
    let impressionsPreserved = 0;
    for (const p of replace) {
      impressionsPreserved += p.impressions || 0;
      if (dryRun) continue;
      if (!p.product_slug) continue;
      let draftIds: string[] = [];
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({
            action: "run_full",
            slug: p.product_slug,
            count: 5,
            diversify: true,
            avoid_overlays: BANNED_PHRASES.concat(p.overlay_text ? [String(p.overlay_text).toLowerCase()] : []),
          }),
        });
        const j = await resp.json().catch(() => ({}));
        draftIds = (j?.draft_ids || j?.drafts?.map((d: any) => d.id) || []).filter(Boolean);
      } catch (_e) { /* swallow */ }
      draftsCount += draftIds.length;
      if (draftIds.length > 0) replacedCount++;
      await sb.from("pinterest_overlay_replacement_jobs").insert({
        run_id: runId,
        legacy_queue_id: p.queue_id,
        legacy_pinterest_pin_id: p.pinterest_pin_id,
        legacy_overlay: p.overlay_text,
        product_slug: p.product_slug,
        board_name: p.board_name,
        replacement_count: draftIds.length,
        replacement_draft_ids: draftIds,
        status: draftIds.length > 0 ? "pending_indexing" : "draft_generation_failed",
      });
    }

    // 7. UNKNOWN_NO_ANALYTICS → 30-day recheck flag
    if (!dryRun && unknown.length > 0) {
      const recheckAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const ids = unknown.map((p) => p.queue_id).filter(Boolean);
      for (let i = 0; i < ids.length; i += 200) {
        await sb.from("pinterest_pin_queue")
          .update({ meta_recheck_at: recheckAt } as any)
          .in("id", ids.slice(i, i + 200))
          .then(() => {})
          .catch(() => {}); // column optional; ignore if missing
      }
    }

    // 8. Diversity score AFTER (recompute excluding archived queue rows)
    const afterScore = await computeDiversityScore(sb, runId);

    // 9. Banned-phrase residual check
    const bannedHits: Record<string, number> = {};
    for (const phrase of BANNED_PHRASES) {
      const { count } = await sb
        .from("pinterest_pin_ocr_cache")
        .select("pin_id", { count: "exact", head: true })
        .ilike("ocr_text", `%${phrase}%`);
      bannedHits[phrase] = count || 0;
    }

    // Pull overused overlay summary from scores written into pinterest_diversity_scores
    const { data: overused } = await sb
      .from("pinterest_diversity_scores")
      .select("dimension, dimension_value, top_overlay, top_overlay_count")
      .eq("run_id", runId)
      .gte("top_overlay_count", OVERLAY_REUSE_CAP)
      .order("top_overlay_count", { ascending: false })
      .limit(50);

    await sb.from("pinterest_diversity_cleanup_runs").update({
      status: dryRun ? "dry_run_complete" : "complete",
      finished_at: new Date().toISOString(),
      pins_scanned: all.length,
      pins_archived: archived,
      pins_replaced: replacedCount,
      pins_kept: keep.length + unknown.length,
      pins_review: review.length,
      replacement_drafts: draftsCount,
      impressions_removed: impressionsRemoved,
      impressions_preserved: impressionsPreserved,
      diversity_score_before: beforeScore.score,
      diversity_score_after: afterScore.score,
      overused_overlays: overused || [],
      banned_phrase_hits: bannedHits,
    }).eq("id", runId);

    return json({
      ok: true,
      runId,
      dryRun,
      pins_scanned: all.length,
      pins_archived: archived,
      pins_replaced: replacedCount,
      replacement_drafts: draftsCount,
      pins_kept: keep.length + unknown.length,
      pins_review: review.length,
      impressions_removed: impressionsRemoved,
      impressions_preserved: impressionsPreserved,
      diversity_score_before: beforeScore.score,
      diversity_score_after: afterScore.score,
      banned_phrase_hits: bannedHits,
      overused_overlays_count: overused?.length || 0,
    });
  } catch (e) {
    await sb.from("pinterest_diversity_cleanup_runs").update({
      status: "error",
      finished_at: new Date().toISOString(),
      error: (e as Error).message,
    }).eq("id", runId);
    return json({ ok: false, runId, error: (e as Error).message }, 500);
  }
});

/** Compute diversity scores from OCR cache for currently-live (status=posted) pins.
 *  Persists per-board / per-product / per-category rows when runId provided. */
async function computeDiversityScore(sb: any, runId: string | null) {
  // Join OCR cache to live queue rows
  const { data: live } = await sb
    .from("pinterest_pin_queue")
    .select("id, board_name, product_slug, pinterest_pin_id, pinterest_pin_ocr_cache!inner(ocr_text)")
    .eq("status", "posted")
    .not("pinterest_pin_id", "is", null)
    .limit(5000);
  const rows = (live || []) as any[];

  // Build dimension buckets → overlay frequency
  const globalFreq = new Map<string, number>();
  const buckets: Record<string, Map<string, Map<string, number>>> = {
    board: new Map(),
    product: new Map(),
  };

  for (const r of rows) {
    const ocr = r.pinterest_pin_ocr_cache?.ocr_text || "";
    const overlay = firstLine(ocr);
    if (!overlay) continue;
    globalFreq.set(overlay, (globalFreq.get(overlay) || 0) + 1);
    const board = r.board_name || "(none)";
    const product = r.product_slug || "(none)";
    if (!buckets.board.has(board)) buckets.board.set(board, new Map());
    if (!buckets.product.has(product)) buckets.product.set(product, new Map());
    const bm = buckets.board.get(board)!;
    bm.set(overlay, (bm.get(overlay) || 0) + 1);
    const pm = buckets.product.get(product)!;
    pm.set(overlay, (pm.get(overlay) || 0) + 1);
  }

  const totalPins = rows.length;
  const uniqueOverlays = globalFreq.size;
  const score = diversityScore(uniqueOverlays, totalPins);

  if (runId) {
    const inserts: any[] = [];
    for (const [dim, map] of Object.entries(buckets)) {
      for (const [val, freq] of map.entries()) {
        const pinCount = Array.from(freq.values()).reduce((a, b) => a + b, 0);
        const unique = freq.size;
        let topOverlay = "";
        let topCount = 0;
        for (const [k, c] of freq.entries()) {
          if (c > topCount) { topCount = c; topOverlay = k; }
        }
        inserts.push({
          run_id: runId,
          dimension: dim,
          dimension_value: val,
          pin_count: pinCount,
          unique_overlay_count: unique,
          diversity_score: diversityScore(unique, pinCount),
          top_overlay: topOverlay,
          top_overlay_count: topCount,
        });
      }
    }
    // overall row
    let topOverlay = ""; let topCount = 0;
    for (const [k, c] of globalFreq.entries()) {
      if (c > topCount) { topCount = c; topOverlay = k; }
    }
    inserts.push({
      run_id: runId,
      dimension: "overall",
      dimension_value: "*",
      pin_count: totalPins,
      unique_overlay_count: uniqueOverlays,
      diversity_score: score,
      top_overlay: topOverlay,
      top_overlay_count: topCount,
    });
    for (let i = 0; i < inserts.length; i += 200) {
      await sb.from("pinterest_diversity_scores").insert(inserts.slice(i, i + 200));
    }
  }

  return { score, totalPins, uniqueOverlays };
}