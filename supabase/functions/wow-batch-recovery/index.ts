// wow-batch-recovery — Certified WOW batch recovery.
// Reads failed/retry factory jobs and rejected pin queue rows created in the
// last N hours, derives a NEW creative strategy per failure category, injects
// certified adaptive_retry_directives into the Creative Factory prompt (an
// existing certified hook — does NOT bypass PRE / Visual Identity / CI /
// Guardian / DiversityGuard), stamps a recovery_wave_id + generation, writes
// a full audit trail, and appends learnings to the Native Intelligence bank.
//
// Never publishes directly. After stamping, invokes the certified
// pinterest-creative-factory tick and pinterest-refresh-failed-queue so pins
// pass every existing gate before promotion to PCIE2 publisher.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Sb = ReturnType<typeof createClient>;

const FACTORY_STATUSES = ["failed", "retry"];
const REJECT_STATUSES = ["rejected", "draft"];

const BANNED_OVERLAY_HITS = [
  "better than you'd expect",
  "pet parent approved",
  "loved by us pet parents",
  "shop now",
  "small space, big love",
  "quiet luxury for pets",
  "built for happy pets",
];

// Category vocabulary the DiversityGuard / creative_mismatch gate looks for.
const CATEGORY_VOCAB: Record<string, string[]> = {
  cat_tree:       ["cat tree", "climbing tower", "scratching post"],
  cat_scratcher:  ["cat tree", "scratching post", "condo tower"],
  cat_enclosure:  ["cat enclosure", "catio", "playpen"],
  cat_litter:     ["litter box", "covered litter", "enclosed litter"],
  dog_bed:        ["dog bed", "orthopedic cushion", "raised bed"],
  outdoor_house:  ["dog house", "outdoor kennel", "weatherproof shelter"],
  interactive_toy:["interactive toy", "squeaky toy", "chew toy"],
};

function categorizeFailure(err: string | null): string {
  const e = String(err || "").toLowerCase();
  if (e.includes("pre_relevance_failed")) return "pre_relevance_failed";
  if (e.includes("visual_identity_failed")) return "visual_identity_failed";
  if (e.includes("description_missing_getpawsy_destination")) return "description_missing_getpawsy_destination";
  if (e.includes("headline_cap_exceeded")) return "headline_cap_exceeded";
  if (e.includes("creative_mismatch")) return "creative_mismatch";
  return "unknown";
}

function buildRecoveryDirectives(
  failure: string,
  categoryKey: string | null,
  productName: string,
): string {
  const vocab = (CATEGORY_VOCAB[categoryKey || ""] || []).join(", ");
  const lines: string[] = [
    `[WOW_RECOVERY_STRATEGY:${failure}]`,
    `PRODUCT_HERO_MODE: the ${productName} MUST be the unmistakable hero of the frame.`,
    `PRODUCT_OCCUPANCY_TARGET: 22–30% of the frame.`,
    `PRODUCT_VISIBILITY_TARGET: 98–100% — no occlusion by pets, hands, plants, or props.`,
    `SCENE: real premium US home setting (Scandinavian / warm-modern living room, kitchen, or entryway). Natural daylight.`,
    `FORBID: fantasy lighting, painterly styling, cinematic movie-poster grading, product occlusion by pets.`,
    `LANDING_PAGE_MATCH: composition, colorway, and framing must resemble the product's real photograph.`,
  ];
  if (failure === "pre_relevance_failed") {
    lines.push(
      `PRE_RECOVERY: increase product occupancy toward 30%, reduce empty background, move camera closer, keep the product in lower-middle foreground.`,
    );
  }
  if (failure === "visual_identity_failed") {
    lines.push(
      `VI_RECOVERY: return to Golden DNA — remove cinematic color grading, remove teal/orange, use neutral warm daylight, Scandinavian premium interior, matte finishes, muted palette.`,
    );
  }
  if (failure === "description_missing_getpawsy_destination") {
    lines.push(
      `DESCRIPTION_RECOVERY: description MUST include the canonical destination phrase "Shop at getpawsy.pet" and a benefit clause specific to the ${productName}.`,
    );
  }
  if (vocab) {
    lines.push(`CATEGORY_VOCAB_REQUIRED: include at least one of: ${vocab}.`);
  }
  return lines.join("\n");
}

function generateDiverseHeadline(
  productName: string,
  categoryKey: string | null,
  seed: string,
): { title: string; overlay: string } {
  const vocab = CATEGORY_VOCAB[categoryKey || ""] || [];
  const primaryVocab = vocab[0] || "pet upgrade";
  const seedNum = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);

  const titleTemplates = [
    `${productName} — Modern ${primaryVocab} for US Homes`,
    `${primaryVocab.replace(/\b\w/g, c => c.toUpperCase())} Built for Everyday Life — ${productName}`,
    `A Quieter, Cleaner ${primaryVocab}: ${productName}`,
    `${productName}: The ${primaryVocab} That Fits Real Rooms`,
    `Rethinking the ${primaryVocab} — ${productName}`,
  ];
  const overlayTemplates: Record<string, string[]> = {
    cat_tree:       ["Climb-friendly.", "Calm design.", "Sisal + wood."],
    cat_scratcher:  ["Scratch-tested.", "Sisal that lasts.", "Spares the sofa."],
    cat_enclosure:  ["Fresh air, safe.", "Safer window.", "Indoor freedom."],
    cat_litter:     ["Contained.", "No scatter.", "Odor-quiet."],
    dog_bed:        ["Joint-kind.", "Deep-sleep.", "Real comfort."],
    outdoor_house:  ["Weatherproof.", "Insulated + dry.", "Built to last."],
    interactive_toy:["Chew-tested.", "Squeak-approved.", "Real play."],
  };
  const overlays = overlayTemplates[categoryKey || ""] || ["Real US homes.", "Everyday pets."];
  return {
    title: titleTemplates[seedNum % titleTemplates.length].slice(0, 100),
    overlay: overlays[seedNum % overlays.length].slice(0, 60),
  };
}

async function recordLearning(sb: Sb, waveId: string, failure: string, categoryKey: string | null, pattern: string, kind: string) {
  if (!pattern) return;
  await sb.from("pinterest_wow_recovery_learnings").upsert({
    wave_id: waveId,
    failure_category: failure,
    category_key: categoryKey,
    banned_pattern: pattern.toLowerCase().slice(0, 200),
    banned_pattern_type: kind,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "failure_category,banned_pattern_type,banned_pattern", ignoreDuplicates: false });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return jsonResponse({ ok: false, traceId, error: "backend_config_missing" }, 500);
  }

  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
  const hoursBack = Math.max(1, Math.min(168, Number(body.hours_back ?? 24)));
  const maxJobs = Math.max(1, Math.min(100, Number(body.max_jobs ?? 50)));
  const dryRun = body.dry_run === true;
  const waveLabel = String(body.wave_label ?? `wow_recovery_${new Date().toISOString().slice(0,16)}`);
  const runDownstream = body.run_downstream !== false;

  // Admin auth
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return jsonResponse({ ok: false, traceId, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return jsonResponse({ ok: false, traceId, error: "forbidden_admin_only" }, 403);

  // Create wave
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const { data: waveRow, error: waveErr } = await admin
    .from("pinterest_wow_recovery_waves")
    .insert({
      wave_label: waveLabel,
      triggered_by: user.id,
      status: "running",
      scope: { hours_back: hoursBack, max_jobs: maxJobs, since, dry_run: dryRun },
    })
    .select("id").single();
  if (waveErr) return jsonResponse({ ok: false, traceId, error: `wave_insert_failed:${waveErr.message}` }, 500);
  const waveId = waveRow.id as string;

  const report: any = {
    wave_id: waveId, wave_label: waveLabel, since, dry_run: dryRun,
    factory: { scanned: 0, regenerated: 0, skipped: 0, items: [] as any[] },
    queue:   { scanned: 0, regenerated: 0, skipped: 0, items: [] as any[] },
    downstream: null as any,
  };

  // ================= FACTORY JOBS =================
  const { data: jobs } = await admin
    .from("pinterest_creative_factory_jobs")
    .select("id, product_id, product_slug, product_name, status, attempt_count, max_attempts, error_message, prompt, recovery_generation, recovery_wave_id")
    .in("status", FACTORY_STATUSES)
    .not("error_message", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(maxJobs);

  report.factory.scanned = jobs?.length ?? 0;

  for (const job of jobs ?? []) {
    const failure = categorizeFailure(job.error_message);
    const categoryKey = (job.prompt?.niche?.category_key ?? null) as string | null;
    const productName = String(job.product_name ?? job.product_slug ?? "the featured product");
    const directives = buildRecoveryDirectives(failure, categoryKey, productName);
    const nextGen = Number(job.recovery_generation ?? 0) + 1;

    const newPrompt = {
      ...(job.prompt ?? {}),
      adaptive_retry_directives: directives,
      recovery_wave_id: waveId,
      recovery_generation: nextGen,
    };

    if (dryRun) {
      report.factory.items.push({ id: job.id, product_slug: job.product_slug, failure, generation: nextGen, dry_run: true, directives });
      continue;
    }

    const { error: updErr } = await admin
      .from("pinterest_creative_factory_jobs")
      .update({
        status: "retry",
        attempt_count: 0,
        leased_until: null,
        lease_owner: null,
        error_message: null,
        recovery_wave_id: waveId,
        recovery_generation: nextGen,
        prompt: newPrompt,
      })
      .eq("id", job.id);

    if (updErr) {
      report.factory.skipped++;
      report.factory.items.push({ id: job.id, product_slug: job.product_slug, failure, error: updErr.message });
      continue;
    }

    await admin.from("pinterest_wow_recovery_audit").insert({
      wave_id: waveId, target_type: "factory_job", target_id: job.id,
      product_slug: job.product_slug, category_key: categoryKey,
      original_failure: job.error_message, failure_category: failure,
      strategy: `factory_regenerate_gen${nextGen}`,
      recovery_generation: nextGen,
      adaptive_directives: directives,
      before_state: { status: job.status, attempt_count: job.attempt_count, error_message: job.error_message },
      after_state:  { status: "retry", attempt_count: 0, recovery_generation: nextGen },
    });

    await recordLearning(admin, waveId, failure, categoryKey, job.error_message ?? "", "framing_directive");
    report.factory.regenerated++;
    report.factory.items.push({ id: job.id, product_slug: job.product_slug, failure, generation: nextGen });
  }

  // ================= QUEUE REJECTIONS =================
  const { data: qrows } = await admin
    .from("pinterest_pin_queue")
    .select("id, product_id, product_slug, product_name, category_key, status, pin_title, overlay_text, rejection_reason, qa_reasons, meta, recovery_generation, recovery_wave_id")
    .in("status", REJECT_STATUSES)
    .gte("created_at", since)
    .limit(maxJobs);

  report.queue.scanned = qrows?.length ?? 0;

  for (const row of qrows ?? []) {
    const overlay = String(row.overlay_text ?? "").toLowerCase();
    const isBanned = BANNED_OVERLAY_HITS.some(b => overlay.includes(b));
    const rejectReason = (row.rejection_reason ?? (row.qa_reasons ?? []).join(",")) || "";
    const isDiversityBlocked = rejectReason.includes("creative_mismatch") ||
      rejectReason.includes("headline_cap_exceeded") ||
      isBanned;
    if (row.status === "draft" && !isBanned) { report.queue.skipped++; continue; }
    if (row.status === "rejected" && !isDiversityBlocked) { report.queue.skipped++; continue; }

    const failure = rejectReason.includes("creative_mismatch") ? "creative_mismatch"
                  : rejectReason.includes("headline_cap_exceeded") ? "headline_cap_exceeded"
                  : "banned_overlay";
    const { title, overlay: newOverlay } = generateDiverseHeadline(
      String(row.product_name ?? row.product_slug ?? "GetPawsy"),
      row.category_key,
      String(row.id),
    );
    const nextGen = Number(row.recovery_generation ?? 0) + 1;

    if (dryRun) {
      report.queue.items.push({ id: row.id, product_slug: row.product_slug, failure, generation: nextGen, dry_run: true, new_title: title, new_overlay: newOverlay });
      continue;
    }

    const { error: updErr } = await admin
      .from("pinterest_pin_queue")
      .update({
        status: "draft",
        pin_title: title,
        overlay_text: newOverlay,
        qa_reasons: [],
        rejection_reason: null,
        error_message: null,
        last_publish_error: null,
        publishing_started_at: null,
        recovery_wave_id: waveId,
        recovery_generation: nextGen,
      })
      .eq("id", row.id);

    if (updErr) {
      report.queue.skipped++;
      report.queue.items.push({ id: row.id, product_slug: row.product_slug, failure, error: updErr.message });
      continue;
    }

    await admin.from("pinterest_wow_recovery_audit").insert({
      wave_id: waveId, target_type: "pin_queue", target_id: row.id,
      product_slug: row.product_slug, category_key: row.category_key,
      original_failure: rejectReason || (isBanned ? "banned_overlay" : "unknown"),
      failure_category: failure,
      strategy: `queue_headline_diversify_gen${nextGen}`,
      recovery_generation: nextGen,
      new_headline: title, new_overlay: newOverlay,
      before_state: { status: row.status, pin_title: row.pin_title, overlay_text: row.overlay_text, rejection_reason: row.rejection_reason },
      after_state:  { status: "draft", pin_title: title, overlay_text: newOverlay, recovery_generation: nextGen },
    });

    if (row.overlay_text) await recordLearning(admin, waveId, failure, row.category_key, row.overlay_text, "overlay");
    if (row.pin_title)    await recordLearning(admin, waveId, failure, row.category_key, row.pin_title,    "headline");
    report.queue.regenerated++;
    report.queue.items.push({ id: row.id, product_slug: row.product_slug, failure, generation: nextGen, new_title: title, new_overlay: newOverlay });
  }

  // ================= DOWNSTREAM CERTIFIED FLOW =================
  if (runDownstream && !dryRun && (report.factory.regenerated > 0 || report.queue.regenerated > 0)) {
    const downstream: any = {};
    try {
      const r = await admin.functions.invoke("pinterest-creative-factory", { body: { tick: true, max_jobs: 20 } });
      downstream.creative_factory = r.data ?? { error: r.error?.message };
    } catch (e) { downstream.creative_factory = { error: (e as Error).message }; }
    try {
      const r = await admin.functions.invoke("pinterest-refresh-failed-queue", {
        body: { limit: 25, dry_run: false, run_cron: true },
        headers: { Authorization: authHeader },
      });
      downstream.refresh_failed_queue = r.data ?? { error: r.error?.message };
    } catch (e) { downstream.refresh_failed_queue = { error: (e as Error).message }; }
    report.downstream = downstream;
  }

  await admin.from("pinterest_wow_recovery_waves").update({
    status: "complete",
    jobs_scanned: report.factory.scanned + report.queue.scanned,
    jobs_regenerated: report.factory.regenerated,
    queue_regenerated: report.queue.regenerated,
    summary: {
      factory: { scanned: report.factory.scanned, regenerated: report.factory.regenerated, skipped: report.factory.skipped },
      queue:   { scanned: report.queue.scanned,   regenerated: report.queue.regenerated,   skipped: report.queue.skipped   },
      downstream_invoked: !!report.downstream,
    },
    finished_at: new Date().toISOString(),
  }).eq("id", waveId);

  return jsonResponse({ ok: true, traceId, ...report });
});