// Pinterest Content Director
// ----------------------------------------------------------------------------
// Single decision engine that picks the next content archetype + product(s) +
// hook for a Pinterest pin. Replaces the old "always pick one product, always
// make a video" logic with a rotating multi-format strategy:
//
//   product_spotlight       -> 1 product, hero MP4
//   multi_product_compilation -> 3-5 products, themed (e.g. "5 smart cat products")
//   lifestyle_scene         -> aesthetic scene, product appears naturally
//   ugc_pov                 -> POV / reaction / "wish I bought sooner" hook
//   animated_slideshow      -> zoom/pan multi-image fallback when no MP4 exists
//
// Caller: pinterest-scheduler (cron) or admin "Force generate next" button.
// Returns a JSON spec that downstream renderers turn into a real MP4.
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

type Archetype =
  | "cinematic_product_demo"
  | "multi_product_compilation"
  | "lifestyle_scene"
  | "ugc_pov"
  | "animated_slideshow";

// Desired 7-day distribution. Director picks the archetype furthest from target.
// V4 Cinematic-first: zero share for legacy static/infographic templates.
// Slideshow capped at 10% as an MP4 fallback only.
const TARGET_MIX: Record<Archetype, number> = {
  cinematic_product_demo: 0.30,
  multi_product_compilation: 0.25,
  ugc_pov: 0.20,
  lifestyle_scene: 0.15,
  animated_slideshow: 0.10,
};

const HOOK_POOL: Record<Archetype, string[]> = {
  cinematic_product_demo: [
    "your cat needs this",
    "this changed our routine",
    "viral but actually worth it",
    "smart pet upgrade of the year",
  ],
  multi_product_compilation: [
    "5 picks you'll save",
    "the only list you need",
    "trending in pet parent TikTok",
    "ranked: cat parent favorites",
  ],
  lifestyle_scene: [
    "home tour: cat edition",
    "less stuff, more cat",
    "the cozy era",
    "pet parents in 2026 be like",
  ],
  ugc_pov: [
    "pov: you finally bought this",
    "i wish i bought this sooner",
    "before vs after, same cat",
    "cat owners need this",
  ],
  animated_slideshow: [
    "tap to see why",
    "swipe-worthy upgrade",
    "scroll-stopping pick",
    "save this for later",
  ],
};

const CTA_POOL = [
  "Shop on GetPawsy",
  "Tap to see prices",
  "Save before it sells out",
  "See the full pick",
];

const j = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const traceId = () => crypto.randomUUID();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = traceId();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Optional: caller can force a specific archetype (admin button)
    let forced: Archetype | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.force_archetype) forced = body.force_archetype as Archetype;
    }

    // --- 1. Inspect last 10 published pins for variation guards ----------
    const { data: recent = [] } = await supabase
      .from("cinematic_ad_jobs")
      .select("id, content_type, hook_archetype, product_slug, product_ids, published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(10);

    const last3Archetypes = (recent ?? []).slice(0, 3).map((r) => r.content_type).filter(Boolean);
    const blockedRecentProducts = new Set<string>();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const r of recent ?? []) {
      if (!r.published_at) continue;
      if (new Date(r.published_at).getTime() < cutoff) continue;
      if (r.product_slug) blockedRecentProducts.add(r.product_slug);
      for (const pid of (r.product_ids ?? []) as string[]) blockedRecentProducts.add(pid);
    }

    // --- 2. Read archetype cooldowns -------------------------------------
    const { data: cooldowns = [] } = await supabase
      .from("pinterest_archetype_cooldown")
      .select("*");
    const now = Date.now();
    const archetypeReady = (a: Archetype): boolean => {
      const row = cooldowns?.find((c) => c.archetype === a);
      if (!row?.last_published_at) return true;
      const minAgo = (now - new Date(row.last_published_at).getTime()) / 60000;
      return minAgo >= (row.cooldown_minutes ?? 180);
    };

    // --- 3. Compute 7-day actual mix and pick the most under-target ------
    const { data: weekly = [] } = await supabase
      .from("cinematic_ad_jobs")
      .select("content_type, published_at")
      .gte("published_at", new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString());
    const counts: Record<string, number> = {};
    for (const r of weekly ?? []) counts[r.content_type ?? "unknown"] = (counts[r.content_type ?? "unknown"] ?? 0) + 1;
    const total = Math.max(1, (weekly ?? []).length);

    const archetypes: Archetype[] = [
      "cinematic_product_demo",
      "multi_product_compilation",
      "lifestyle_scene",
      "ugc_pov",
      "animated_slideshow",
    ];

    const candidates = archetypes
      .filter((a) => archetypeReady(a))
      // Block any archetype that appears in the last 2 publishes (no consecutive repeats)
      .filter((a) => last3Archetypes.slice(0, 2).every((p) => p !== a))
      .map((a) => {
        const actual = (counts[a] ?? 0) / total;
        const deficit = TARGET_MIX[a] - actual;
        return { a, deficit };
      })
      .sort((x, y) => y.deficit - x.deficit);

    // Map deprecated archetype alias (product_spotlight) for back-compat callers.
    const forcedNormalized: Archetype | null = forced === ("product_spotlight" as Archetype)
      ? "cinematic_product_demo"
      : forced;
    const chosen: Archetype = forcedNormalized ?? (candidates[0]?.a ?? "cinematic_product_demo");

    // --- 4. Pick products honoring the 7-day cooldown -------------------
    const { data: pool = [] } = await supabase
      .from("pinterest_product_cooldown_v")
      .select("*")
      .limit(50);
    const freshProducts = (pool ?? []).filter((p) => !blockedRecentProducts.has(p.product_slug));
    if (freshProducts.length === 0) {
      return j(409, { ok: false, traceId: trace, message: "No fresh products available (all in 7d cooldown)" });
    }

    let productIds: string[] = [];
    let theme: { title_template?: string; cta?: string } | null = null;
    let sceneTemplate: string | null = null;
    let overlayText = HOOK_POOL[chosen][Math.floor(Math.random() * HOOK_POOL[chosen].length)];
    const cta = CTA_POOL[Math.floor(Math.random() * CTA_POOL.length)];

    if (chosen === "multi_product_compilation") {
      const { data: themes = [] } = await supabase
        .from("pinterest_compilation_themes")
        .select("*")
        .eq("active", true);
      theme = (themes ?? [])[Math.floor(Math.random() * Math.max(1, (themes ?? []).length))] ?? null;
      const n = Math.min(freshProducts.length, theme?.max_products ?? 5);
      productIds = freshProducts.slice(0, n).map((p) => p.product_slug);
      overlayText = (theme?.title_template ?? "{n} must-have picks").replace("{n}", String(n));
    } else if (chosen === "lifestyle_scene") {
      const { data: scenes = [] } = await supabase
        .from("pinterest_lifestyle_scenes")
        .select("*")
        .eq("active", true);
      const scene = (scenes ?? [])[Math.floor(Math.random() * Math.max(1, (scenes ?? []).length))];
      sceneTemplate = scene?.scene_name ?? null;
      overlayText = scene?.overlay_hook ?? overlayText;
      productIds = [freshProducts[0].product_slug];
    } else {
      // spotlight / ugc / slideshow: single product
      productIds = [freshProducts[0].product_slug];
    }

    // Predicted engagement: simple heuristic — bigger deficit + video = higher
    const predicted_engagement = Math.round(
      (chosen === "animated_slideshow" ? 40 : 70) +
        (chosen === "multi_product_compilation" ? 15 : 0) +
        (chosen === "lifestyle_scene" ? 10 : 0),
    );

    const spec = {
      content_type: chosen,
      product_slug: productIds[0],
      product_ids: productIds,
      hook_archetype: chosen,
      scene_template: sceneTemplate,
      overlay_text: overlayText,
      cta,
      predicted_engagement,
      theme_title: theme?.title_template ?? null,
    };

    // --- 5. Stamp cooldown so concurrent calls don't pick the same archetype
    await supabase
      .from("pinterest_archetype_cooldown")
      .upsert({ archetype: chosen, last_published_at: new Date().toISOString() }, { onConflict: "archetype" });

    return j(200, { ok: true, traceId: trace, message: "ok", spec });
  } catch (e) {
    return j(500, { ok: false, traceId: trace, message: (e as Error).message });
  }
});
