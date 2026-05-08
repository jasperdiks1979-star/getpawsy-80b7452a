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

export type AiBackdropPhoto = {
  url: string;
  avgColor: string | null;
  width: number | null;
  height: number | null;
  photographer: string | null;
  pexelsPageUrl: string | null;
  source: "ai_cached" | "ai_generated";
};

type SbLike = {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
};

function slugifyQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function readCache(sb: SbLike, query: string): Promise<AiBackdropPhoto | null> {
  try {
    const { data, error } = await sb.from(CACHE_TABLE).select("image_url, width, height").eq("query", query).maybeSingle();
    if (error || !data?.image_url) return null;
    return {
      url: data.image_url,
      avgColor: null,
      width: data.width ?? 1080,
      height: data.height ?? 1920,
      photographer: null,
      pexelsPageUrl: null,
      source: "ai_cached",
    };
  } catch {
    return null;
  }
}

async function writeCache(sb: SbLike, query: string, url: string, storagePath: string): Promise<void> {
  try {
    await sb.from(CACHE_TABLE).upsert({
      query,
      image_url: url,
      storage_path: storagePath,
      width: 1080,
      height: 1920,
      updated_at: new Date().toISOString(),
    }, { onConflict: "query" });
  } catch (e) {
    console.warn(`[pinterest-ai-backdrop] cache write failed for "${query}":`, e instanceof Error ? e.message : e);
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

const ROOMS = [
  "sun-drenched Brooklyn loft living room with a low linen sofa and a woven jute rug",
  "cozy Scandinavian reading nook by a tall window, oak floors, knitted throw blanket",
  "modern Portland studio apartment, warm white walls, mid-century walnut credenza, trailing pothos plant",
  "soft minimalist bedroom corner, undyed linen bedding, rattan stool, morning light through sheer curtains",
  "Brooklyn-brownstone breakfast nook, vintage oak chair, ceramic mug on a sunlit table",
  "Austin apartment hallway with terracotta tiles, woven basket, fiddle-leaf fig in the corner",
  "Scandi entryway with a low wooden bench, beige boucle cushion, soft afternoon light",
  "California bungalow living room, oat-toned curtains, rattan pendant light, beech coffee table",
  "neutral Pinterest-style home office corner, oak desk, linen curtains, warm clay vase",
  "cozy windowsill nook with a knitted blanket, ceramic mug, dappled golden-hour light",
];

const LIGHTING = [
  "soft golden-hour sunlight streaming sideways across the floor",
  "diffused overcast morning light through sheer linen curtains",
  "warm late-afternoon glow with long, gentle shadows",
  "bright airy midday light bouncing off pale oak floors",
  "low warm lamplight with a cozy amber tone",
  "cool early-morning daylight with soft pastel highlights",
];

const ANGLES = [
  "shot from a low eye-level perspective with shallow depth of field",
  "overhead 45-degree flat-lay angle on a wooden floor",
  "wide editorial framing with the subject slightly off-center",
  "tight handheld iPhone-style angle, very candid feel",
  "rule-of-thirds composition with negative space in the upper portion",
  "slightly tilted documentary angle, lived-in and unstaged",
];

const MOODS = [
  "calm Sunday-morning mood, lived-in and authentic",
  "warm cozy autumn evening mood with soft textures",
  "fresh airy spring-cleaning mood",
  "quiet rainy-day reading mood",
  "minimalist 'finally organized' relief mood",
  "neutral aesthetic apartment-tour mood",
];

const TEXTURES = [
  "linen, oak, ceramic, woven jute",
  "boucle, walnut wood, brushed brass, terracotta",
  "raw cotton, light beech, matte stoneware, dried pampas",
  "cashmere throw, oat-toned upholstery, aged oak, warm clay",
];

/**
 * Build a high-fidelity prompt for a Pinterest-native cozy lifestyle scene.
 * Deterministically rotates room, lighting, angle, mood and texture per query
 * so every pin reads as a different real home, never a repeated template.
 */
function buildPrompt(query: string): string {
  const h = hashStr(query);
  const room = ROOMS[h % ROOMS.length];
  const light = LIGHTING[(h >> 3) % LIGHTING.length];
  const angle = ANGLES[(h >> 6) % ANGLES.length];
  const mood = MOODS[(h >> 9) % MOODS.length];
  const texture = TEXTURES[(h >> 12) % TEXTURES.length];

  return [
    `Hyper-realistic lifestyle photograph featuring a ${query}, naturally placed inside a ${room}.`,
    `Lighting: ${light}. Camera: ${angle}. Mood: ${mood}.`,
    `Material palette: ${texture}. Warm neutral beige tones, real fabric texture, real wood grain, believable imperfections (a slightly creased blanket, a stray leaf, a worn rug edge).`,
    `The product blends naturally into the scene — correct perspective, realistic ground-contact shadow, ambient light matching the room. It must look placed, not pasted, never floating.`,
    `Editorial Pinterest aesthetic, 9:16 vertical, shallow depth of field, candid lifestyle photography (think saved-on-Pinterest apartment-tour pin, not e-commerce banner).`,
    `Leave the top ~30% of the frame visually calm (wall, ceiling, soft out-of-focus area, or window light) so a headline can be overlaid cleanly.`,
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
 * Returns null on any failure so the caller can fall back gracefully.
 */
export async function fetchAiBackdrop(sb: SbLike, query: string): Promise<AiBackdropPhoto | null> {
  const cached = await readCache(sb, query);
  if (cached) return cached;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("[pinterest-ai-backdrop] LOVABLE_API_KEY missing");
    return null;
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: buildPrompt(query) }],
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

    const path = `ai-backdrops/${slugifyQuery(query)}-${Date.now()}.png`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) {
      console.warn(`[pinterest-ai-backdrop] upload failed: ${upErr.message}`);
      return null;
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    const url: string | undefined = pub?.publicUrl;
    if (!url) return null;
    await writeCache(sb, query, url, path);
    return {
      url,
      avgColor: null,
      width: 1080,
      height: 1920,
      photographer: null,
      pexelsPageUrl: null,
      source: "ai_generated",
    };
  } catch (e) {
    console.error(`[pinterest-ai-backdrop] threw for "${query}":`, e instanceof Error ? e.message : e);
    return null;
  }
}