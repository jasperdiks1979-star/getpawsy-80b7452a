// AI lifestyle backdrop generator with persistent cache.
//
// Replaces Pexels for Pinterest pin backdrops. Uses Lovable AI Gateway with
// Nano Banana 2 (`google/gemini-3.1-flash-image-preview`) to render cozy,
// realistic US-apartment scenes per query, then uploads the PNG to the
// `pinterest-ads` storage bucket and caches the public URL in
// `pinterest_ai_backdrops` so subsequent pins reuse the same hosted image.
//
// Designed to be a drop-in replacement for Pexels: returns a `{ url, ... }`
// shape compatible with the existing PexelsPhoto type used by the batch
// generator. On any failure (no API key, gateway 4xx/5xx, upload error)
// returns null so the caller falls back to its existing safe path.

const BUCKET = "pinterest-ads";
const CACHE_TABLE = "pinterest_ai_backdrops";

import {
  computePhashFromBytes,
  maxSimilarity,
  PHASH_DUPLICATE_SIMILARITY,
} from "./pinterest-phash.ts";

/** Max attempts to re-render a backdrop when pHash flags it as a near-duplicate. */
const PHASH_MAX_RETRIES = 2;

export type AiBackdropPhoto = {
  url: string;
  avgColor: string | null;
  width: number | null;
  height: number | null;
  photographer: string | null;
  pexelsPageUrl: string | null;
  source: "ai_cached" | "ai_generated";
  /** Scene-family id picked for this backdrop (e.g. "scandi_minimal"). */
  sceneFamily: string;
  /** Camera-angle id (e.g. "top_left_negative_space"). */
  cameraAngle: string;
  /** Emotional/atmospheric tone (e.g. "relief_atmosphere"). */
  emotion: string;
  /** Variant slot used for cache busting / rotation. */
  variantSeed: number;
  /** 64-bit dHash (16-char hex) of the rendered image, when available. */
  phash?: string | null;
  /** Highest similarity vs recent generated backdrops (0..1), when checked. */
  phashMaxSimilarity?: number | null;
  /** Number of pHash-driven re-renders that occurred before acceptance. */
  phashRetries?: number;
  /** "accepted" | "duplicate_after_retry" | "no_phash" — for diagnostics. */
  phashStatus?: string;
};

type SbLike = {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
};

export interface AiBackdropOptions {
  /** Pinterest hook this pin belongs to (drives emotional tone). */
  hookKey?: string | null;
  /** Family ids to avoid — typically recent-50 + already-used-in-batch. */
  excludeFamilies?: Iterable<string>;
  /** Per-pin seed used to rotate camera angle and bust cache. */
  variantSeed?: number;
  /** Skip the cache lookup and force a fresh render. */
  force?: boolean;
  /** Already-known pHashes for in-batch duplicate suppression. */
  knownPhashes?: Iterable<string>;
}

function slugifyQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function readCache(
  sb: SbLike,
  query: string,
  meta: { sceneFamily: string; cameraAngle: string; emotion: string; variantSeed: number },
): Promise<AiBackdropPhoto | null> {
  try {
    const { data, error } = await sb.from(CACHE_TABLE).select("image_url, width, height, phash").eq("query", query).maybeSingle();
    if (error || !data?.image_url) return null;
    return {
      url: data.image_url,
      avgColor: null,
      width: data.width ?? 1080,
      height: data.height ?? 1920,
      photographer: null,
      pexelsPageUrl: null,
      source: "ai_cached",
      ...meta,
      phash: (data as { phash?: string | null }).phash ?? null,
      phashMaxSimilarity: null,
      phashRetries: 0,
      phashStatus: "cached",
    };
  } catch {
    return null;
  }
}

async function writeCache(sb: SbLike, query: string, url: string, storagePath: string, phash: string | null): Promise<void> {
  try {
    await sb.from(CACHE_TABLE).upsert({
      query,
      image_url: url,
      storage_path: storagePath,
      width: 1080,
      height: 1920,
      phash,
      updated_at: new Date().toISOString(),
    }, { onConflict: "query" });
  } catch (e) {
    console.warn(`[pinterest-ai-backdrop] cache write failed for "${query}":`, e instanceof Error ? e.message : e);
  }
}

/** Load the most recent N pHashes from cache for cross-batch duplicate detection. */
export async function loadRecentPhashes(sb: SbLike, limit = 100): Promise<string[]> {
  try {
    const { data, error } = await sb
      .from(CACHE_TABLE)
      .select("phash, updated_at")
      .not("phash", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => String((r as { phash?: string }).phash || "")).filter((s) => s.length === 16);
  } catch {
    return [];
  }
}

/**
 * Deterministic hash so the same query always renders the same scene variant
 * (cache-stable), but different queries naturally rotate through different
 * rooms, lighting, angles and moods.
 */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SCENE FAMILIES — 10 distinct creative pools, each rendered as if it were a
 * different photo shoot. Picking a family BEFORE prompt assembly forces real
 * variance in room layout, color palette, furniture and lighting direction.
 * ────────────────────────────────────────────────────────────────────────── */
export type SceneFamily = {
  id: string;
  label: string;
  scene: string;
  lighting: string;
  palette: string;
  weight: number;
};

export const SCENE_FAMILIES: SceneFamily[] = [
  {
    id: "scandi_minimal",
    label: "Scandinavian minimal",
    scene: "airy Scandinavian living room with a pale oak floor, low linen sofa, and a single dried branch in a stoneware vase",
    lighting: "diffused overcast daylight through sheer linen curtains, very even and soft",
    palette: "warm whites, oat, pale oak, faded ceramic",
    weight: 1.2,
  },
  {
    id: "luxury_apartment",
    label: "Luxury apartment",
    scene: "high-end Manhattan apartment with floor-to-ceiling windows, marble side table, brass accents and a velvet armchair",
    lighting: "late-afternoon golden glow with long elegant shadows across stone floor",
    palette: "warm bone, brushed brass, cream marble, deep walnut",
    weight: 1.0,
  },
  {
    id: "cozy_evening",
    label: "Cozy evening home",
    scene: "amber-lit cozy living room with a knit throw on a worn leather chair, a paperback face-down on a side table",
    lighting: "low warm tungsten lamplight, deep amber tone, soft pools of light",
    palette: "amber, cognac leather, charcoal, warm cream",
    weight: 1.0,
  },
  {
    id: "bright_daylight",
    label: "Bright daylight interior",
    scene: "bright airy California bungalow living room with white walls, rattan chair and a fiddle-leaf fig",
    lighting: "bright midday sunlight bouncing off pale oak floors, crisp clear shadows",
    palette: "fresh white, sage green, light oak, terracotta accent",
    weight: 1.0,
  },
  {
    id: "owner_interaction",
    label: "Cat-owner interaction",
    scene: "warm lived-in living room with a person's hand and forearm in soft focus reaching toward a relaxed cat (face out of frame)",
    lighting: "soft window side-light, gently warm, intimate documentary feel",
    palette: "warm beige, oat sweater, faded denim, soft cream",
    weight: 0.9,
  },
  {
    id: "smart_home_modern",
    label: "Modern smart home",
    scene: "minimalist modern living space with a matte black smart speaker, low-profile media console and concrete-look floor",
    lighting: "cool soft daylight blended with subtle warm accent LED, clean editorial feel",
    palette: "graphite, soft warm white, matte black, brushed aluminum",
    weight: 0.9,
  },
  {
    id: "warm_wooden",
    label: "Warm wooden interior",
    scene: "rustic-modern wooden interior with raw oak beams, a heavy wooden bench and woven jute rug",
    lighting: "warm late-afternoon sun through a single tall window, deep golden cast",
    palette: "honey oak, warm tan, jute, cream linen",
    weight: 0.9,
  },
  {
    id: "high_end_aesthetic",
    label: "High-end aesthetic apartment",
    scene: "editorial-quality apartment-tour scene with a low travertine plinth, sculptural ceramic and a single trailing plant",
    lighting: "controlled north-window light, soft and museum-like",
    palette: "bone, travertine, soft sage, brushed brass",
    weight: 0.9,
  },
  {
    id: "family_home",
    label: "Family home",
    scene: "lived-in family living room with a folded plaid throw, a child's book closed on the rug and a soft cotton sofa",
    lighting: "soft mid-morning light through gauzy curtains, gentle and natural",
    palette: "warm beige, dusty rose accent, soft denim, oatmeal",
    weight: 0.8,
  },
  {
    id: "dark_cinematic",
    label: "Dark cinematic",
    scene: "moody low-light bedroom corner with a deep navy throw, a single sculptural lamp and a charcoal woolen rug",
    lighting: "single warm directional lamp, deep falloff into shadow, cinematic contrast",
    palette: "midnight navy, charcoal, warm amber pool of light",
    weight: 0.7,
  },
];

/** Camera-angle pool — orthogonal variance on top of scene family. */
export const CAMERA_ANGLES: { id: string; label: string; directive: string }[] = [
  { id: "close_up", label: "Close-up", directive: "tight close-up, very shallow depth of field, subject fills the lower-third" },
  { id: "wide_angle", label: "Wide angle", directive: "wide editorial framing, full room context, deep depth of field" },
  { id: "side_composition", label: "Side composition", directive: "subject pushed to the right third, generous negative space on the left" },
  { id: "top_left_negative_space", label: "Top-left negative space", directive: "subject anchored bottom-right, calm empty negative space in the upper-left for headline overlay" },
  { id: "cinematic_depth", label: "Cinematic depth", directive: "low eye-level cinematic angle, foreground bokeh, layered depth from foreground to background" },
  { id: "centered_product", label: "Centered product", directive: "perfectly centered hero composition, symmetrical framing, calm balanced negative space top and bottom" },
  { id: "asymmetrical", label: "Asymmetrical", directive: "deliberately asymmetrical golden-ratio composition, subject off-balance to the lower-left" },
];

/** Hook-key → emotional tone pool. Pulled by hash so each pin still varies. */
const EMOTIONS_BY_HOOK: Record<string, string[]> = {
  pain: [
    "subtle relief atmosphere — the room is mid-tidy, calm settling in after a long day",
    "quiet end-of-day mood, slightly weary but hopeful, soft and grounded",
    "fresh-start morning calm after a chaotic week",
  ],
  transformation: [
    "aspirational premium-lifestyle mood, elegant and effortless",
    "post-makeover clean elegance, serene and balanced",
    "magazine-worthy 'this is the dream home' aspirational tone",
  ],
  social_proof: [
    "warm cozy cat-owner bonding mood, intimate and lived-in",
    "soft Sunday-morning together-time atmosphere",
    "relaxed home environment with a sense of contentment",
  ],
  curiosity: [
    "subtle futuristic smart-home undertone, clean and intriguing",
    "editorial 'discover this' tone, calm with a touch of mystery",
    "modern tech-meets-comfort feel, polished and curious",
  ],
  time_saving: [
    "calm 'finally organized' relief mood, breathing room restored",
    "clean efficient daily-routine atmosphere, light and freeing",
    "minimalist productive serenity",
  ],
  infographic: [
    "neutral aesthetic apartment-tour mood, clean editorial baseline",
    "balanced lifestyle backdrop with calm visual hierarchy",
    "soft documentary realism",
  ],
};

function pickEmotion(hookKey: string | null | undefined, h: number): string {
  const pool = EMOTIONS_BY_HOOK[(hookKey || "").toLowerCase()] || EMOTIONS_BY_HOOK.infographic;
  return pool[h % pool.length];
}

function pickFamily(query: string, variantSeed: number, exclude: Set<string>): SceneFamily {
  const eligible = SCENE_FAMILIES.filter((f) => !exclude.has(f.id));
  const pool = eligible.length > 0 ? eligible : SCENE_FAMILIES;
  // Weighted pick: build cumulative weights, pick based on (hash + seed).
  const total = pool.reduce((s, f) => s + f.weight, 0);
  const h = (hashStr(query) + (variantSeed >>> 0)) >>> 0;
  let r = (h % 10000) / 10000 * total;
  for (const f of pool) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return pool[pool.length - 1];
}

function pickAngle(variantSeed: number, h: number): typeof CAMERA_ANGLES[number] {
  return CAMERA_ANGLES[((h >> 4) + variantSeed) % CAMERA_ANGLES.length];
}

/**
 * Build a high-fidelity prompt for a Pinterest-native cozy lifestyle scene.
 * Family + camera-angle + emotion are picked OUTSIDE this function so the
 * caller can enforce diversity (recent-50 exclusion, force new family on
 * reroll). This function only assembles the directive.
 */
function buildPrompt(query: string, family: SceneFamily, angle: typeof CAMERA_ANGLES[number], emotion: string): string {
  return [
    `Hyper-realistic lifestyle photograph featuring a ${query}, naturally placed inside a ${family.scene}.`,
    `Lighting: ${family.lighting}. Camera: ${angle.directive}. Mood: ${emotion}.`,
    `Material palette: ${family.palette}. Real fabric texture, real wood grain, believable imperfections (a slightly creased blanket, a stray leaf, a worn rug edge).`,
    `The product blends naturally into the scene — correct perspective, realistic ground-contact shadow, ambient light matching the room. It must look placed, not pasted, never floating.`,
    `Editorial Pinterest aesthetic, 9:16 vertical, shallow depth of field, candid lifestyle photography (think saved-on-Pinterest apartment-tour pin, not e-commerce banner).`,
    `Leave the top ~30% of the frame visually calm (wall, ceiling, soft out-of-focus area, or window light) so a headline can be overlaid cleanly.`,
    `IMPORTANT: this image must look like a different photo shoot from any other pin in this campaign — distinct room layout, distinct camera angle, distinct lighting direction.`,
    `Strictly avoid: text, logos, watermarks, brand names, glossy CGI look, surreal AI artifacts, plastic-looking pets, distorted hands, floating objects, ecommerce backdrop, studio seamless paper, empty void backgrounds, people's faces in sharp focus.`,
  ].join(" ");
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Fetch (or generate) a lifestyle backdrop for the given query.
 *
 * Diversity controls:
 *   - opts.excludeFamilies — family ids to skip (recent-50 + in-batch used).
 *   - opts.variantSeed     — rotates camera angle, busts cache when reroll bumps it.
 *   - opts.hookKey         — drives emotional tone.
 *   - opts.force           — skip cache lookup entirely.
 *
 * Returns null on any failure so the caller can fall back gracefully.
 */
export async function fetchAiBackdrop(
  sb: SbLike,
  query: string,
  opts: AiBackdropOptions = {},
): Promise<AiBackdropPhoto | null> {
  const variantSeed = Math.max(0, Math.floor(opts.variantSeed ?? 0));
  const exclude = new Set<string>(opts.excludeFamilies ? Array.from(opts.excludeFamilies) : []);
  const family = pickFamily(query, variantSeed, exclude);
  const h = (hashStr(query) + variantSeed) >>> 0;
  const angle = pickAngle(variantSeed, h);
  const emotion = pickEmotion(opts.hookKey ?? null, h);
  const meta = { sceneFamily: family.id, cameraAngle: angle.id, emotion, variantSeed };

  // Cache key bakes in family + variant slot so different families/seeds for
  // the same base query produce different cached scenes (prevents the
  // "same room every pin" issue).
  const cacheKey = `${query}::${family.id}::v${variantSeed % 8}`;

  if (!opts.force) {
    const cached = await readCache(sb, cacheKey, meta);
    if (cached) return cached;
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("[pinterest-ai-backdrop] LOVABLE_API_KEY missing");
    return null;
  }

  // Pull cross-batch pHash history once; merge in any caller-provided in-batch hashes.
  const recentPhashes = await loadRecentPhashes(sb, 100);
  const known = new Set<string>(recentPhashes);
  if (opts.knownPhashes) for (const h of opts.knownPhashes) if (h) known.add(h);

  let attemptSeed = variantSeed;
  let lastBytes: Uint8Array | null = null;
  let lastUrlForCache: string | null = null;
  let lastPath: string | null = null;
  let lastPhash: string | null = null;
  let lastSimilarity = 0;
  let chosenFamily = family;
  let chosenAngle = angle;
  let chosenEmotion = emotion;

  for (let attempt = 0; attempt <= PHASH_MAX_RETRIES; attempt++) {
    // On retries, force a fresh family + angle by bumping the seed and adding the
    // previously-picked family to the exclusion set.
    if (attempt > 0) {
      attemptSeed = variantSeed + 1000 * attempt + 17;
      exclude.add(chosenFamily.id);
      chosenFamily = pickFamily(query, attemptSeed, exclude);
      const h2 = (hashStr(query) + attemptSeed) >>> 0;
      chosenAngle = pickAngle(attemptSeed, h2);
      chosenEmotion = pickEmotion(opts.hookKey ?? null, h2);
    }

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: buildPrompt(query, chosenFamily, chosenAngle, chosenEmotion) }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn(`[pinterest-ai-backdrop] gateway ${res.status} for "${query}": ${t.slice(0, 200)}`);
        return null;
      }
      const j = await res.json();
      const dataUrl: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUrl) {
        console.warn(`[pinterest-ai-backdrop] no image returned for "${query}"`);
        return null;
      }
      const bytes = dataUrlToBytes(dataUrl);
      if (!bytes) return null;

      const phash = await computePhashFromBytes(bytes);
      const sim = phash ? maxSimilarity(phash, known) : { score: 0, match: null };
      lastBytes = bytes;
      lastPhash = phash;
      lastSimilarity = sim.score;
      lastPath = `ai-backdrops/${slugifyQuery(query)}-${chosenFamily.id}-v${attemptSeed % 8}-${Date.now()}.png`;

      const isDuplicate = phash && sim.score > PHASH_DUPLICATE_SIMILARITY;
      const lastAttempt = attempt === PHASH_MAX_RETRIES;
      if (isDuplicate && !lastAttempt) {
        console.warn(
          `[pinterest-ai-backdrop] duplicate (sim=${sim.score.toFixed(3)} vs ${sim.match}) for "${query}" family=${chosenFamily.id} → retry ${attempt + 1}/${PHASH_MAX_RETRIES}`,
        );
        continue;
      }

      // Accept (or accept-with-flag on final attempt).
      const { error: upErr } = await sb.storage.from(BUCKET).upload(lastPath, bytes, {
        contentType: "image/png",
        cacheControl: "31536000",
        upsert: false,
      });
      if (upErr) {
        console.warn(`[pinterest-ai-backdrop] upload failed: ${upErr.message}`);
        return null;
      }
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(lastPath);
      const url: string | undefined = pub?.publicUrl;
      if (!url) return null;
      await writeCache(sb, cacheKey, url, lastPath, phash);
      return {
        url,
        avgColor: null,
        width: 1080,
        height: 1920,
        photographer: null,
        pexelsPageUrl: null,
        source: "ai_generated",
        sceneFamily: chosenFamily.id,
        cameraAngle: chosenAngle.id,
        emotion: chosenEmotion,
        variantSeed: attemptSeed,
        phash,
        phashMaxSimilarity: sim.score,
        phashRetries: attempt,
        phashStatus: phash
          ? (isDuplicate ? "duplicate_after_retry" : "accepted")
          : "no_phash",
      };
    } catch (e) {
      console.error(`[pinterest-ai-backdrop] threw for "${query}":`, e instanceof Error ? e.message : e);
      return null;
    }
  }

  return null;
}

/**
 * Look up scene families used in the most-recent N cached backdrops, so the
 * batch generator can avoid repeating them. Families are encoded in the
 * `query` cache column as `<baseQuery>::<family>::v<n>`.
 */
export async function loadRecentSceneFamilies(sb: SbLike, limit = 50): Promise<string[]> {
  try {
    const { data, error } = await sb
      .from(CACHE_TABLE)
      .select("query, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    const out: string[] = [];
    for (const row of data) {
      const q = String((row as any).query || "");
      const m = q.split("::");
      if (m.length >= 2 && m[1]) out.push(m[1]);
    }
    return out;
  } catch {
    return [];
  }
}