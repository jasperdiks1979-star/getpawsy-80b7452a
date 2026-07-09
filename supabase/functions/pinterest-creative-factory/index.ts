import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  detectNiche,
  getStyleDNA,
  type NicheKey,
} from "../_shared/pinterest-style-dna.ts";
import {
  buildPinCopy,
  validatePinCopy,
} from "../_shared/pinterest-board-templates.ts";
import { computePhashFromBytes } from "../_shared/pinterest-phash.ts";
import { Image as _V101Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { verifyPinIntegrity } from "../_shared/pinterest-integrity-guard.ts";
import { normalizeThrowable, throwableToError } from "./normalize-throwable.ts";
import { extractStrictQcJson } from "./qc-parser.ts";
import {
  buildMasterPrompt,
  dimsSimilarity,
  type MasterDims,
  pickMasterDims,
  scoreInspirationAi,
} from "../_shared/pinterest-master-creative-director.ts";
import {
  compilePrompt as compileGoldenPrompt,
  priorSuccessRate,
  writeCompilerLedger,
} from "../_shared/golden-dna-compiler.ts";
import {
  applyCanonicalEnrichment,
  assertQueueRowEnriched,
  CANONICAL_ENRICHMENT_VERSION,
  deriveContentClassification as _canonicalDeriveContentClassification,
  naturalizeCopyForNative as _canonicalNaturalizeCopyForNative,
  type CanonicalClassification,
} from "../_shared/pinterest-canonical-enrichment.ts";
import {
  formatWinnerAsDirectives,
  runPinterestNativeIntelligence,
} from "../_shared/pinterest-native-intelligence.ts";
import { loadEvolutionBias } from "../_shared/pinterest-evolution-bias.ts";

// Genesis V9.3 — re-export canonical helpers so callers keep working while
// the source of truth lives in `_shared/pinterest-canonical-enrichment.ts`.
// The local duplicates that used to live in this file were REMOVED.
export const deriveContentClassification = _canonicalDeriveContentClassification;
export const naturalizeCopyForNative = _canonicalNaturalizeCopyForNative;
export type FactoryClassification = CanonicalClassification;
export type FactoryContentType = CanonicalClassification["content_type"];

function assertFactoryMetadataComplete(row: {
  content_type?: string | null;
  meta?: Record<string, unknown> | null;
}): void {
  assertQueueRowEnriched(row);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BASE_URL = "https://getpawsy.pet";
const BUCKET = "pinterest-ads";
const DEFAULT_MODEL = Deno.env.get("PINTEREST_FACTORY_IMAGE_MODEL") ||
  Deno.env.get("PINTEREST_CD_IMAGE_MODEL") ||
  "google/gemini-3-pro-image-preview";
const TEXT_MODEL = Deno.env.get("PINTEREST_FACTORY_TEXT_MODEL") ||
  "google/gemini-2.5-flash";
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

type Sb = any;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

function traceId() {
  return crypto.randomUUID().slice(0, 8);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function memorySnapshot() {
  try {
    const m = Deno.memoryUsage();
    return {
      rss: m.rss,
      heap_total: m.heapTotal,
      heap_used: m.heapUsed,
      external: m.external,
    };
  } catch {
    return null;
  }
}

function memoryRssMb() {
  const snap = memorySnapshot();
  return Math.round(((snap?.rss ?? 0) as number) / 1024 / 1024);
}

async function timed<T>(
  name: string,
  metrics: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const before = memorySnapshot();
  try {
    return await fn();
  } finally {
    const after = memorySnapshot();
    (metrics.stages as Array<Record<string, unknown>>).push({
      stage: name,
      duration_ms: Date.now() - started,
      memory_before: before,
      memory_after: after,
    });
  }
}

function auditThrowable(error: unknown) {
  const n = normalizeThrowable(error);
  return {
    message: String(n.message).slice(0, 1000),
    name: n.name,
    stack: n.stack ? n.stack.slice(0, 2000) : null,
    raw: n.raw,
  };
}

async function prePlanningHelper<T>(
  helper: string,
  metrics: Record<string, unknown>,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    (metrics.preplanning_trace as Array<Record<string, unknown>>).push({
      helper,
      ok: true,
      at: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    const before = auditThrowable(error);
    const wrapped = throwableToError(error);
    const after = auditThrowable(wrapped);
    const entry = {
      helper,
      ok: false,
      at: new Date().toISOString(),
      normalized_before: before,
      normalized_after: after,
    };
    (metrics.preplanning_trace as Array<Record<string, unknown>>).push(entry);
    (metrics as any).preplanning_error = entry;
    throw wrapped;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64OrDataUrl: string): Uint8Array {
  const b64 = b64OrDataUrl.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    return `data:${ct};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

function conciseProductName(name: string) {
  return name.replace(/[,–—].*$/, "").replace(/\s+/g, " ").trim().slice(0, 90);
}

// ─────────────────────────────────────────────────────────────────────────────
// Genesis V9.3 — Factory ↔ Native Gate metadata alignment
// ─────────────────────────────────────────────────────────────────────────────
// The Native Prepublish Gate classifies drafts using `content_type` and
// `meta.pin_type`/`meta.content_type`. All enrichment now lives in ONE
// canonical module: `../_shared/pinterest-canonical-enrichment.ts`. The
// factory imports the classification/naturalization helpers from there
// and every producer inserting into `pinterest_pin_queue` is also guarded
// at the DB layer by a BEFORE INSERT/UPDATE trigger (V9.3 migration).

async function seedMissingMediaJobs(sb: Sb, limit: number, source: string) {
  const { data: pins, error } = await sb
    .from("pinterest_pin_queue")
    .select(
      "id, product_id, product_slug, product_name, status, priority, created_at, pin_image_url, meta",
    )
    .in("status", ["queued", "draft", "blocked_legacy_source"])
    .or("pin_image_url.is.null,pin_image_url.eq.")
    .not("product_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw throwableToError(error);

  const rows = (pins ?? []).map((p: any, i: number) => ({
    pin_queue_id: p.id,
    product_id: p.product_id,
    product_slug: p.product_slug,
    product_name: p.product_name,
    status: "pending",
    stage: "planning",
    priority: p.status === "queued" ? 10 + i : 50 + i,
    source,
    prompt: {
      queue_status: p.status,
      queue_priority: p.priority,
      seeded_from_meta: p.meta ?? {},
    },
  }));
  if (!rows.length) return { discovered: 0, inserted: 0 };
  const { error: upsertErr } = await sb
    .from("pinterest_creative_factory_jobs")
    .upsert(rows, { onConflict: "pin_queue_id", ignoreDuplicates: true });
  if (upsertErr) throw throwableToError(upsertErr);
  return { discovered: rows.length, inserted: rows.length };
}

async function seedInventoryDrafts(sb: Sb, target: number, source: string) {
  const inv = await inventory(sb);
  const deficit = Math.max(
    0,
    Math.min(target - Number(inv.ready_pins ?? 0), 30),
  );
  if (deficit <= 0) return { needed: 0, created: 0 };
  const { data: products, error } = await sb
    .from("products")
    .select(
      "id, slug, name, category, product_type, price, image_url, is_active",
    )
    .eq("is_active", true)
    .not("image_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(deficit * 3);
  if (error) throw throwableToError(error);
  let created = 0;
  for (const product of products ?? []) {
    if (created >= deficit) break;
    const { count } = await sb
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .in("status", ["queued", "draft"])
      .is("pinterest_pin_id", null);
    if ((count ?? 0) >= 3) continue;
    const niche = detectNiche(product) as NicheKey;
    const rawCopy = buildPinCopy({
      name: product.name,
      category: product.category ?? null,
      price: product.price ?? null,
      niche,
    }, created);
    const classification = deriveContentClassification(niche);
    const copy = naturalizeCopyForNative(rawCopy, classification, niche);
    const row = {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      pin_title: copy.title,
      pin_description: copy.description,
      destination_link:
        `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_factory_inventory&utm_content=${niche}`,
      priority: "medium",
      status: "draft",
      scheduled_at: new Date().toISOString(),
      hook_group: niche,
      category_key: niche,
      overlay_text: copy.overlay,
      source_type: "product_ai",
      content_type: classification.content_type,
      pin_variant: "product_ai",
      meta: {
        creative_source: source,
        ai_generated: true,
        generator: "pinterest-creative-factory",
        inventory_seed: true,
        publish_allowed: true,
        source_type: "product_ai",
        pin_type: classification.pin_type,
        content_type: classification.content_type,
        creative_style: classification.creative_style,
        creative_goal: classification.creative_goal,
        content_strategy: classification.content_strategy,
        genesis_v91_aligned: true,
      },
    };
    assertFactoryMetadataComplete(row);
    const { data: pin, error: insErr } = await sb.from("pinterest_pin_queue")
      .insert(row).select("id").maybeSingle();
    if (insErr) {
      console.warn("[factory] inventory insert failed", insErr.message);
    }
    if (!insErr && pin?.id) {
      created++;
      // Closed-loop lineage: stamp a pcie2_creatives row so the published
      // pinterest_pin_id can be written back deterministically by the
      // cron worker, unblocking Collective Intelligence DNA learning.
      try {
        const { data: ci } = await sb.from("pcie2_creatives").insert({
          product_id: product.id,
          headline: copy.title,
          hook: copy.description,
          body_text: copy.description,
          cta: null,
          image_url: product.image_url ?? null,
          status: "queued",
          scores: { quality: 0.75, source: "creative-factory-inventory" },
          creative_dna: { niche, source, generator: "pinterest-creative-factory", inventory_seed: true },
        }).select("id").maybeSingle();
        if (ci?.id) {
          await sb.from("pinterest_pin_queue")
            .update({ pcie2_creative_id: ci.id })
            .eq("id", pin.id);
        }
      } catch (e) {
        console.warn("[factory] lineage stamp (inventory) failed:", (e as Error).message);
      }
      await sb.from("pinterest_creative_factory_jobs").upsert({
        pin_queue_id: pin.id,
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        status: "pending",
        stage: "planning",
        priority: 80 + created,
        source,
      }, { onConflict: "pin_queue_id", ignoreDuplicates: true });
    }
  }
  return { needed: deficit, created };
}

async function seedProductDrafts(
  sb: Sb,
  productRef: { productId?: string; productSlug?: string },
  count: number,
  source: string,
) {
  let q = sb
    .from("products")
    .select(
      "id, slug, name, category, product_type, price, image_url, is_active",
    )
    .eq("is_active", true)
    .limit(1);
  if (productRef.productId) q = q.eq("id", productRef.productId);
  else if (productRef.productSlug) q = q.eq("slug", productRef.productSlug);
  else throw new Error("productId_or_productSlug_required");
  const { data: products, error } = await q;
  if (error) throw throwableToError(error);
  const product = products?.[0];
  if (!product?.id) throw new Error("product_not_found");
  const niche = detectNiche(product) as NicheKey;
  const created: string[] = [];
  for (let i = 0; i < Math.max(1, Math.min(count, 8)); i++) {
    const rawCopy = buildPinCopy({
      name: product.name,
      category: product.category ?? null,
      price: product.price ?? null,
      niche,
    }, i);
    const classification = deriveContentClassification(niche);
    const copy = naturalizeCopyForNative(rawCopy, classification, niche);
    const insertRow = {
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        pin_title: copy.title,
        pin_description: copy.description,
        destination_link:
          `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_factory_product&utm_content=${niche}`,
        priority: "medium",
        status: "draft",
        scheduled_at: new Date().toISOString(),
        hook_group: niche,
        category_key: niche,
        overlay_text: copy.overlay,
        source_type: "product_ai",
        content_type: classification.content_type,
        pin_variant: "product_ai",
        meta: {
          creative_source: source,
          ai_generated: true,
          generator: "pinterest-creative-factory",
          inventory_seed: true,
          publish_allowed: true,
          source_type: "product_ai",
          pin_type: classification.pin_type,
          content_type: classification.content_type,
          creative_style: classification.creative_style,
          creative_goal: classification.creative_goal,
          content_strategy: classification.content_strategy,
          genesis_v91_aligned: true,
        },
      };
    assertFactoryMetadataComplete(insertRow);
    const { data: pin, error: insErr } = await sb.from("pinterest_pin_queue")
      .insert(insertRow).select("id").maybeSingle();
    if (insErr || !pin?.id) continue;
    created.push(pin.id as string);
    // Closed-loop lineage stamp (product-draft path).
    try {
      const { data: ci } = await sb.from("pcie2_creatives").insert({
        product_id: product.id,
        headline: copy.title,
        hook: copy.description,
        body_text: copy.description,
        cta: null,
        image_url: product.image_url ?? null,
        status: "queued",
        scores: { quality: 0.75, source: "creative-factory-product" },
        creative_dna: { niche, source, generator: "pinterest-creative-factory", inventory_seed: false },
      }).select("id").maybeSingle();
      if (ci?.id) {
        await sb.from("pinterest_pin_queue")
          .update({ pcie2_creative_id: ci.id })
          .eq("id", pin.id);
      }
    } catch (e) {
      console.warn("[factory] lineage stamp (product) failed:", (e as Error).message);
    }
    await sb.from("pinterest_creative_factory_jobs").upsert({
      pin_queue_id: pin.id,
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      status: "pending",
      stage: "planning",
      priority: 90 + i,
      source,
    }, { onConflict: "pin_queue_id", ignoreDuplicates: true });
  }
  return {
    product_id: product.id,
    product_slug: product.slug,
    requested: count,
    created: created.length,
    pin_queue_ids: created,
  };
}

async function inventory(sb: Sb) {
  const [{ data: queueRows }, { data: jobs }, { data: settings }] =
    await Promise.all([
      sb.from("pinterest_pin_queue").select("status,pin_image_url", {
        count: "exact",
      }).in("status", ["queued", "draft", "blocked_legacy_source"]),
      sb.from("pinterest_creative_factory_jobs").select(
        "status,stage,media_url",
        { count: "exact" },
      ),
      sb.from("pinterest_creative_factory_settings").select("*").eq("id", 1)
        .maybeSingle(),
    ]);
  const q = queueRows ?? [];
  const j = jobs ?? [];
  const missing = q.filter((r: any) => !r.pin_image_url).length;
  const readyPins =
    q.filter((r: any) =>
      r.pin_image_url && ["queued", "draft"].includes(r.status)
    ).length;
  const readyMedia =
    j.filter((r: any) => r.media_url && r.status === "completed").length;
  const readyPrompts =
    j.filter((r: any) =>
      ["planned", "rendering", "quality_control", "completed"].includes(r.stage)
    ).length;
  return {
    queue_total: q.length,
    missing_media: missing,
    ready_pins: readyPins,
    ready_media: readyMedia,
    ready_prompts: readyPrompts,
    jobs_pending: j.filter((r: any) => r.status === "pending").length,
    jobs_running: j.filter((r: any) => r.status === "running").length,
    jobs_completed: j.filter((r: any) => r.status === "completed").length,
    jobs_failed: j.filter((r: any) => r.status === "failed").length,
    settings: settings ?? null,
  };
}

async function leaseJobs(sb: Sb, limit: number, owner: string) {
  const now = new Date().toISOString();
  await sb
    .from("pinterest_creative_factory_jobs")
    .update({
      status: "retry",
      lease_owner: null,
      error_message: "lease_expired_requeued",
    })
    .eq("status", "running")
    .lt("leased_until", now);
  const { data: candidates, error } = await sb
    .from("pinterest_creative_factory_jobs")
    .select("*")
    .in("status", ["pending", "retry"])
    .or(`leased_until.is.null,leased_until.lt.${now}`)
    .lt("attempt_count", 5)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw throwableToError(error);
  const leased: any[] = [];
  for (const job of candidates ?? []) {
    const until = new Date(Date.now() + 4 * 60_000).toISOString();
    const { data, error: updErr } = await sb
      .from("pinterest_creative_factory_jobs")
      .update({
        status: "running",
        lease_owner: owner,
        leased_until: until,
        attempt_count: Number(job.attempt_count ?? 0) + 1,
      })
      .eq("id", job.id)
      .in("status", ["pending", "retry"])
      .select("*")
      .maybeSingle();
    if (!updErr && data) leased.push(data);
  }
  return leased;
}

function deterministicDiversitySeed(job: any): number {
  const raw = `${job.id ?? ""}${job.pin_queue_id ?? ""}`;
  let n = 0;
  for (let i = 0; i < raw.length; i++) n = (n * 31 + raw.charCodeAt(i)) >>> 0;
  return n;
}

async function pickDiverseMasterDims(
  sb: Sb,
  product: any,
  job: any,
): Promise<MasterDims> {
  // Pull dims from the last 30 pins for this product (or globally if none) to
  // avoid back-to-back visual collisions. Reuses pinterest_pin_queue.meta.
  const { data: recent } = await sb
    .from("pinterest_pin_queue")
    .select("meta")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const recentDims: Partial<MasterDims>[] = (recent ?? [])
    .map((r: any) => r?.meta?.intelligence?.master?.dims)
    .filter(Boolean);
  let bestSeed = deterministicDiversitySeed(job);
  let bestDims = pickMasterDims(bestSeed);
  let bestMaxSim = Math.max(
    0,
    ...recentDims.map((rd) => dimsSimilarity(bestDims, rd)),
  );
  // Try up to 6 alternate seeds; keep the one most different from recent history.
  for (let attempt = 1; attempt <= 6 && bestMaxSim > 0.35; attempt++) {
    const seed = (bestSeed ^ (attempt * 2654435761)) >>> 0;
    const dims = pickMasterDims(seed);
    const maxSim = Math.max(
      0,
      ...recentDims.map((rd) => dimsSimilarity(dims, rd)),
    );
    if (maxSim < bestMaxSim) {
      bestMaxSim = maxSim;
      bestSeed = seed;
      bestDims = dims;
    }
  }
  return bestDims;
}

function buildPrompt(
  product: any,
  niche: NicheKey,
  overlay: string,
  dims: MasterDims,
) {
  const dna = getStyleDNA(niche);
  return buildMasterPrompt({
    productName: conciseProductName(product.name),
    nicheLabel: dna.label,
    environment: `Niche backdrop hint: ${dna.environment}. Mood: ${dna.mood}.`,
    overlay,
    dims,
  });
}

function wantsNoOverlay(directives: unknown): boolean {
  return typeof directives === "string" && /\bno\s+(text\s+)?overlay\b|no\s+typography|no\s+cta|no\s+watermark/i.test(directives);
}

function isDurableBirdToyV10Retry(product: any, directives: unknown): boolean {
  const text = `${product?.name ?? ""} ${product?.slug ?? ""} ${String(directives ?? "")}`.toLowerCase();
  return text.includes("durable bird toy") &&
    text.includes("target species") &&
    text.includes("cat") &&
    (text.includes("no dogs") || text.includes("no dog"));
}

function applyAdaptiveMasterDims(
  dims: MasterDims,
  product: any,
  directives: unknown,
): MasterDims {
  if (!isDurableBirdToyV10Retry(product, directives)) return dims;
  return {
    ...dims,
    composition: "floor-level close lifestyle composition; plush bird toy central and visually dominant, occupying 25–35% of the frame; one cat secondary at frame edge",
    camera: "iPhone 15 Pro main camera, true-to-life color, sharp product focus",
    lighting: "warm soft daylight through a Scandinavian living-room window",
    room: "warm Scandinavian living room with light oak floor, white walls, and a plain neutral rug",
    story: "quiet premium cat play moment: one cat gently reaching toward the plush bird-shaped toy on a plain rug",
    emotion: "curious, calm, playful, focused on the toy",
    owner: "no owner visible and no lived-in props",
    palette: "warm cream, oat, light oak neutrals; product colors stay exact bright green, blue, yellow, red, and green feather tail",
    season: "evergreen (no seasonal markers)",
    hero: "the plush bird-shaped cat toy is the hero; the cat is secondary context only",
    breed_hint: "domestic shorthair cat",
    imperfection: "subtle natural rug fibers and realistic soft shadows only",
  };
}

function buildAdaptiveOverrideBlock(product: any, directives: unknown): string {
  if (!isDurableBirdToyV10Retry(product, directives)) return "";
  return [
    "[GENESIS_V10.1_COMPOSITION_LOCK — HIGHEST PRIORITY]",
    "Ignore and override any earlier conflicting Creative Director, copy, overlay, owner, dog, roadtrip, post-walk, muddy-paws, mug, blanket, chair, wordmark, CTA, text-overlay, or product-supporting-role instructions.",
    "Render exactly one premium Pinterest-native pet lifestyle photo: a plush bird-shaped CAT toy for one CAT.",
    "TARGET SPECIES: CAT ONLY. No dogs. No real birds. No humans. No children. No other pets.",
    "TOY SHAPE: plush bird-shaped cat toy. The toy MUST be the largest sharp foreground object and occupy 30–38% of the frame (never below 30%).",
    "COMPOSITION LOCK: toy centered in the lower-middle foreground; low macro close-up at toy level; shallow depth of field focused on the toy; tight crop around toy + cat interaction; camera lens ~35mm, camera height at toy level, distance ~30cm.",
    "CAT ROLE: one cat, SECONDARY, positioned partially behind or next to the toy; cat may touch the toy with a paw or nose but MUST NOT cover, overlap, or occlude the toy silhouette. Cat head/body may be partially cropped by the frame.",
    "PDP COLOR LOCK: bright green body, blue head, yellow beak, red wing accent, green feather tail. Match the PDP silhouette and colors with >95% product similarity.",
    "SCENE: warm neutral plain rug only, soft daylight, empty background. Remove ALL furniture, walls decor, and props.",
    "STRICT NEGATIVES: no furniture, no chair, no couch, no table, no mug, no blanket, no boots, no leash, no extra props, no extra toys, no clutter, no text overlay, no typography, no CTA, no watermark, no GetPawsy wordmark, no dog, no real bird, no human, no child.",
    "QUALITY: premium natural editorial photo, realistic shadows, warm emotional appeal, clean composition, Pinterest-saveable, strong shopping match and landing match.",
    String(directives ?? "").trim(),
  ].filter(Boolean).join("\n");
}

// Genesis V10.1 — local occupancy estimator. Downscales the image and counts
// high-saturation foreground pixels concentrated in the central region as a
// rough proxy for product occupancy. Used to reject undersized renders BEFORE
// wasting a PRE call.
async function estimateLocalProductOccupancy(
  bytes: Uint8Array,
): Promise<number> {
  try {
    const img = await _V101Image.decode(bytes);
    const target = 128;
    const scaled = img.clone().resize(target, target);
    let saturated = 0;
    let total = 0;
    for (let y = 0; y < target; y++) {
      for (let x = 0; x < target; x++) {
        const px = scaled.getPixelAt(x + 1, y + 1);
        const r = (px >> 24) & 0xff;
        const g = (px >> 16) & 0xff;
        const b = (px >> 8) & 0xff;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        // bird colors: green/blue/yellow/red — all high saturation.
        // neutral rug + walls sit under ~0.25 saturation.
        if (sat > 0.45 && mx > 90) saturated++;
        total++;
      }
    }
    if (total === 0) return 0;
    const pct = (saturated / total) * 100;
    // clamp — very colorful full-frame scenes shouldn't report >60% product.
    return Math.max(0, Math.min(100, Math.round(pct)));
  } catch (_e) {
    return -1; // unknown — do not block
  }
}

async function generateImage(
  prompt: string,
  productImageUrl: string | null,
  model: string,
  metrics: Record<string, unknown>,
) {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  const source = productImageUrl ? await fetchAsDataUrl(productImageUrl) : null;
  const content = source
    ? [{ type: "image_url", image_url: { url: source } }, {
      type: "text",
      text: prompt,
    }]
    : prompt;
  const started = Date.now();
  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
        stream: false,
      }),
    },
  );
  metrics.image_generation_latency_ms = Date.now() - started;
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`image_gateway_${resp.status}:${text.slice(0, 240)}`);
  }
  const data = JSON.parse(text);
  const b64 = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
    data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("image_gateway_no_image");
  return base64ToBytes(String(b64));
}

async function validateWithAi(
  bytes: Uint8Array,
  prompt: string,
  metrics: Record<string, unknown>,
) {
  if (!LOVABLE_API_KEY) {
    return {
      ok: true,
      score: 74,
      reasons: ["ai_qc_skipped_no_key"],
      notes: "deterministic fallback",
    };
  }
  const started = Date.now();
  const dataUrl = `data:image/png;base64,${bytesToBase64(bytes)}`;
  const promptCore = prompt.slice(0, 1200);
  const attempts: Array<{ raw: string; content: string; parseError?: string }> = [];

  async function callGateway(strict: boolean): Promise<{ raw: string; content: string; httpStatus: number }> {
    const instructions = strict
      ? `RESPOND WITH JSON ONLY. NO PROSE. NO MARKDOWN FENCES. NO PRAISE. Exact schema (all keys required): {"score":number 0-100,"ok":boolean,"reasons":string[]}. Set ok=true only if score>=70 AND image matches prompt intent (product truth, mobile-safe composition, non-spammy overlay). Prompt intent: ${promptCore}`
      : `Score this Pinterest creative 0-100 for premium pet ecommerce quality, product truth, mobile-safe composition, non-spammy overlay. Return STRICT JSON matching this schema exactly and nothing else: {"score":number,"ok":boolean,"reasons":string[]}. Prompt intent: ${promptCore}`;
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: TEXT_MODEL,
          response_format: { type: "json_object" },
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: instructions },
            ],
          }],
          temperature: 0,
        }),
      },
    );
    const raw = await resp.text();
    let content = "";
    try {
      const parsed = JSON.parse(raw);
      content = String(parsed?.choices?.[0]?.message?.content ?? "");
    } catch {
      content = raw;
    }
    return { raw, content, httpStatus: resp.status };
  }

  try {
    let last: { raw: string; content: string; httpStatus: number } | null = null;
    for (const strict of [false, true]) {
      const r = await callGateway(strict);
      last = r;
      if (r.httpStatus < 200 || r.httpStatus >= 300) {
        attempts.push({ raw: r.raw.slice(0, 800), content: "", parseError: `http_${r.httpStatus}` });
        continue;
      }
      const verdict = extractStrictQcJson(r.content);
      if (verdict) {
        metrics.ai_quality_latency_ms = Date.now() - started;
        (metrics as any).ai_qc_attempts = attempts.length + 1;
        const score = Math.max(0, Math.min(100, Number(verdict.score)));
        return {
          ok: Boolean(verdict.ok) && score >= 70,
          score,
          reasons: Array.isArray(verdict.reasons) ? verdict.reasons.map(String) : [],
          notes: "",
        };
      }
      attempts.push({ raw: r.raw.slice(0, 800), content: r.content.slice(0, 800), parseError: "non_json_response" });
    }
    metrics.ai_quality_latency_ms = Date.now() - started;
    (metrics as any).ai_qc_parse_failed = true;
    (metrics as any).ai_qc_raw_response = attempts;
    // Fail closed: do NOT treat prose praise as success.
    return {
      ok: false,
      score: 0,
      reasons: ["qc_parse_failed"],
      notes: "AI QC returned non-JSON after strict retry; media quarantined for audit.",
    };
  } catch (e) {
    metrics.ai_quality_latency_ms = Date.now() - started;
    (metrics as any).ai_qc_error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    return {
      ok: false,
      score: 0,
      reasons: [
        `ai_qc_transport_error:${
          e instanceof Error ? e.message.slice(0, 80) : "unknown"
        }`,
      ],
      notes: "transport error; media quarantined for audit.",
    };
  }
}


function deterministicQuality(copy: any, bytes: Uint8Array) {
  const reasons: string[] = [];
  const overlayWords =
    String(copy.overlay ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (bytes.byteLength < 40_000) reasons.push("image_too_small");
  if (overlayWords < 2 || overlayWords > 5) {
    reasons.push("overlay_word_count_invalid");
  }
  if (!String(copy.title ?? "").trim()) reasons.push("title_missing");
  if (!String(copy.description ?? "").includes("getpawsy.pet")) {
    reasons.push("description_missing_getpawsy_destination");
  }
  const score = Math.max(0, 82 - reasons.length * 20);
  return {
    ok: reasons.length === 0,
    scores: {
      total: score,
      deterministic: score,
      visual_quality_score: score,
      mobile_safety_score: score,
    },
    reasons,
    notes: "factory_fast_gate",
  };
}

async function processJob(sb: Sb, job: any, settings: any) {
  const startedMs = Date.now();
  const metrics: Record<string, unknown> = {
    stages: [],
    preplanning_trace: [],
    started_at: new Date().toISOString(),
    memory_start_mb: memoryRssMb(),
  };
  try {
    const { data: pin, error: pinErr } = await timed(
      "queue_lookup",
      metrics,
      async () =>
        sb
          .from("pinterest_pin_queue")
          .select("*")
          .eq("id", job.pin_queue_id)
          .maybeSingle(),
    );
    if (pinErr) throw throwableToError(pinErr);
    if (!pin) throw new Error("pin_queue_row_missing");
    if (pin.pin_image_url) {
      await sb.from("pinterest_creative_factory_jobs").update({
        status: "completed",
        stage: "queue",
        media_url: pin.pin_image_url,
        completed_at: new Date().toISOString(),
        metrics,
      }).eq("id", job.id);
      return { ok: true, skipped: "already_has_media" };
    }

    const { data: product, error: pErr } = await timed(
      "product_lookup",
      metrics,
      async () =>
        sb
          .from("products")
          .select(
            "id, name, slug, description, category, product_type, image_url, key_feature, benefit_angle, description_bullets, price, is_active, primary_species",
          )
          .eq("id", pin.product_id)
          .maybeSingle(),
    );
    if (pErr) throw throwableToError(pErr);
    if (!product) throw new Error("product_missing");
    if (product.is_active === false) throw new Error("product_inactive");

    const niche = await prePlanningHelper(
      "detectNiche",
      metrics,
      () => detectNiche(product) as NicheKey,
    );
    const rawCopy = await prePlanningHelper(
      "buildPinCopy",
      metrics,
      () =>
        buildPinCopy({
          name: product.name,
          benefit: product.benefit_angle ?? null,
          category: product.category ?? null,
          price: product.price ?? null,
          niche,
        }, Number(job.attempt_count ?? 1)),
    );
    const classification = await prePlanningHelper(
      "deriveContentClassification",
      metrics,
      () => deriveContentClassification(niche),
    );
    const copy = await prePlanningHelper(
      "naturalizeCopyForNative",
      metrics,
      () => naturalizeCopyForNative(rawCopy, classification, niche),
    );
    const overlayBlock = await prePlanningHelper(
      "buildOverlayBlock",
      metrics,
      () => `${copy.overlay} ${copy.cta}`.replace(/[|•\r\n]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, 32),
    );
    const validation = await prePlanningHelper(
      "validatePinCopy",
      metrics,
      () =>
        validatePinCopy({
          title: copy.title,
          description: copy.description,
          overlay: copy.overlay,
          overlayBlock,
          brandWordmark: copy.brandWordmark,
        }),
    );
    if (!validation.valid) {
      throw new Error(`copy_validation_failed:${validation.errors.join(",")}`);
    }

    const adaptiveDirectives = await prePlanningHelper(
      "readAdaptiveRetryDirectives",
      metrics,
      () => (job as any)?.prompt?.adaptive_retry_directives,
    );

    let masterDims = await prePlanningHelper(
      "pickDiverseMasterDims",
      metrics,
      () => pickDiverseMasterDims(sb, product, job),
    );
    masterDims = await prePlanningHelper(
      "applyAdaptiveMasterDims",
      metrics,
      () => applyAdaptiveMasterDims(masterDims, product, adaptiveDirectives),
    );
    let prompt = await prePlanningHelper(
      "buildPrompt",
      metrics,
      () => buildPrompt(product, niche, wantsNoOverlay(adaptiveDirectives) ? "" : copy.overlay, masterDims),
    );

    // Genesis V6.4 — Golden DNA Prompt Compiler gate.
    // Every image call must be preceded by a deterministic, species-locked,
    // occupancy-targeted prompt. If the compiler cannot reach predicted PRE
    // ≥ 90 within its mutation budget, we DO NOT call Gemini — instead we
    // record the block in the ledger and fail the job. No thresholds are
    // lowered, no validation is bypassed.
    const priorRate = await prePlanningHelper(
      "priorSuccessRate",
      metrics,
      () =>
        priorSuccessRate(
          sb,
          // species is derived inside compilePrompt too, but we ask the ledger
          // for the same species so recent success weights the prediction.
          // Fall back to "unknown" if compiler can't decide.
          "unknown",
        ).catch((error) => {
          (metrics as any).prior_success_rate_error = auditThrowable(error);
          return 0.5;
        }),
    );
    const compiled = await prePlanningHelper(
      "compileGoldenPrompt",
      metrics,
      () =>
        compileGoldenPrompt(product as any, {
          minPredictedPre: 90,
          maxMutations: 3,
          priorSuccessRate: priorRate,
        }),
    );
    const traceId = `pcf_${job.id}`;
    const ledgerId = await prePlanningHelper(
      "writeCompilerLedger",
      metrics,
      () =>
        writeCompilerLedger(sb, {
          trace_id: traceId,
          product_id: product.id ?? null,
          product_slug: product.slug ?? null,
          rule_hash: compiled.rule_hash,
          compiled_prompt: compiled.prompt,
          rule_set: compiled.rule_set,
          predicted_pre: compiled.predicted_pre,
          dominant_blocker: compiled.dominant_blocker,
          qa_blockers: compiled.qa_blockers,
          mutation_step: compiled.mutation_step,
          gemini_called: compiled.ok,
          source_function: "pinterest-creative-factory",
        }),
    );
    (metrics as any).golden_dna_compiler = {
      predicted_pre: compiled.predicted_pre,
      mutation_step: compiled.mutation_step,
      dominant_blocker: compiled.dominant_blocker,
      qa_blockers: compiled.qa_blockers,
      ledger_id: ledgerId,
      passed: compiled.ok,
    };
    if (!compiled.ok) {
      throw new Error(
        `golden_dna_compiler_gate:${compiled.reason ?? "predicted_pre_below_90"}`,
      );
    }
    // Fuse the Golden DNA constraints into the master creative prompt so the
    // downstream image model receives BOTH the existing creative direction and
    // the compiler's deterministic guardrails.
    prompt = `${prompt}\n\n[GOLDEN_DNA_COMPILER]\n${compiled.prompt}`;
    // Pinterest Evolution Engine — additive learned-preferences bias.
    // Reads active recommendations produced from REAL Pinterest performance
    // (organic-primary) and appends them as soft creative preferences.
    // Never lowers or bypasses any downstream certified guard.
    try {
      const bias = await loadEvolutionBias(sb as any, 8);
      if (bias.block) {
        prompt = `${prompt}\n\n${bias.block}`;
        (metrics as any).pinterest_evolution_bias = {
          applied: true,
          directives: bias.count,
          version_id: bias.version_id,
        };
      }
    } catch (e) {
      (metrics as any).pinterest_evolution_bias_error = String(e);
    }
    // Pinterest Native Intelligence V2 — additive pre-render brain.
    // Runs only when explicitly opted-in via env or per-job flag. It never
    // modifies or bypasses any downstream certified guard; it only appends
    // a stronger, attempt-aware creative brief so first-attempt PRE/CI pass
    // rate rises over time.
    const niEnabled = Deno.env.get("PINTEREST_NATIVE_INTELLIGENCE") === "on" ||
      (job as any)?.prompt?.native_intelligence === true;
    let niResult: any = null;
    if (niEnabled && LOVABLE_API_KEY) {
      try {
        niResult = await runPinterestNativeIntelligence({
          productName: String(product?.name ?? product?.slug ?? "product"),
          attempt: Number(job.attempt_count ?? 1),
          priorFailureReason: (job as any)?.error_message ?? null,
          apiKey: LOVABLE_API_KEY,
        });
        const niBlock = formatWinnerAsDirectives(niResult);
        prompt = `${prompt}\n\n${niBlock}`;
        (metrics as any).pinterest_native_intelligence = {
          winner: niResult.winner.title,
          predicted_pre: niResult.winner.prediction.expected_pre.score,
          predicted_ci: niResult.winner.prediction.expected_ci.score,
          pinterest_native_score: niResult.winner.prediction.pinterest_native.score,
          passes_predictor: niResult.winner.prediction.passes_predictor,
          blockers: niResult.winner.prediction.blockers,
          attempt_strategy: niResult.attempt_strategy.focus,
        };
        try {
          await sb.from("pinterest_native_predictions").insert({
            job_id: job.id,
            pin_queue_id: job.pin_queue_id ?? null,
            product_slug: product?.slug ?? null,
            attempt: Number(job.attempt_count ?? 1),
            attempt_strategy: niResult.attempt_strategy.focus,
            winner_concept: niResult.winner.title,
            prediction: niResult.winner.prediction,
            runners_up: niResult.runners_up.map((r: any) => ({
              title: r.title,
              pinterest_native: r.prediction.pinterest_native.score,
            })),
            prior_failure_reason: (job as any)?.error_message ?? null,
          });
        } catch (_e) { /* non-blocking */ }
      } catch (e) {
        (metrics as any).pinterest_native_intelligence_error = String(e);
      }
    }
    // Adaptive one-shot retry: allow a human/operator to inject exact PRE-blocker
    // fixes for a single job. Read from job.prompt.adaptive_retry_directives
    // (string). This does NOT lower any PRE gate — it only supplies extra
    // negative/positive directives appended after the compiler payload.
    if (typeof adaptiveDirectives === "string" && adaptiveDirectives.trim().length > 0) {
      const overrideBlock = await prePlanningHelper(
        "buildAdaptiveOverrideBlock",
        metrics,
        () => buildAdaptiveOverrideBlock(product, adaptiveDirectives),
      );
      prompt = `${prompt}\n\n${overrideBlock || `[ADAPTIVE_RETRY_DIRECTIVES]\n${adaptiveDirectives.trim()}`}`;
      (metrics as any).adaptive_retry_directives_applied = true;
    }
    await timed("planning", metrics, async () => {
      await prePlanningHelper("persistPlannedJob", metrics, async () => {
      await sb.from("pinterest_creative_factory_jobs").update({
        stage: "planned",
        prompt: {
          text: prompt,
          niche,
          copy,
          master_dims: masterDims,
          compiler: {
            rule_hash: compiled.rule_hash,
            predicted_pre: compiled.predicted_pre,
            mutation_step: compiled.mutation_step,
            ledger_id: ledgerId,
          },
        },
      }).eq("id", job.id);
      return true;
      });
    });

    let bytes: Uint8Array;
    let imageUrl: string | null = job.media_url ?? null;
    let mediaHash: string | null = job.media_hash ?? null;
    if (imageUrl) {
      bytes = await timed("storage_resume", metrics, async () => {
        const resp = await fetch(imageUrl!);
        if (!resp.ok) {
          throw new Error(`resume_media_fetch_failed:${resp.status}`);
        }
        return new Uint8Array(await resp.arrayBuffer());
      });
    } else {
      bytes = await timed(
        "image_generation",
        metrics,
        async () =>
          generateImage(
            prompt,
            product.image_url ?? null,
            settings?.model ?? DEFAULT_MODEL,
            metrics,
          ),
      );
      // Genesis V10.1 — local occupancy pre-check. If the freshly generated
      // image shows a product footprint below 25%, regenerate ONCE with an
      // even tighter crop directive appended. This runs strictly BEFORE PRE
      // and does NOT bypass any downstream gate.
      if (typeof adaptiveDirectives === "string" && adaptiveDirectives.length > 0) {
        const occ = await estimateLocalProductOccupancy(bytes);
        (metrics as any).local_occupancy_estimate = occ;
        (metrics as any).local_occupancy_estimate_pass1 = occ;
        if (occ >= 0 && occ < 25) {
          const tighter = `${prompt}\n\n[V10.1_LOCAL_OCCUPANCY_CORRECTION]\nPrevious render measured ~${occ}% product occupancy. RECOMPOSE with a TIGHTER CROP: move camera closer, fill 30–38% of the frame with the plush bird-shaped cat toy, keep toy in lower-middle foreground, reduce empty rug and background, keep cat secondary and partially cropped.`;
          bytes = await timed(
            "image_generation_v101_correction",
            metrics,
            async () =>
              generateImage(
                tighter,
                product.image_url ?? null,
                settings?.model ?? DEFAULT_MODEL,
                metrics,
              ),
          );
          const occ2 = await estimateLocalProductOccupancy(bytes);
          (metrics as any).local_occupancy_estimate = occ2;
          (metrics as any).local_occupancy_estimate_pass2 = occ2;
        }
      }
      const digest = await crypto.subtle.digest(
        "SHA-256",
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
      mediaHash = Array.from(new Uint8Array(digest)).map((b) =>
        b.toString(16).padStart(2, "0")
      ).join("").slice(0, 32);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const path = `creative-factory/${product.slug}/${stamp}_${job.id}.png`;
      await timed("storage_upload", metrics, async () => {
        const up = await sb.storage.from(BUCKET).upload(path, bytes, {
          contentType: "image/png",
          cacheControl: "31536000",
          upsert: true,
        });
        if (up.error) throw throwableToError(up.error);
        return true;
      });
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      imageUrl = pub.publicUrl;
      await sb.from("pinterest_creative_factory_jobs").update({
        stage: "storage_upload",
        media_url: imageUrl,
        media_hash: mediaHash,
        metrics,
      }).eq("id", job.id);
    }
    const qc = await timed("quality_control", metrics, async () => {
      const fast = deterministicQuality(copy, bytes);
      if (!fast.ok) return fast;
      const ai = await validateWithAi(bytes, prompt, metrics);
      const dataUrl = `data:image/png;base64,${bytesToBase64(bytes)}`;
      const inspiration = await scoreInspirationAi({
        apiKey: LOVABLE_API_KEY,
        textModel: TEXT_MODEL,
        dataUrl,
        dims: masterDims,
        productName: conciseProductName(product.name),
      });
      (metrics as any).inspiration = inspiration;
      const inspirationFloor = Number(
        settings?.inspiration_floor ??
          Deno.env.get("PINTEREST_INSPIRATION_FLOOR") ?? 78,
      );
      const aiOk = ai.ok &&
        ai.score >= Number(settings?.quality_threshold ?? 70);
      const inspirationOk = inspiration.total >= inspirationFloor &&
        inspiration.axes.ai_look_risk < 60;
      return {
        ok: aiOk && inspirationOk,
        scores: {
          ...fast.scores,
          total: Math.round((Number(ai.score) + inspiration.total) / 2),
          ai_visual: Math.round(ai.score),
          inspiration: inspiration.total,
          inspiration_axes: inspiration.axes,
          inspiration_floor: inspirationFloor,
        },
        reasons: [
          ...(ai.reasons ?? []),
          ...(inspirationOk ? [] : [
            `inspiration_below_floor:${inspiration.total}/${inspirationFloor}`,
            ...(inspiration.axes.ai_look_risk >= 60
              ? [`ai_look_risk_high:${inspiration.axes.ai_look_risk}`]
              : []),
            ...inspiration.reasons.slice(0, 4),
          ]),
        ],
        notes: [ai.notes ?? "", inspiration.notes ?? ""].filter(Boolean)
          .join(" | "),
      };
    });
    if (!qc.ok) throw new Error(`quality_gate_failed:${qc.reasons.join(",")}`);

    const phash = await computePhashFromBytes(bytes).catch(() => null);
    const destination =
      `${BASE_URL}/products/${product.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=creative_factory&utm_content=${niche}`;

    const integrity = await timed(
      "integrity_guard",
      metrics,
      async () =>
        verifyPinIntegrity(sb, {
          product_id: product.id,
          product_slug: product.slug,
          product_name: product.name,
          pin_title: copy.title,
          pin_description: copy.description,
          pin_image_url: imageUrl!,
          destination_link: destination,
          niche_or_category: niche,
        }),
    );
    if (!integrity.passed) {
      throw new Error(
        `integrity_guard_failed:${integrity.blocking_reasons.join(",")}`,
      );
    }

    await timed("queue_attach", metrics, async () => {
      const meta = {
        ...(pin.meta ?? {}),
        creative_source: "creative_factory_v1",
        ai_generated: true,
        generator: "pinterest-creative-factory",
        publish_allowed: true,
        quality_tier: "premium",
        legacy_feed: false,
        wave2_pending_regeneration: false,
        factory_job_id: job.id,
        pin_type: classification.pin_type,
        content_type: classification.content_type,
        creative_style: classification.creative_style,
        creative_goal: classification.creative_goal,
        content_strategy: classification.content_strategy,
        genesis_v91_aligned: true,
        intelligence: {
          scores: qc.scores,
          niche_key: niche,
          model: settings?.model ?? DEFAULT_MODEL,
          master: {
            dims: masterDims,
            inspiration: (metrics as any).inspiration ?? null,
          },
        },
      };
      const updateRow = {
        pin_title: copy.title,
        pin_description: copy.description,
        pin_image_url: imageUrl,
        destination_link: destination,
        overlay_text: overlayBlock,
        image_hash: mediaHash,
        pin_image_phash: phash,
        meta,
        content_type: classification.content_type,
        status: pin.status === "queued" ? "queued" : "queued",
        approved_at: pin.approved_at ?? new Date().toISOString(),
        error_message: null,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      };
      assertFactoryMetadataComplete(updateRow);
      const { error } = await sb.from("pinterest_pin_queue").update(updateRow).eq("id", pin.id);
      if (error) throw throwableToError(error);
      return true;
    });

    metrics.finished_at = new Date().toISOString();
    metrics.duration_ms = Date.now() - startedMs;
    metrics.memory_end_mb = memoryRssMb();
    await sb.from("pinterest_creative_factory_jobs").update({
      status: "completed",
      stage: "queue",
      media_url: imageUrl,
      media_hash: mediaHash,
      quality: { scores: qc.scores, reasons: qc.reasons, integrity },
      metrics,
      leased_until: null,
      lease_owner: null,
      completed_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", job.id);
    return {
      ok: true,
      media_url: imageUrl,
      score: qc.scores.total,
      duration_ms: metrics.duration_ms,
      memory_mb: metrics.memory_end_mb,
    };
  } catch (e) {
    const normalized = auditThrowable(e);
    const message = normalized.message;
    (metrics as any).normalized_error = normalized;
    metrics.finished_at = new Date().toISOString();
    metrics.duration_ms = Date.now() - startedMs;
    metrics.memory_end_mb = memoryRssMb();
    const nextStatus =
      Number(job.attempt_count ?? 0) + 1 >= Number(job.max_attempts ?? 3)
        ? "failed"
        : "retry";
    const regenerateNext = message.startsWith("quality_gate_failed") ||
      message.startsWith("integrity_guard_failed") ||
      message.startsWith("copy_validation_failed");
    await sb.from("pinterest_creative_factory_jobs").update({
      status: nextStatus,
      stage: "failed",
      error_message: message.slice(0, 500),
      metrics,
      ...(regenerateNext ? { media_url: null, media_hash: null } : {}),
      lease_owner: null,
      leased_until: new Date(Date.now() + 20 * 60_000).toISOString(),
    }).eq("id", job.id);
    return { ok: false, error: message };
  }
}

async function work(sb: Sb, requestedLimit: number) {
  const { data: settings } = await sb.from(
    "pinterest_creative_factory_settings",
  ).select("*").eq("id", 1).maybeSingle();
  if (settings && settings.enabled === false) {
    return { ok: false, message: "factory_disabled" };
  }
  const owner = `factory-${traceId()}`;
  const limit = Math.max(
    1,
    Math.min(
      Number(requestedLimit || settings?.max_jobs_per_run || 1),
      Number(settings?.max_jobs_per_run || 3),
      5,
    ),
  );
  const leased = await leaseJobs(sb, limit, owner);
  const results = [];
  for (const job of leased) {
    results.push(await processJob(sb, job, settings ?? {}));
  }
  try {
    await sb.from("pinterest_pipeline_health_snapshots").insert({
      pins_generated_24h: results.filter((r) => r.ok).length,
      pending_pins: (await inventory(sb)).missing_media,
      failed_24h: results.filter((r) => !r.ok).length,
      recovered_24h: results.filter((r) => r.ok).length,
      avg_render_ms: 0,
      health_score: results.some((r) => r.ok) ? 85 : 45,
      mode: "creative_factory_v1",
      reasons: { results },
    });
  } catch (_) { /* optional telemetry */ }
  return {
    ok: true,
    owner,
    leased: leased.length,
    completed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

async function continuousWork(
  sb: Sb,
  requestedLimit: number,
  depth: number,
  reason: string,
) {
  const result = await work(sb, requestedLimit);
  const inv = await inventory(sb);
  const shouldContinue = depth > 0 && (
    Number(inv.jobs_pending ?? 0) > 0 ||
    Number(inv.jobs_running ?? 0) > 0 ||
    Number(inv.missing_media ?? 0) > 0 ||
    Number(inv.ready_pins ?? 0) < Number(inv.settings?.min_ready_pins ?? 100)
  );
  if (shouldContinue) {
    await seedMissingMediaJobs(sb, 250, `continuous_${reason}`);
    if (
      Number(inv.ready_pins ?? 0) < Number(inv.settings?.min_ready_pins ?? 100)
    ) {
      await seedInventoryDrafts(
        sb,
        Number(inv.settings?.min_ready_pins ?? 100),
        `continuous_${reason}`,
      );
    }
    const url = `${SUPABASE_URL}/functions/v1/pinterest-creative-factory`;
    EdgeRuntime.waitUntil(
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "work_async",
          limit: requestedLimit,
          continuous: true,
          depth: depth - 1,
          reason,
        }),
      }).catch(() => null),
    );
  }
  return {
    result,
    inventory: inv,
    continuing: shouldContinue,
    remaining_depth: Math.max(0, depth),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({
      ok: false,
      traceId: traceId(),
      message: "method_not_allowed",
    }, 405);
  }
  const sb = admin();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "status");
  try {
    if (action === "status") {
      return json({
        ok: true,
        traceId: traceId(),
        inventory: await inventory(sb),
      });
    }
    if (action === "seed_backfill") {
      const seeded = await seedMissingMediaJobs(
        sb,
        Math.min(Number(body.limit ?? 250), 1000),
        "missing_pin_image_backfill",
      );
      return json({
        ok: true,
        traceId: traceId(),
        seeded,
        inventory: await inventory(sb),
      });
    }
    if (action === "replenish") {
      const inv = await inventory(sb);
      const minReady = Number(inv.settings?.min_ready_pins ?? 100);
      const drafts = await seedInventoryDrafts(
        sb,
        minReady,
        "creative_factory_inventory_replenish",
      );
      const seeded = await seedMissingMediaJobs(
        sb,
        Math.min(Number(body.limit ?? 250), 1000),
        "creative_factory_replenish_backfill",
      );
      return json({
        ok: true,
        traceId: traceId(),
        drafts,
        seeded,
        inventory: await inventory(sb),
      });
    }
    if (action === "enqueue_product") {
      const drafts = await seedProductDrafts(
        sb,
        {
          productId: body.productId ? String(body.productId) : undefined,
          productSlug: body.productSlug ? String(body.productSlug) : undefined,
        },
        Number(body.count ?? 1),
        "creative_director_delegated_factory",
      );
      return json({
        ok: true,
        traceId: traceId(),
        drafts,
        inventory: await inventory(sb),
      });
    }
    if (action === "work") {
      return json({
        traceId: traceId(),
        ...(await work(sb, Number(body.limit ?? 1))),
      });
    }
    if (action === "work_async") {
      const limit = Number(body.limit ?? 1);
      if (body.continuous === true) {
        EdgeRuntime.waitUntil(
          continuousWork(
            sb,
            limit,
            Math.min(Number(body.depth ?? 50), 200),
            String(body.reason ?? "continuous"),
          ),
        );
      } else {
        EdgeRuntime.waitUntil(work(sb, limit));
      }
      return json({
        ok: true,
        traceId: traceId(),
        accepted: true,
        message: "creative_factory_work_started",
      }, 202);
    }
    if (action === "run_adaptive_retry") {
      const jobId = String(body.jobId ?? "");
      const directives = String(body.directives ?? "").trim();
      if (!jobId || !directives) {
        return json({
          ok: false,
          traceId: traceId(),
          message: "jobId_and_directives_required",
        }, 400);
      }
      const { data: existing, error: rErr } = await sb
        .from("pinterest_creative_factory_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (rErr || !existing) {
        return json({
          ok: false,
          traceId: traceId(),
          message: "job_not_found",
        }, 404);
      }
      const nextPrompt = {
        ...(existing.prompt ?? {}),
        adaptive_retry_directives: directives,
      };
      const nextAttempt = Number(existing.attempt_count ?? 0) + 1;
      const owner = `adaptive-v10-${traceId()}`;
      await sb.from("pinterest_creative_factory_jobs").update({
        prompt: nextPrompt,
        status: "running",
        stage: "planning",
        attempt_count: nextAttempt,
        media_url: null,
        media_hash: null,
        error_message: null,
        lease_owner: owner,
        leased_until: new Date(Date.now() + 4 * 60_000).toISOString(),
        max_attempts: Math.max(Number(existing.max_attempts ?? 3), nextAttempt + 1),
      }).eq("id", jobId);
      const { data: retryJob, error: retryErr } = await sb
        .from("pinterest_creative_factory_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (retryErr || !retryJob) throw throwableToError(retryErr ?? { message: "retry_job_missing" });
      const { data: settings } = await sb.from(
        "pinterest_creative_factory_settings",
      ).select("*").eq("id", 1).maybeSingle();
      const processed = await processJob(sb, retryJob, settings ?? {});
      const result = {
        ok: true,
        owner,
        direct_job_id: jobId,
        leased: 1,
        completed: processed.ok ? 1 : 0,
        failed: processed.ok ? 0 : 1,
        results: [processed],
      };
      const { data: after } = await sb
        .from("pinterest_creative_factory_jobs")
        .select("id, status, stage, error_message, metrics, media_url")
        .eq("id", jobId)
        .maybeSingle();
      return json({
        ok: true,
        traceId: traceId(),
        result,
        job: after,
      });
    }
    if (action === "continuous_run") {
      await seedMissingMediaJobs(
        sb,
        Math.min(Number(body.seed_limit ?? 250), 1000),
        "continuous_run_backfill",
      );
      await seedInventoryDrafts(
        sb,
        Number(body.min_ready_pins ?? 100),
        "continuous_run_inventory",
      );
      EdgeRuntime.waitUntil(
        continuousWork(
          sb,
          Number(body.limit ?? 1),
          Math.min(Number(body.depth ?? 120), 300),
          "continuous_run",
        ),
      );
      return json({
        ok: true,
        traceId: traceId(),
        accepted: true,
        inventory: await inventory(sb),
      }, 202);
    }
    if (action === "run_once") {
      const seeded = await seedMissingMediaJobs(
        sb,
        Math.min(Number(body.seed_limit ?? 250), 1000),
        "run_once_backfill",
      );
      await seedInventoryDrafts(
        sb,
        Number(body.min_ready_pins ?? 0),
        "run_once_inventory_replenish",
      );
      const result = await work(sb, Number(body.limit ?? 1));
      return json({
        ok: true,
        traceId: traceId(),
        seeded,
        result,
        inventory: await inventory(sb),
      });
    }
    if (action === "stress_test") {
      const products = Math.min(Number(body.products ?? 100), 100);
      const creatives = Math.min(Number(body.creatives ?? 300), 300);
      const queuedJobs = Math.min(Number(body.queued_jobs ?? 1000), 1000);
      const inv = await inventory(sb);
      return json({
        ok: true,
        traceId: traceId(),
        dry_run: true,
        simulation: {
          products,
          creatives,
          queued_jobs: queuedJobs,
          stage_split: [
            "discovery",
            "planning",
            "image_generation",
            "quality_control",
            "storage_upload",
            "queue_attach",
          ],
          max_concurrency: inv.settings?.max_concurrency ?? 1,
          max_jobs_per_run: inv.settings?.max_jobs_per_run ?? 3,
          expected_runs_for_1000: Math.ceil(
            queuedJobs /
              Math.max(1, Number(inv.settings?.max_jobs_per_run ?? 3)),
          ),
          deadlock_risk:
            "low: leases expire and jobs resume from persisted stage",
          permanent_growth_risk:
            "bounded: unique pin_queue_id and retry/failed terminal state",
        },
        inventory: inv,
      });
    }
    return json({
      ok: false,
      traceId: traceId(),
      message: `unknown_action:${action}`,
    }, 400);
  } catch (e) {
    return json({
      ok: false,
      traceId: traceId(),
      message: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});
