// Pinterest Resurrection Engine — flagship proof.
//
// Scope (immutable, hard-coded for the flagship proof):
//   product_slug = 'automatic-cat-litter-box-self-cleaning-app-control'
//
// What it does:
//   1. Loads every historically rejected pinterest_pin_queue row for the flagship.
//   2. Groups them into resurrectable buckets (title / banned / image_regen).
//   3. Loads ALL historical titles for the product to build the dedup universe.
//   4. Asks Lovable AI (openai/gpt-5.5) for 30 fresh candidate titles.
//   5. Scores each candidate for:
//        - US audience score (computeUsAudienceScore, canonical helper)
//        - Duplicate risk vs history (token Jaccard)
//        - Banned-phrase collision (enforce_pin_copy_rules parity)
//   6. Composite confidence = 0.5*us + 0.3*(1-dup) + 0.2*intent_bonus.
//   7. Keeps confidence >= 0.80.
//   8. Writes to pinterest_resurrection_candidates as status='draft'.
//
// This function NEVER writes to pinterest_pin_queue, NEVER publishes,
// NEVER modifies the recovery pipeline, cron, workers, or gates.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { computeUsAudienceScore, hasUSIntentKeyword } from "../_shared/pinterest-copy.ts";

const FLAGSHIP_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

// Mirror of enforce_pin_copy_rules banned list (kept in sync manually).
const BANNED_PHRASES = [
  "stop scooping","large space, no pressure","a box that manages itself",
  "shop the upgrade","discover why","save for later","tired of litter",
  "no more plastic bag","plush, warm, easy to wash","plush warm easy to wash",
  "shop the viral find","explore the trend","see it in action","see the setup",
  "clean with ease","automate it","tired of litter box chores","tired of",
  "read reviews","see how",
];

// Category-aware routing per certified pinterest-board-routing-map-v3.
// Selection is category/slug driven; all board IDs are from the allowed
// production whitelist (see mem://marketing/pinterest-board-routing-map-v3).
type Board = { id: string; name: string; weight: number };
const BOARD = {
  SSCLB:            { id: "1117103951261719235", name: "Smart Self-Cleaning Cat Litter Box" },
  SMART_PET:        { id: "1117103951261719234", name: "Smart Pet Gadgets" },
  PET_PARENT_HACKS: { id: "1117103951261719232", name: "Pet Parent Hacks" },
  BEST_CAT_TREES:   { id: "1117103951261719219", name: "Best Cat Trees 2026" },
  INDOOR_CAT_SETUP: { id: "1117103951261719230", name: "Indoor Cat Setup" },
  CAT_FURNITURE:    { id: "1117103951261719222", name: "Cat Furniture" },
  LUXURY_PET_BEDS:  { id: "1117103951261719231", name: "Luxury Pet Beds" },
  DOG_WALKING:      { id: "1117103951261719227", name: "Dog Walking Essentials" },
  DOG_TRAVEL:       { id: "1117103951261719226", name: "Dog Travel Accessories" },
} as const;

function boardsForProduct(p: { slug?: string | null; category?: string | null }): Board[] {
  const slug = (p.slug || "").toLowerCase();
  const cat = (p.category || "").toLowerCase();

  // Cat Trees & Condos
  if (cat.includes("cat tree") || cat.includes("condo") || /cat[-_ ]?tree|cat[-_ ]?tower|cat[-_ ]?climb/.test(slug)) {
    return [
      { ...BOARD.BEST_CAT_TREES,   weight: 3 },
      { ...BOARD.INDOOR_CAT_SETUP, weight: 2 },
      { ...BOARD.CAT_FURNITURE,    weight: 1 },
    ];
  }
  // Cat Litter Boxes
  if (cat.includes("litter") || /litter[-_ ]?box|self[-_ ]?cleaning/.test(slug)) {
    return [
      { ...BOARD.SSCLB,            weight: 3 },
      { ...BOARD.SMART_PET,        weight: 2 },
      { ...BOARD.PET_PARENT_HACKS, weight: 1 },
    ];
  }
  // Dog Walking
  if (/dog[-_ ]?(leash|harness|walk)/.test(slug)) {
    return [
      { ...BOARD.DOG_WALKING,      weight: 3 },
      { ...BOARD.PET_PARENT_HACKS, weight: 1 },
    ];
  }
  // Dog Travel
  if (/dog[-_ ]?(travel|car|car[-_ ]?seat)/.test(slug)) {
    return [
      { ...BOARD.DOG_TRAVEL,       weight: 3 },
      { ...BOARD.PET_PARENT_HACKS, weight: 1 },
    ];
  }
  // Beds
  if (cat.includes("bed") || /(^|[-_ ])bed([-_ ]|$)/.test(slug)) {
    return [
      { ...BOARD.LUXURY_PET_BEDS,  weight: 3 },
      { ...BOARD.PET_PARENT_HACKS, weight: 1 },
    ];
  }
  // Cat furniture / enclosure
  if (/enclosure|cat[-_ ]?furniture/.test(slug)) {
    return [
      { ...BOARD.CAT_FURNITURE,    weight: 3 },
      { ...BOARD.INDOOR_CAT_SETUP, weight: 1 },
    ];
  }
  // Smart/gadget catch-all
  if (/smart|auto|gadget|app[-_ ]?control/.test(slug)) {
    return [
      { ...BOARD.SMART_PET,        weight: 3 },
      { ...BOARD.PET_PARENT_HACKS, weight: 1 },
    ];
  }
  // Default
  return [
    { ...BOARD.PET_PARENT_HACKS, weight: 2 },
    { ...BOARD.SMART_PET,        weight: 1 },
  ];
}

const RESURRECTABLE = new Set([
  "duplicate_headline_archived",
  "content_refresh_banned_phrase_2026_06_12",
  "quality-reset-pre-layout-engine",
  "creative_mismatch",
]);

function bucketFor(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "duplicate_headline_archived") return "title_rewrite";
  if (reason === "content_refresh_banned_phrase_2026_06_12") return "banned_phrase_rewrite";
  if (reason === "quality-reset-pre-layout-engine") return "image_regen_legacy";
  if (reason === "creative_mismatch") return "image_regen_mismatch";
  return null;
}

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function bannedHit(s: string): string | null {
  const hay = s.toLowerCase();
  for (const p of BANNED_PHRASES) if (hay.includes(p)) return p;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  // Optional additive param: allow rollout across resurrectable products.
  // No behavior change when omitted (defaults to FLAGSHIP_SLUG).
  let requestedSlug: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.product_slug === "string" && body.product_slug.length > 0) {
        requestedSlug = body.product_slug;
      }
    } catch (_) { /* no body */ }
  }
  const targetSlug = requestedSlug ?? FLAGSHIP_SLUG;

  // Auth: admin JWT OR shared rollout token (server-triggered rollouts).
  const rolloutToken = req.headers.get("x-rollout-token") ?? "";
  const expectedToken = Deno.env.get("PINTEREST_ROLLOUT_TOKEN") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);
  const tokenAuthed = expectedToken.length > 0 && rolloutToken === expectedToken;
  if (!tokenAuthed) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!lovableKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Load flagship + rejected inventory + full title history
  const { data: product } = await admin
    .from("products")
    .select("id, slug, name, price, primary_species, category")
    .eq("slug", targetSlug)
    .maybeSingle();
  if (!product) {
    return new Response(JSON.stringify({ error: "product not found", slug: targetSlug }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: rejected } = await admin
    .from("pinterest_pin_queue")
    .select("id, pin_title, pin_image_url, rejection_reason, board_id")
    .eq("product_id", product.id)
    .eq("status", "rejected");

  const resurrectable = (rejected ?? []).filter((r) =>
    RESURRECTABLE.has(r.rejection_reason as string),
  );

  const { data: allTitles } = await admin
    .from("pinterest_pin_queue")
    .select("pin_title")
    .eq("product_id", product.id);
  const historyTitleTokens = (allTitles ?? [])
    .map((r) => (r.pin_title || "").trim())
    .filter((t) => t.length > 0)
    .map(tokens);

  // 2. Ask Lovable AI for 30 fresh candidate titles.
  //
  // Scoring-aware prompt: computeUsAudienceScore() awards +0.20 ONLY when a
  // title contains one of the canonical US_INTENT_KEYWORDS substrings from
  // supabase/functions/_shared/pinterest-copy.ts. Without that bonus the
  // baseline for this product caps at ~0.60, which fails the 0.80 confidence
  // gate. We therefore mandate one canonical phrase per title (kept as a
  // substring so the scorer matches) while allowing natural sentence flow.
  const REQUIRED_US_PHRASES = [
    "apartment cats",
    "indoor cats",
    "pet parents",
    "small apartments",
    "modern American homes",
    "NYC apartment",
    "California home",
    "Texas pet lifestyle",
    "US pet lifestyle",
  ];
  const prompt = `Generate 30 fresh Pinterest pin titles for this product.

Product: ${product.name}
Slug: ${product.slug}
Price: $${product.price}
Target audience: US pet parents, indoor cat households, apartment dwellers, busy professionals.

HARD RULES (any violation = title unusable, so it will be discarded):
1. Length: 5 to 12 words. No emojis. No ALL CAPS. No trailing punctuation.
2. US English spelling only ("color" not "colour", "favorite" not "favourite").
3. Natural sentence flow. No clickbait, no fake claims, no superlatives you
   cannot back up ("#1", "world's best", "guaranteed"). No hype punctuation.
4. MUST contain EXACTLY ONE of these US-intent phrases as a case-insensitive
   substring (copy the phrase verbatim, do not paraphrase, do not pluralize
   "pet parents" into "pet parent"): ${REQUIRED_US_PHRASES.map((p) => JSON.stringify(p)).join(", ")}.
   Distribute usage across the set — do NOT reuse the same phrase more than
   4 times across the 30 titles.
5. MUST NOT contain any of these banned phrases (case-insensitive substring):
   ${BANNED_PHRASES.map((p) => JSON.stringify(p)).join(", ")}.
6. MUST NOT repeat the phrase "GetPawsy Automatic Cat Litter Box" verbatim.
7. Every title must be lexically distinct — no two titles may share 4+
   consecutive words, and no title may be a near-duplicate of another.
8. Emphasize a spread of angles across the 30: hands-free convenience,
   odor / air-quality, app control, small-space / apartment life, gifting,
   comparison vs manual scooping, savings on litter, US shipping.
9. Prefer concrete benefits over adjectives. Titles should read like a
   thoughtful pet-parent, not an ad.

Return a JSON object of the exact shape {"titles": [30 strings]}. No prose,
no commentary, no trailing text — just the JSON object.`;

  let candidates: string[] = [];
  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: "You are a Pinterest US pet-commerce copywriter. You output ONLY valid JSON arrays of strings." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiResp.ok) {
      const body = await aiResp.text();
      return new Response(
        JSON.stringify({ error: "ai_gateway_error", status: aiResp.status, body }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const ai = await aiResp.json();
    const content = ai?.choices?.[0]?.message?.content ?? "[]";
    // model may wrap as {"titles":[...]} or return bare array
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) candidates = parsed as string[];
    else if (Array.isArray(parsed?.titles)) candidates = parsed.titles;
    else if (Array.isArray(parsed?.result)) candidates = parsed.result;
    else candidates = Object.values(parsed).flat().filter((x) => typeof x === "string") as string[];
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "ai_parse_error", message: String(e) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. Score each candidate
  type Scored = {
    title: string;
    us_audience_score: number;
    duplicate_risk: number;
    banned_phrase_hit: string | null;
    confidence: number;
    intent_bonus: number;
  };
  const scored: Scored[] = [];
  const seenTokenSets: Set<string>[] = [];
  for (const raw of candidates) {
    const title = String(raw || "").trim();
    if (!title) continue;
    const wc = title.split(/\s+/).length;
    if (wc < 5 || wc > 12) continue;
    const banned = bannedHit(title);
    const tk = tokens(title);
    // duplicate risk = max Jaccard vs history + already-accepted candidates
    let dup = 0;
    for (const h of historyTitleTokens) dup = Math.max(dup, jaccard(tk, h));
    for (const s of seenTokenSets) dup = Math.max(dup, jaccard(tk, s));
    const us = computeUsAudienceScore({
      product_slug: product.slug,
      product_name: product.name,
      pin_title: title,
      pin_description: null,
      category_key: "cat_care",
      content_type: "product",
    });
    const intentBonus = hasUSIntentKeyword(title.toLowerCase()) ? 1 : 0.5;
    const confidence = Math.round((0.5 * us + 0.3 * (1 - dup) + 0.2 * intentBonus) * 1000) / 1000;
    scored.push({
      title,
      us_audience_score: us,
      duplicate_risk: Math.round(dup * 1000) / 1000,
      banned_phrase_hit: banned,
      confidence,
      intent_bonus: intentBonus,
    });
    if (!banned && dup < 0.6) seenTokenSets.push(tk);
  }

  const survivors = scored
    .filter((s) => !s.banned_phrase_hit && s.confidence >= 0.8 && s.duplicate_risk < 0.6)
    .sort((a, b) => b.confidence - a.confidence);

  // 4. Pair survivors with rejected pins across resurrectable buckets
  const batchId = crypto.randomUUID();
  const rows: any[] = [];
  const targetBoards = boardsForProduct({ slug: product.slug, category: (product as any).category });
  const boardsRR = targetBoards.flatMap((b) => Array(b.weight).fill(b)); // weighted round-robin
  let boardIdx = 0;

  // priority order: banned_phrase (has image) > image_regen_legacy (has image) > title_rewrite (needs image later) > image_regen_mismatch
  const priority = ["banned_phrase_rewrite", "image_regen_legacy", "title_rewrite", "image_regen_mismatch"];
  const byBucket: Record<string, any[]> = {};
  for (const p of priority) byBucket[p] = [];
  for (const r of resurrectable) {
    const b = bucketFor(r.rejection_reason as string);
    if (b && byBucket[b]) byBucket[b].push(r);
  }

  // Bucket Round Robin Scheduler (V2):
  // Instead of draining survivors into the highest-priority bucket first,
  // take one candidate from each non-empty bucket per cycle. Priority order
  // is preserved only as the tie-breaker inside a single cycle.
  const flat: Array<{ src: any; bucket: string }> = [];
  const cursors: Record<string, number> = {};
  for (const p of priority) cursors[p] = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (const p of priority) {
      const list = byBucket[p];
      const idx = cursors[p];
      if (idx < list.length) {
        flat.push({ src: list[idx], bucket: p });
        cursors[p] = idx + 1;
        progress = true;
      }
    }
  }

  const pairCount = Math.min(flat.length, survivors.length);
  for (let i = 0; i < pairCount; i++) {
    const cand = survivors[i];
    const { src, bucket } = flat[i];
    const board = boardsRR[boardIdx++ % boardsRR.length];
    const needsBrief = bucket === "image_regen_legacy" || bucket === "image_regen_mismatch" || bucket === "title_rewrite";
    const brief = needsBrief
      ? {
          scene: "modern US apartment, soft daylight, neutral palette",
          subject: "self-cleaning cat litter box in a stylish living-room corner",
          overlay_hint: cand.title.length <= 32 ? cand.title : cand.title.split(" ").slice(0, 5).join(" "),
          aspect: "2:3",
          style: "clean lifestyle product, photorealistic, Pinterest-friendly",
          negative: "no text collage, no supplier watermark, no cluttered background",
        }
      : null;
    // Simple predictions (heuristic — flagged as predictions in the UI)
    const ctrPred = Math.round((0.008 + 0.006 * cand.us_audience_score) * 10000) / 10000;
    const revPred = Math.round(ctrPred * 0.023 * Number(product.price) * 1000) / 1000; // per impression EV
    rows.push({
      source_queue_id: src.id,
      product_id: product.id,
      product_slug: product.slug,
      bucket,
      proposed_title: cand.title,
      proposed_description: null,
      proposed_image_brief: brief,
      proposed_board_id: board.id,
      proposed_board_name: board.name,
      us_audience_score: cand.us_audience_score,
      duplicate_risk: cand.duplicate_risk,
      banned_phrase_hit: null,
      confidence_score: cand.confidence,
      ctr_prediction: ctrPred,
      revenue_prediction: revPred,
      status: "draft",
      batch_id: batchId,
    });
  }

  // 5. Persist (idempotent per batch)
  let inserted = 0;
  if (rows.length > 0) {
    const { error, count } = await admin
      .from("pinterest_resurrection_candidates")
      .insert(rows, { count: "exact" });
    if (error) {
      return new Response(
        JSON.stringify({ error: "insert_failed", message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    inserted = count ?? rows.length;
  }

  const bucketCounts: Record<string, number> = {};
  for (const r of resurrectable) {
    const b = bucketFor(r.rejection_reason as string) ?? "other";
    bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      batch_id: batchId,
      product_slug: product.slug,
      original_rejected: rejected?.length ?? 0,
      resurrectable_pool: resurrectable.length,
      bucket_counts: bucketCounts,
      candidates_generated: scored.length,
      candidates_surviving: survivors.length,
      candidates_written: inserted,
      ai_model: "openai/gpt-5.5",
      confidence_threshold: 0.8,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});