// resurrection-to-pcie2-bridge
// Mission A: bridge certified pinterest_resurrection_candidates rows into the
// canonical pcie2_publish_queue (status='ready' == HOLD) WITHOUT publishing.
// Reuses source-pin images for banned_phrase_rewrite; renders new images
// (Lovable AI Gateway, google/gemini-3-pro-image) for all other buckets.
// Never calls Pinterest. Never writes to legacy pinterest_pin_queue.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rollout-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const ROLLOUT_TOKEN = Deno.env.get("PINTEREST_ROLLOUT_TOKEN") ?? "";
const SITE = "https://getpawsy.pet";
const CI_VERSION = "ci-v1.1-zero-bypass";
const CI_MIN_SCORE = 75;
const BUCKET = "pinterest-ads";

const BANNED = [
  "eco-friendly","vet-approved","vet approved","life-changing","life changing",
  "stop scooping","game-changer","game changer","must-have","must have",
  "you won\u2019t believe","you wont believe","shocking","miracle","revolutionary",
];
const ALLOWED_BOARDS = new Set([
  "1117103951261719234","1117103951261719235","1117103951261719219",
  "1117103951261719230","1117103951261719222","1117103951261719228",
  "1117103951261719231","1117103951261719232","1117103951261719227",
  "1117103951261719226",
]);

function mapBoard(slug: string, category: string | null, species: string | null) {
  const s = (slug || "").toLowerCase();
  const c = (category || "").toLowerCase();
  const sp = (species || "").toLowerCase();
  if (s.includes("litter") || c.includes("litter")) return { board_id: "1117103951261719235", reason: "litter_match" };
  if (s.includes("cat-tree") || s.includes("cat-climb") || c.includes("cat trees")) return { board_id: "1117103951261719219", reason: "cat_tree_match" };
  if (s.includes("dog-travel") || s.includes("dog-car") || s.includes("car-seat-dog")) return { board_id: "1117103951261719226", reason: "dog_travel_match" };
  if (s.includes("dog-leash") || s.includes("dog-harness") || s.includes("dog-walk") || c.includes("collars & leashes")) return { board_id: "1117103951261719227", reason: "dog_walk_match" };
  if (c.includes("bed")) return { board_id: "1117103951261719231", reason: "bed_match" };
  if (s.includes("cat-furniture") || s.includes("enclosure") || c.includes("cat furniture") || c.includes("cat houses")) return { board_id: "1117103951261719222", reason: "cat_furniture_match" };
  if (s.includes("smart") || s.includes("auto") || s.includes("gadget") || s.includes("app-control")) return { board_id: "1117103951261719234", reason: "smart_gadget_match" };
  if (sp === "cat" || c.toLowerCase().startsWith("cat ")) return { board_id: "1117103951261719230", reason: "cat_fallback" };
  return { board_id: "1117103951261719232", reason: "default_pet_parent_hacks" };
}

async function fp(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function renderImage(prompt: string): Promise<string> {
  // Non-streaming Gemini image gen — returns single JSON body with b64_json.
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`image_gateway_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no_b64_in_response");
  return b64;
}

function briefToPrompt(brief: unknown, fallbackTitle: string): string {
  if (!brief || typeof brief !== "object") return `Pinterest lifestyle pet product photograph: ${fallbackTitle}. Aspect 2:3, natural US-home daylight, clean editorial style, no text overlay.`;
  const b = brief as Record<string, unknown>;
  const parts = [
    `Pinterest lifestyle pet product photograph, aspect 2:3, no text overlay.`,
    b.subject ? `Subject: ${b.subject}.` : "",
    b.scene ? `Scene: ${b.scene}.` : "",
    b.style ? `Style: ${b.style}.` : "",
    b.mood ? `Mood: ${b.mood}.` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

async function uploadPng(sb: ReturnType<typeof createClient>, b64: string, candidateId: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const path = `resurrection/${candidateId}.png`;
  const up = await sb.storage.from(BUCKET).upload(path, bin, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(`storage_upload: ${up.error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function computeCi(title: string, qualityScore: number, banned: string | null): number {
  const wordCount = title.trim().split(/\s+/).length;
  const lenScore = wordCount >= 5 && wordCount <= 12 ? 100 : wordCount >= 3 && wordCount <= 15 ? 80 : 55;
  const qsScore = Math.round(qualityScore * 100);
  const trustScore = banned ? 0 : 95;
  const seoScore = /\b(cat|dog|pet|puppy|kitten)\b/i.test(title) ? 90 : 70;
  return Math.round(0.35 * qsScore + 0.20 * lenScore + 0.20 * trustScore + 0.15 * seoScore + 0.10 * 85);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: accept either the shared rollout token OR an authenticated admin JWT.
  let authed = false;
  const token = req.headers.get("x-rollout-token") ?? "";
  if (ROLLOUT_TOKEN && token === ROLLOUT_TOKEN) authed = true;
  if (!authed) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7);
      const sbAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: userRes } = await sbAuth.auth.getUser();
      if (userRes?.user?.id) {
        const sbSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data: isAdmin } = await sbSvc.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
        if (isAdmin === true) authed = true;
      }
    }
  }
  if (!authed) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body.dry_run !== false; // default TRUE for safety
  const limit = Math.min(Math.max(Number(body.limit ?? 5), 1), 50);
  const maxPerProduct = Math.min(Math.max(Number(body.max_per_product ?? 2), 1), 5);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ELITE gate: same certified thresholds used in Phase 4/5.
  const { data: candidates, error: cErr } = await sb
    .from("pinterest_resurrection_candidates")
    .select("id,source_queue_id,product_id,product_slug,bucket,proposed_title,proposed_description,proposed_image_brief,proposed_board_id,confidence_score,us_audience_score,duplicate_risk,banned_phrase_hit")
    .eq("status", "draft")
    .is("pcie2_queue_id", null)
    .gte("confidence_score", 0.84)
    .gte("us_audience_score", 0.80)
    .lte("duplicate_risk", 0.25)
    .order("confidence_score", { ascending: false })
    .limit(limit * 4); // over-fetch to allow diversity filtering
  if (cErr) return new Response(JSON.stringify({ ok: false, error: cErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const perProduct = new Map<string, number>();
  const perBoard = new Map<string, number>();
  const results: Array<Record<string, unknown>> = [];
  const queueIds: string[] = [];
  let bridged = 0, held = 0, failed = 0, rendered = 0, reused = 0, skipped = 0;

  for (const c of candidates ?? []) {
    if (bridged + held + failed >= limit) break;
    const pc = perProduct.get(c.product_id) ?? 0;
    if (pc >= maxPerProduct) { skipped++; results.push({ id: c.id, verdict: "SKIP", reason: "per_product_cap" }); continue; }

    try {
      // Product lookup
      const { data: p } = await sb.from("products")
        .select("id,slug,category,primary_species,is_active,image_url,name")
        .eq("id", c.product_id).maybeSingle();
      if (!p || !p.is_active) throw new Error("product_inactive");

      // Board resolution: honor proposed_board_id when whitelisted, else fallback.
      let boardId = c.proposed_board_id ? String(c.proposed_board_id) : "";
      let boardReason = "resurrection_proposed";
      if (!ALLOWED_BOARDS.has(boardId)) {
        const m = mapBoard(p.slug, p.category, p.primary_species);
        boardId = m.board_id; boardReason = m.reason;
      }

      const pbc = perBoard.get(boardId) ?? 0;
      if (pbc >= 6) { skipped++; results.push({ id: c.id, verdict: "SKIP", reason: "per_board_cap" }); continue; }

      const title = (c.proposed_title || "").trim();
      if (!title) throw new Error("missing_headline");
      const titleLower = title.toLowerCase();
      const banned = BANNED.find(b => titleLower.includes(b)) ?? null;
      if (banned) throw new Error(`banned_phrase:${banned}`);

      // Image sourcing
      let imageUrl = "";
      let imageMode: "reused" | "rendered" = "reused";
      if (c.bucket === "banned_phrase_rewrite") {
        if (!c.source_queue_id) throw new Error("banned_phrase_missing_source");
        const { data: srcPin } = await sb.from("pinterest_pin_queue")
          .select("pin_image_url").eq("id", c.source_queue_id).maybeSingle();
        if (!srcPin?.pin_image_url) throw new Error("source_image_missing");
        imageUrl = srcPin.pin_image_url;
      } else {
        if (dryRun) {
          imageUrl = `DRY_RUN_PLACEHOLDER://${c.id}`;
          imageMode = "rendered";
        } else {
          const prompt = briefToPrompt(c.proposed_image_brief, title);
          const b64 = await renderImage(prompt);
          imageUrl = await uploadPng(sb, b64, c.id);
          imageMode = "rendered";
        }
      }

      const qualityScore = Math.min(1, Math.max(0.6, Number(c.confidence_score ?? 0.75)));
      const ciScore = computeCi(title, qualityScore, banned);
      if (ciScore < CI_MIN_SCORE) throw new Error(`ci_below_threshold:${ciScore}`);
      const ciPassedAt = new Date().toISOString();

      // Fingerprints (match assembler algorithm exactly)
      const key = `${p.id}|${boardId}|${imageUrl}`;
      const qfp = await fp(key);
      const hfp = await fp(title);
      const ifp = await fp(imageUrl);
      const description = (c.proposed_description || p.name || title).slice(0, 480);
      const sfp = await fp(`${title}::${description}`);

      // UTM destination with resurrection attribution
      const campaign = "resurrection_wave1";
      const utmContent = `resurrection_${c.id.slice(0, 8)}`;
      const destination = `${SITE}/products/${p.slug}?utm_source=pinterest&utm_medium=organic`
        + `&utm_campaign=${encodeURIComponent(campaign)}&utm_content=${utmContent}`
        + `&audience=us_buyers&resurrection_id=${c.id}&bucket=${encodeURIComponent(c.bucket)}`
        + `&board_id=${boardId}&product_id=${p.id}&campaign_id=${encodeURIComponent(campaign)}`;

      if (dryRun) {
        held++;
        perProduct.set(c.product_id, pc + 1);
        perBoard.set(boardId, pbc + 1);
        if (imageMode === "rendered") rendered++; else reused++;
        results.push({ id: c.id, verdict: "DRY_RUN_OK", bucket: c.bucket, image_mode: imageMode, board_id: boardId, board_reason: boardReason, ci_score: ciScore });
        continue;
      }

      // Live bridge write: insert into pcie2_publish_queue with status='ready' (HOLD).
      // status='ready' is NOT picked up by pinterest-canary-publish (which reads 'pending'/'approved_dry').
      const { data: ins, error: insErr } = await sb.from("pcie2_publish_queue").insert({
        product_id: p.id,
        product_slug: p.slug,
        headline: title,
        hook: description,
        image_url: imageUrl,
        board_id: boardId,
        destination_url: destination,
        status: "ready",
        quality_score: qualityScore,
        ci_version: CI_VERSION,
        ci_passed_at: ciPassedAt,
        ci_score: ciScore,
        quality_fingerprint: qfp,
        semantic_fingerprint: sfp,
        rewrite_fingerprint: qfp,
        image_fingerprint: ifp,
        headline_fingerprint: hfp,
        meta: {
          source: "resurrection-to-pcie2-bridge",
          resurrection_candidate_id: c.id,
          bucket: c.bucket,
          image_mode: imageMode,
          board_mapping_reason: boardReason,
          us_audience_score: c.us_audience_score,
          duplicate_risk: c.duplicate_risk,
          ci_version: CI_VERSION,
          ci_score: ciScore,
          ci_passed_at: ciPassedAt,
        },
      }).select("id").single();

      if (insErr) {
        if (insErr.code === "23505") { skipped++; results.push({ id: c.id, verdict: "SKIP", reason: "duplicate_in_queue" }); continue; }
        throw new Error(`insert_error:${insErr.message}`);
      }

      await sb.from("pinterest_resurrection_candidates").update({
        rendered_image_url: imageUrl,
        pcie2_queue_id: ins!.id,
        ci_passed_at: ciPassedAt,
        bridge_status: "bridged",
        bridge_error: null,
      }).eq("id", c.id);

      queueIds.push(ins!.id as string);
      bridged++;
      perProduct.set(c.product_id, pc + 1);
      perBoard.set(boardId, pbc + 1);
      if (imageMode === "rendered") rendered++; else reused++;
      results.push({ id: c.id, verdict: "BRIDGED", bucket: c.bucket, image_mode: imageMode, board_id: boardId, board_reason: boardReason, ci_score: ciScore, queue_id: ins!.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed++;
      if (!dryRun) {
        await sb.from("pinterest_resurrection_candidates").update({
          bridge_status: "failed", bridge_error: msg,
        }).eq("id", c.id);
      }
      results.push({ id: c.id, verdict: "FAIL", error: msg });
    }
  }

  const boardDistribution: Record<string, number> = {};
  perBoard.forEach((v, k) => { boardDistribution[k] = v; });

  return new Response(JSON.stringify({
    ok: true,
    dry_run: dryRun,
    limit,
    processed: results.length,
    bridged, held, failed, skipped,
    rendered_images: rendered,
    reused_images: reused,
    board_distribution: boardDistribution,
    queue_ids: queueIds,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});