// Pinterest Recovery Worker
// ─────────────────────────────────────────────────────────────────────────────
// Reprocesses entries from `pinterest_recovery_queue` by REUSING the existing
// pin_image_url (no AI image render). Generates new headline/overlay/CTA from
// the deterministic board templates and the DiversityGuard pool, then inserts
// the recovered pin into `pinterest_pin_queue` as status='queued' so the
// normal publish cadence picks it up immediately.
//
// Zero image-render credits. Text-only.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { buildPinCopy, validatePinCopy } from "../_shared/pinterest-board-templates.ts";
import { DiversityGuard, normaliseCategoryKey } from "../_shared/pinterest-diversity-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_URL = "https://getpawsy.pet";

const BLOCKED_HOSTS = [
  "cjdropshipping",
  "cf.cjdropshipping",
  "oss-cf.cjdropshipping",
  "aliexpress",
  "alicdn",
];

function isBlockedHost(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  return BLOCKED_HOSTS.some((h) => u.includes(h));
}

function nicheFromCategory(category: string | null | undefined, slug: string): string {
  const c = (category || slug || "").toLowerCase();
  if (c.includes("litter")) return "cat_litter";
  if (c.includes("tree") || c.includes("climb") || c.includes("tower")) return "cat_tree";
  if (c.includes("bed")) return "cat_bed";
  if (c.includes("carrier")) return "carriers";
  if (c.includes("fountain") || c.includes("feeder") || c.includes("bowl")) return "feeder";
  if (c.includes("toy")) return "toys";
  return "cat_furniture";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const batchSize = Math.max(1, Math.min(300, Number(body?.batchSize ?? 250)));
  const maxVariantsPerRow = Math.max(1, Math.min(4, Number(body?.maxVariants ?? 3)));

  try {
    const { assertIsolationAllows } = await import("../_shared/pinterest-wave-isolation.ts");
    const guard = await assertIsolationAllows(sb, body?.run_id ?? null, corsHeaders);
    if (guard) return guard;
  } catch (e) {
    console.warn("[recovery-worker] wave-isolation check failed (non-fatal):", e);
  }

  // ── Snapshot counters
  const { count: queueSize } = await sb
    .from("pinterest_recovery_queue").select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // ── Load loser-blocklist (active) and image-blocklist (hashes + urls)
  const nowIso = new Date().toISOString();
  const [loserRes, imgBlockRes] = await Promise.all([
    sb.from("pinterest_loser_blocklist").select("product_slug, blocked_until").gt("blocked_until", nowIso),
    sb.from("pinterest_image_blocklist").select("image_url, image_hash"),
  ]);
  const blockedSlugs = new Set((loserRes.data ?? []).map((r: any) => String(r.product_slug)));
  const blockedImageUrls = new Set((imgBlockRes.data ?? []).map((r: any) => String(r.image_url || "")));

  // ── Load DiversityGuard
  // Recovery mode tolerates exact-overlay repeats inside the last-25 window
  // because we are reusing existing images (no new image render). The per-90
  // headline/cta/overlay caps still apply, which keeps real variety enforced.
  const guard = new DiversityGuard({ windowLast25Exact: false });
  await guard.load(sb);

  // ── Pull pending recovery rows
  const { data: rows, error: rowErr } = await sb
    .from("pinterest_recovery_queue")
    .select("id, source_pin_id, product_slug, board_id, board_name, pin_image_url, pin_image_phash, external_url, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (rowErr) {
    return new Response(JSON.stringify({ ok: false, error: rowErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidateRows = rows ?? [];

  // ── Bulk-load products for the slugs we care about
  const slugs = Array.from(new Set(candidateRows.map((r: any) => String(r.product_slug)).filter(Boolean)));
  const productMap = new Map<string, any>();
  if (slugs.length) {
    // Chunk to keep PostgREST URL length under ~6KB; long product slugs blow
    // past the limit with a single .in() call and silently return zero rows.
    const CHUNK = 40;
    for (let i = 0; i < slugs.length; i += CHUNK) {
      const chunk = slugs.slice(i, i + CHUNK);
      const { data: products, error: pErr } = await sb
        .from("products")
        .select("id, slug, name, category, price, benefit_angle, is_active, availability, stock, image_url")
        .in("slug", chunk);
      if (pErr) console.warn("[recovery-worker] product chunk error", pErr.message);
      for (const p of products ?? []) productMap.set(String(p.slug), p);
    }
  }

  let recovered = 0;
  let skippedBlocked = 0, skippedOOS = 0, skippedBadImage = 0, skippedDiversity = 0;
  let skippedNoProduct = 0, skippedValidation = 0, skippedInsertErr = 0;
  const breakdown: Record<string, number> = {};
  const recoveredIds: string[] = [];

  // Stagger publish times so the publisher cron picks them up over the cadence window
  let scheduleOffsetSec = 0;

  for (const r of candidateRows) {
    const slug = String(r.product_slug || "");
    const product = productMap.get(slug);

    if (!product) {
      skippedNoProduct++;
      await sb.from("pinterest_recovery_queue").update({
        status: "skipped", last_error: "product_not_found", processed_at: nowIso,
      }).eq("id", r.id);
      continue;
    }

    if (blockedSlugs.has(slug)) {
      skippedBlocked++;
      await sb.from("pinterest_recovery_queue").update({
        status: "skipped", last_error: "loser_blocked", processed_at: nowIso,
      }).eq("id", r.id);
      continue;
    }

    const availability = String(product.availability || "").toLowerCase();
    const isInStock = product.is_active !== false &&
      (availability === "in stock" || availability === "in_stock" || availability === "" || availability === "available") &&
      (product.stock == null || Number(product.stock) > 0);
    if (!isInStock) {
      skippedOOS++;
      await sb.from("pinterest_recovery_queue").update({
        status: "skipped", last_error: "product_oos", processed_at: nowIso,
      }).eq("id", r.id);
      continue;
    }

    const pinImageUrl = String(r.pin_image_url || "");
    if (!pinImageUrl || isBlockedHost(pinImageUrl) || blockedImageUrls.has(pinImageUrl)) {
      skippedBadImage++;
      await sb.from("pinterest_recovery_queue").update({
        status: "skipped", last_error: "blocked_source_or_image", processed_at: nowIso,
      }).eq("id", r.id);
      continue;
    }

    const niche = nicheFromCategory(product.category, slug);
    const categoryKey = normaliseCategoryKey(niche);

    // ── Try up to N text variants through DiversityGuard
    let accepted: { copy: any; evalReasons: string[] } | null = null;
    const allReasons: string[] = [];
    for (let v = 0; v < maxVariantsPerRow; v++) {
      const variantIdx = ((r.attempts || 0) * maxVariantsPerRow + v) % 4;
      const copy = buildPinCopy({
        name: product.name,
        benefit: product.benefit_angle ?? null,
        category: product.category ?? null,
        price: product.price ?? null,
        niche,
      }, variantIdx);

      // Validate copy first
      const overlayBlock = `${copy.overlay} • ${copy.cta}`;
      const valid = validatePinCopy({
        title: copy.title, description: copy.description,
        overlay: copy.overlay, overlayBlock, brandWordmark: copy.brandWordmark,
      });
      if (!valid.valid) { allReasons.push(`validation:${valid.errors.join(",")}`); continue; }

      const evalRes = guard.evaluate({
        headline: copy.overlay,
        cta: copy.cta,
        hook: niche,
      }, categoryKey);

      if (evalRes.ok) {
        // Apply any pool swaps to the final copy fields
        if (evalRes.replacedFromPool.headline) copy.overlay = evalRes.final.headline;
        if (evalRes.replacedFromPool.cta) copy.cta = evalRes.final.cta;
        guard.register(evalRes.final, categoryKey);
        accepted = { copy, evalReasons: [] };
        break;
      }
      allReasons.push(...evalRes.reasons);
    }

    if (!accepted) {
      skippedDiversity++;
      const reason = allReasons[0] || "diversity_blocked";
      breakdown[reason] = (breakdown[reason] || 0) + 1;
      await sb.from("pinterest_recovery_queue").update({
        status: "skipped",
        attempts: (r.attempts || 0) + 1,
        last_error: reason.slice(0, 240),
        processed_at: nowIso,
      }).eq("id", r.id);
      continue;
    }

    const copy = accepted.copy;
    const hookParam = encodeURIComponent(copy.overlay.slice(0, 40));
    const destination = `${BASE_URL}/products/${slug}?utm_source=pinterest&utm_medium=social&utm_campaign=recovery&utm_content=${niche}&hook=${hookParam}`;
    // DB trigger `enforce_pin_copy_rules` rejects `|` or `•` inside
    // overlay_text. Store ONLY the short benefit overlay; the CTA lives in
    // meta.cta and is rendered separately by the publisher.
    const overlayFinal = copy.overlay
      .replace(/[|•\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const variant = `recovery_${niche}_${stamp}_${String(r.id).slice(-6)}`;

    scheduleOffsetSec += 30;
    const scheduledAt = new Date(Date.now() + scheduleOffsetSec * 1000).toISOString();

    const insertRow: any = {
      product_id: product.id,
      product_slug: slug,
      product_name: product.name,
      pin_variant: variant,
      pin_title: copy.title,
      pin_description: copy.description,
      pin_image_url: pinImageUrl,
      pin_image_phash: r.pin_image_phash ?? null,
      destination_link: r.external_url || destination,
      priority: "high",
      status: "queued",
      scheduled_at: scheduledAt,
      approved_at: nowIso,
      hook_group: niche,
      category_key: niche,
      board_name: r.board_name || null,
      board_id: r.board_id || null,
      overlay_text: overlayFinal,
      content_type: "product",
      recovery_mode_publish: true,
      meta: {
        creative_source: "creative_director_v2",
        ai_generated: false,
        generator: "pinterest-recovery-worker",
        quality_tier: "recovered",
        publish_allowed: true,
        pin_type: "recovered",
        cta: copy.cta,
        recovery: {
          source_pin_id: r.source_pin_id,
          recovery_queue_id: r.id,
          reused_image_url: true,
        },
      },
    };

    const ins = await sb.from("pinterest_pin_queue").insert(insertRow).select("id").single();
    if (ins.error) {
      skippedInsertErr++;
      await sb.from("pinterest_recovery_queue").update({
        status: "failed", attempts: (r.attempts || 0) + 1,
        last_error: `insert:${ins.error.message}`.slice(0, 240),
        processed_at: nowIso,
      }).eq("id", r.id);
      continue;
    }

    recovered++;
    recoveredIds.push(String(ins.data!.id));
    await sb.from("pinterest_recovery_queue").update({
      status: "recovered", attempts: (r.attempts || 0) + 1,
      processed_at: nowIso,
      last_error: null,
    }).eq("id", r.id);
  }

  const { count: remaining } = await sb
    .from("pinterest_recovery_queue").select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const result = {
    ok: true,
    recovery_queue_size_before: queueSize ?? null,
    processed_rows: candidateRows.length,
    recovered_pins_created: recovered,
    approved_pins: recovered, // recovered pins are auto-approved (status=queued, approved_at=now)
    queued_for_publish: recovered,
    skipped: {
      loser_blocked: skippedBlocked,
      out_of_stock: skippedOOS,
      blocked_image_source: skippedBadImage,
      diversity_blocked: skippedDiversity,
      product_not_found: skippedNoProduct,
      copy_validation: skippedValidation,
      insert_error: skippedInsertErr,
    },
    top_diversity_reasons: Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 10),
    remaining_recovery_candidates: remaining ?? null,
    image_render_credits_consumed: 0,
    recovered_pin_queue_ids: recoveredIds.slice(0, 20),
    duration_ms: Date.now() - startedAt,
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});