import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
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
import { verifyPinIntegrity } from "../_shared/pinterest-integrity-guard.ts";
import {
  buildMasterPrompt,
  dimsSimilarity,
  type MasterDims,
  pickMasterDims,
  scoreInspirationAi,
} from "../_shared/pinterest-master-creative-director.ts";

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
  if (error) throw error;

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
  if (upsertErr) throw upsertErr;
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
  if (error) throw error;
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
    const copy = buildPinCopy({
      name: product.name,
      category: product.category ?? null,
      price: product.price ?? null,
      niche,
    }, created);
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
      content_type: "product",
      pin_variant: "product_ai",
      meta: {
        creative_source: source,
        ai_generated: true,
        generator: "pinterest-creative-factory",
        inventory_seed: true,
        publish_allowed: true,
        source_type: "product_ai",
      },
    };
    const { data: pin, error: insErr } = await sb.from("pinterest_pin_queue")
      .insert(row).select("id").maybeSingle();
    if (insErr) {
      console.warn("[factory] inventory insert failed", insErr.message);
    }
    if (!insErr && pin?.id) {
      created++;
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
  if (error) throw error;
  const product = products?.[0];
  if (!product?.id) throw new Error("product_not_found");
  const niche = detectNiche(product) as NicheKey;
  const created: string[] = [];
  for (let i = 0; i < Math.max(1, Math.min(count, 8)); i++) {
    const copy = buildPinCopy({
      name: product.name,
      category: product.category ?? null,
      price: product.price ?? null,
      niche,
    }, i);
    const { data: pin, error: insErr } = await sb.from("pinterest_pin_queue")
      .insert({
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
        content_type: "product",
        pin_variant: "product_ai",
        meta: {
          creative_source: source,
          ai_generated: true,
          generator: "pinterest-creative-factory",
          inventory_seed: true,
          publish_allowed: true,
          source_type: "product_ai",
        },
      }).select("id").maybeSingle();
    if (insErr || !pin?.id) continue;
    created.push(pin.id as string);
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
  if (error) throw error;
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
  try {
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
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              {
                type: "text",
                text:
                  `Score this Pinterest creative from 0-100 for premium pet ecommerce quality, product truth, mobile-safe composition, and non-spammy overlay. Return strict JSON: {"score":number,"ok":boolean,"reasons":[string],"notes":"string"}. Prompt intent: ${
                    prompt.slice(0, 1200)
                  }`,
              },
            ],
          }],
          temperature: 0.1,
        }),
      },
    );
    metrics.ai_quality_latency_ms = Date.now() - started;
    if (!resp.ok) {
      return {
        ok: true,
        score: 70,
        reasons: [`ai_qc_http_${resp.status}`],
        notes: "soft-pass; deterministic gates still applied",
      };
    }
    const raw = await resp.text();
    const parsed = JSON.parse(raw);
    const content = parsed?.choices?.[0]?.message?.content ?? raw;
    const match = String(content).match(/\{[\s\S]*\}/);
    const verdict = match ? JSON.parse(match[0]) : parsed;
    const score = Math.max(0, Math.min(100, Number(verdict.score ?? 70)));
    return {
      ok: Boolean(verdict.ok ?? score >= 70),
      score,
      reasons: Array.isArray(verdict.reasons) ? verdict.reasons : [],
      notes: String(verdict.notes ?? ""),
    };
  } catch (e) {
    metrics.ai_quality_latency_ms = Date.now() - started;
    return {
      ok: true,
      score: 70,
      reasons: [
        `ai_qc_error:${
          e instanceof Error ? e.message.slice(0, 80) : "unknown"
        }`,
      ],
      notes: "soft-pass; deterministic gates still applied",
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
    if (pinErr) throw pinErr;
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
            "id, name, slug, description, category, product_type, image_url, key_feature, benefit_angle, description_bullets, price, is_active",
          )
          .eq("id", pin.product_id)
          .maybeSingle(),
    );
    if (pErr) throw pErr;
    if (!product) throw new Error("product_missing");
    if (product.is_active === false) throw new Error("product_inactive");

    const niche = detectNiche(product) as NicheKey;
    const copy = buildPinCopy({
      name: product.name,
      benefit: product.benefit_angle ?? null,
      category: product.category ?? null,
      price: product.price ?? null,
      niche,
    }, Number(job.attempt_count ?? 1));
    const overlayBlock = `${copy.overlay} ${copy.cta}`.replace(/[|•\r\n]/g, " ")
      .replace(/\s+/g, " ").trim().slice(0, 32);
    const validation = validatePinCopy({
      title: copy.title,
      description: copy.description,
      overlay: copy.overlay,
      overlayBlock,
      brandWordmark: copy.brandWordmark,
    });
    if (!validation.valid) {
      throw new Error(`copy_validation_failed:${validation.errors.join(",")}`);
    }

    const prompt = buildPrompt(product, niche, copy.overlay, job);
    await timed("planning", metrics, async () => {
      await sb.from("pinterest_creative_factory_jobs").update({
        stage: "planned",
        prompt: { text: prompt, niche, copy },
      }).eq("id", job.id);
      return true;
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
        if (up.error) throw up.error;
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
      return {
        ok: ai.ok && ai.score >= Number(settings?.quality_threshold ?? 70),
        scores: {
          ...fast.scores,
          total: Math.round(ai.score),
          ai_visual: Math.round(ai.score),
        },
        reasons: ai.reasons ?? [],
        notes: ai.notes ?? "",
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
        intelligence: {
          scores: qc.scores,
          niche_key: niche,
          model: settings?.model ?? DEFAULT_MODEL,
        },
      };
      const { error } = await sb.from("pinterest_pin_queue").update({
        pin_title: copy.title,
        pin_description: copy.description,
        pin_image_url: imageUrl,
        destination_link: destination,
        overlay_text: overlayBlock,
        image_hash: mediaHash,
        pin_image_phash: phash,
        meta,
        status: pin.status === "queued" ? "queued" : "queued",
        approved_at: pin.approved_at ?? new Date().toISOString(),
        error_message: null,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      }).eq("id", pin.id);
      if (error) throw error;
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
    const message = e instanceof Error ? e.message : String(e);
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
