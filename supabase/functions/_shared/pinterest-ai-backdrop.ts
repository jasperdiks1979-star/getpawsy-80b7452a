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
 * Build a high-fidelity prompt for a Pinterest-native cozy lifestyle scene.
 * The prompt is engineered to:
 *  - render real US-apartment interiors (warm wood, beige, soft daylight)
 *  - leave the upper third uncluttered for headline overlays
 *  - avoid product / text / logos so we don't double up on what we composite
 */
function buildPrompt(query: string): string {
  return [
    `Photograph of a ${query}.`,
    `Cozy modern American apartment interior, warm natural daylight, soft shadows, beige and wood textures, scandinavian-inspired decor.`,
    `Editorial Pinterest aesthetic, 9:16 vertical composition, shallow depth of field, premium home photography, magazine-quality.`,
    `Leave the top third of the frame relatively empty (wall, ceiling, sky, or out-of-focus area) so a headline can be overlaid.`,
    `No text, no logos, no watermarks, no products in close-up, no AI artifacts, no people's faces in focus.`,
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