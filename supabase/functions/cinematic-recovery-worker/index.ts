/**
 * Cinematic Recovery Worker
 * ─────────────────────────────────────────────────────────────────────
 * One-shot remediation pass for cinematic_ad_jobs / cinematic_v3_jobs
 * that were poisoned by:
 *
 *   1. The legacy DEFAULT_VO litter-box fallback ("Tired of scooping
 *      every day…") leaking onto non-litter products.
 *   2. The retired `trim-cinematic-ad` GitHub workflow leaving jobs
 *      stuck on `auto_trim_dispatch_failed` / `trim_workflow_deprecated_*`.
 *
 * For every affected row this worker:
 *   - Preserves any successful video asset (output_mp4_url / final_mp4_url).
 *   - Clears the bad voiceover_url + vo_script so the next prepare run
 *     regenerates them with product-aware copy.
 *   - Resets the row to a re-entry status (`needs_scene_regen` for v2,
 *     `pending` for v3) so the existing prepare/render pipeline picks it up.
 *   - Returns counts: repaired / regenerated / ready / discarded.
 *
 * Read-only on products. Idempotent. Does NOT call any AI/voice provider
 * itself — it only flips state so the existing pipeline regenerates copy
 * on its next scheduled tick.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { detectNarrativeLeak } from "../_shared/cinematic-narrative-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RepairCounts = {
  scanned: number;
  repaired: number;
  regenerated: number;
  ready_for_pinterest: number;
  discarded: number;
  by_reason: Record<string, number>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID().slice(0, 8);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const counts: RepairCounts = {
    scanned: 0,
    repaired: 0,
    regenerated: 0,
    ready_for_pinterest: 0,
    discarded: 0,
    by_reason: {},
  };
  const tally = (k: string) => { counts.by_reason[k] = (counts.by_reason[k] ?? 0) + 1; };

  // ── 1. v2 cinematic_ad_jobs — trim-deprecated quarantine ─────────────
  {
    const { data: rows, error } = await admin
      .from("cinematic_ad_jobs")
      .select("id, product_slug, product_name, status, publish_blocked_reason, error_message, status_message, output_mp4_url, vo_script")
      .or([
        "publish_blocked_reason.ilike.%trim_workflow_deprecated%",
        "publish_blocked_reason.ilike.%auto_trim_dispatch_failed%",
        "error_message.ilike.%trim_workflow_deprecated%",
        "error_message.ilike.%auto_trim_dispatch_failed%",
      ].join(","));
    if (error) return json(500, { ok: false, traceId, message: error.message, step: "scan_v2_trim" });
    for (const row of rows ?? []) {
      counts.scanned++;
      const hasMp4 = Boolean(row.output_mp4_url);
      const update: Record<string, unknown> = {
        status: hasMp4 ? "render_complete" : "needs_scene_regen",
        publish_blocked_reason: null,
        error_message: null,
        status_message: hasMp4
          ? "recovery: trim retired, mp4 preserved, requeued for QA"
          : "recovery: trim retired, re-routed to cinematic pipeline",
        trim_attempts: 0,
      };
      const { error: uErr } = await admin.from("cinematic_ad_jobs").update(update).eq("id", row.id);
      if (uErr) { tally("v2_trim_update_failed"); continue; }
      counts.repaired++;
      tally(hasMp4 ? "v2_trim_recovered_with_mp4" : "v2_trim_regen_required");
      if (!hasMp4) counts.regenerated++;
    }
  }

  // ── 2. v2 cinematic_ad_jobs — narrative leak (litter copy elsewhere) ──
  {
    const { data: rows, error } = await admin
      .from("cinematic_ad_jobs")
      .select("id, product_id, product_slug, product_name, status, vo_script, voiceover_script, voiceover_url, output_mp4_url, scene_assets")
      .or("vo_script.ilike.%scoop%,vo_script.ilike.%litter%,vo_script.ilike.%fresher home%")
      .not("product_slug", "ilike", "%litter%");
    if (error) return json(500, { ok: false, traceId, message: error.message, step: "scan_v2_leak" });
    for (const row of rows ?? []) {
      counts.scanned++;
      const product: { name?: string | null; slug?: string | null; category?: string | null } = {
        name: row.product_name,
        slug: row.product_slug,
      };
      // Re-confirm via the shared guard (not every match is actually a leak)
      const leak = detectNarrativeLeak(product, row.vo_script);
      if (!leak) { tally("v2_false_positive"); continue; }
      // Discard scripts/audio but keep the rendered video (re-narration
      // can be glued back if scene assets survived).
      const update: Record<string, unknown> = {
        status: "needs_scene_regen",
        publish_blocked_reason: `recovery_narrative_leak:${leak}`,
        status_message: `recovery: cleared bad voiceover (${leak}); awaiting product-aware regen`,
        vo_script: null,
        voiceover_script: null,
        voiceover_url: null,
        vo_url: null,
        approved_for_render: false,
      };
      const { error: uErr } = await admin.from("cinematic_ad_jobs").update(update).eq("id", row.id);
      if (uErr) { tally("v2_leak_update_failed"); continue; }
      counts.repaired++;
      counts.regenerated++;
      tally(`v2_leak_cleared:${leak}`);
    }
  }

  // ── 3. v3 cinematic_v3_jobs — narrative leak in transcript ────────────
  {
    const { data: rows, error } = await admin
      .from("cinematic_v3_jobs")
      .select("id, product_id, product_slug, status, voiceover_transcript, voiceover_url, final_mp4_url, scenes, script")
      .not("product_slug", "ilike", "%litter%")
      .or("voiceover_transcript.ilike.%scoop%,voiceover_transcript.ilike.%fresher home%");
    if (error) return json(500, { ok: false, traceId, message: error.message, step: "scan_v3_leak" });
    for (const row of rows ?? []) {
      counts.scanned++;
      const leak = detectNarrativeLeak({ slug: row.product_slug }, row.voiceover_transcript);
      if (!leak) { tally("v3_false_positive"); continue; }
      const update: Record<string, unknown> = {
        status: "pending",
        voiceover_url: null,
        voiceover_transcript: null,
        script: null,
        qa_passed: false,
        failure_reasons: [`recovery_narrative_leak:${leak}`],
      };
      const { error: uErr } = await admin.from("cinematic_v3_jobs").update(update).eq("id", row.id);
      if (uErr) { tally("v3_leak_update_failed"); continue; }
      counts.repaired++;
      counts.regenerated++;
      tally(`v3_leak_cleared:${leak}`);
    }
  }

  // ── 4. Permanently discard rows with no recoverable product link ──────
  {
    const { data: rows, error } = await admin
      .from("cinematic_ad_jobs")
      .select("id")
      .is("product_id", null)
      .in("status", ["needs_admin_review", "needs_scene_regen", "failed"]);
    if (error) return json(500, { ok: false, traceId, message: error.message, step: "discard" });
    for (const row of rows ?? []) {
      await admin
        .from("cinematic_ad_jobs")
        .update({ status: "rejected_low_quality", publish_blocked_reason: "recovery_no_product_link" })
        .eq("id", row.id);
      counts.discarded++;
      tally("discarded_no_product");
    }
  }

  // ── 5. Tally currently publishable (QA-clean) rows ────────────────────
  {
    const { count: v2Ready } = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "publishable")
      .is("publish_blocked_reason", null);
    const { count: v3Ready } = await admin
      .from("cinematic_v3_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");
    counts.ready_for_pinterest = (v2Ready ?? 0) + (v3Ready ?? 0);
  }

  console.log(`[cinematic-recovery-worker] ${traceId}`, counts);
  return json(200, { ok: true, traceId, ...counts });
});
