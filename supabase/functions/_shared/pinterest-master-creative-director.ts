// Master Creative Director — diversity banks, story prompts, Inspiration Score.
// Consumed by pinterest-creative-factory. No new tables — results live in
// pinterest_pin_queue.meta.intelligence.master and pinterest_creative_factory_jobs.quality.

export type MasterDims = {
  composition: string;
  camera: string;
  lighting: string;
  room: string;
  story: string;
  emotion: string;
  owner: string;
  palette: string;
  season: string;
  hero: string;
  breed_hint: string;
  imperfection: string;
};

const COMPOSITION = [
  "rule of thirds, off-center subject, generous negative space",
  "diagonal composition, foreground blur, depth of field",
  "top-down flat lay, natural cropping at edges",
  "wide-angle environmental, room is the hero",
  "macro close-up of texture, shallow depth of field",
  "over-the-shoulder POV, soft background bokeh",
  "floor-level low angle, eye-line of the pet",
  "portrait framing, soft window light, quiet moment",
  "landscape framing inside vertical 2:3, layered foreground",
  "loose lifestyle framing, subject slightly off-balance",
];
const CAMERA = [
  "35mm prime, f/2.0, natural grain",
  "50mm lens, f/2.8, gentle chromatic falloff",
  "85mm portrait, creamy bokeh",
  "24mm wide, mild barrel distortion at edges",
  "iPhone 15 Pro main camera, true-to-life color",
  "Fujifilm X-T5 with Classic Chrome film simulation",
  "Canon R6 with warm skin tones",
];
const LIGHTING = [
  "golden hour through a west-facing window",
  "soft overcast daylight from a north window",
  "morning sunlight with long warm shadows",
  "blue hour twilight, lamp accents inside",
  "harsh midday sunbeam through sheer curtains",
  "rainy-day diffused light, cool grey tones",
  "snowy daylight, high-key cool whites",
  "candlelit evening, warm tungsten pools",
];
const ROOM = [
  "Scandinavian apartment, light oak, white walls",
  "modern farmhouse kitchen, butcher block, soft linen",
  "industrial loft, exposed brick, black metal",
  "minimalist studio, concrete floor, single houseplant",
  "Pacific Northwest cabin, cedar walls, wool throws",
  "California beach house, rattan, white-washed wood",
  "Brooklyn brownstone living room, vintage rug",
  "Texas ranch porch, weathered wood, wildflowers",
  "Boston brownstone bedroom, layered textiles",
  "Colorado mountain cabin, stone fireplace",
  "Austin patio at sunset, string lights",
  "Portland laundry room, retro tile",
  "Brooklyn home office, brass desk lamp",
  "Miami sunroom, terrazzo floor, palms",
  "Vermont mudroom, shaker bench, boots and leashes",
  "Chicago high-rise balcony, city skyline distant",
];
const STORY = [
  "pet waiting by the door for the owner to come home",
  "morning routine: coffee on the counter, pet stretching",
  "owner reading on the couch, pet curled at their feet",
  "before & after of a once-messy corner, now serene",
  "weekend roadtrip packing scene, leash on the bench",
  "evening wind-down, pet asleep, soft lamp glow",
  "rainy afternoon, pet at the window watching drops",
  "family kitchen, kid feeding the pet, parent in background",
  "post-walk return, muddy paws, owner toweling off",
  "lazy Sunday, sunbeam across the rug, pet napping",
  "play session pause, toy mid-air, pet focused",
  "owner working from home, pet resting on the desk chair",
];
const EMOTION = [
  "curious, ears forward, head tilt",
  "deeply relaxed, half-closed eyes",
  "alert and playful, paws planted",
  "comfortable and content, soft exhale",
  "focused on something off-frame",
  "sleeping peacefully, slow breathing",
  "looking up at the owner with trust",
  "watching out the window, calm",
];
const OWNER = [
  "no owner visible, just lived-in evidence (mug, blanket)",
  "hand only, gently petting, neutral skin tone",
  "woman in her 30s, oversized linen shirt, soft smile, mid-action",
  "man in his 40s, henley and jeans, kneeling, candid",
  "Black woman in her 20s, cozy knit, holding a mug",
  "Latino man in his 30s, hoodie, candid laugh",
  "Asian woman in her 50s, cardigan, reading glasses",
  "white-haired retiree, soft cardigan, gentle posture",
  "young couple on the couch, pet between them",
  "child (face partially out of frame) curled up with the pet",
];
const PALETTE = [
  "warm cream and oat with terracotta accents",
  "cool sage and bone with brushed nickel",
  "moody charcoal and walnut with brass",
  "high-key whites with single mustard accent",
  "earthy clay, olive, and unbleached linen",
  "soft blush, ivory, and pale oak",
  "deep forest green, cream, antique gold",
  "muted dusty blue, sand, weathered wood",
];
const SEASONS = [
  "early spring, fresh tulips on the table",
  "summer, open window, sheer curtain breeze",
  "autumn, throw blanket, pumpkin on the porch",
  "winter, soft snow outside, knit textures",
  "Halloween, single tasteful pumpkin, no costumes",
  "Thanksgiving, set table in background, no clutter",
  "Christmas, tasteful greenery, no clichéd red/green",
  "Valentine's, soft pinks, single tulip",
  "back-to-school, backpack by the door",
  "evergreen (no seasonal markers)",
];
const HERO = [
  "the room is the hero, product woven into it",
  "the pet is the hero, product just present",
  "the owner's moment is the hero, product in supporting role",
  "the emotion is the hero, product barely framed",
  "the activity is the hero, product enabling it",
  "the product is hero but photographed as decor",
];
const BREED = [
  "golden retriever", "labrador (yellow)", "labrador (black)",
  "australian shepherd", "border collie", "french bulldog",
  "shiba inu", "cavalier king charles", "mixed-breed rescue",
  "domestic shorthair tabby", "russian blue cat", "ragdoll cat",
  "maine coon", "tuxedo cat", "calico cat",
];
const IMPERFECTION = [
  "one slightly out-of-place blanket fold",
  "a stray pet hair on the rug",
  "a coffee ring on the wood",
  "a half-read book, dog-eared",
  "a sock on the floor near the bed",
  "a leaf tracked in from outside",
  "a soft lens flare in the corner",
  "natural film grain throughout",
];

function pickFromSeed<T>(arr: T[], seed: number, salt: number): T {
  const i = Math.abs((seed * 2654435761 + salt) >>> 0) % arr.length;
  return arr[i];
}

export function pickMasterDims(seed: number, monthIndex = new Date().getUTCMonth()): MasterDims {
  // Bias season bank by current calendar month so we evolve with the year.
  const seasonalBias = [
    "winter", "winter", "early spring", "early spring",
    "summer", "summer", "summer", "summer",
    "autumn", "autumn", "Thanksgiving", "Christmas",
  ][monthIndex] ?? "evergreen";
  const season = Math.abs(seed) % 5 === 0
    ? pickFromSeed(SEASONS, seed, 9001)
    : (SEASONS.find((s) => s.startsWith(seasonalBias)) ?? pickFromSeed(SEASONS, seed, 9001));
  return {
    composition: pickFromSeed(COMPOSITION, seed, 1),
    camera: pickFromSeed(CAMERA, seed, 2),
    lighting: pickFromSeed(LIGHTING, seed, 3),
    room: pickFromSeed(ROOM, seed, 4),
    story: pickFromSeed(STORY, seed, 5),
    emotion: pickFromSeed(EMOTION, seed, 6),
    owner: pickFromSeed(OWNER, seed, 7),
    palette: pickFromSeed(PALETTE, seed, 8),
    season,
    hero: pickFromSeed(HERO, seed, 10),
    breed_hint: pickFromSeed(BREED, seed, 11),
    imperfection: pickFromSeed(IMPERFECTION, seed, 12),
  };
}

export function buildMasterPrompt(opts: {
  productName: string;
  nicheLabel: string;
  environment: string;
  overlay: string;
  dims: MasterDims;
}): string {
  const { productName, nicheLabel, environment, overlay, dims } = opts;
  return [
    `Editorial Pinterest lifestyle photograph (vertical 2:3, 1000x1500). Must look like a real interior-design / pet-lifestyle photo a US Pinterest user would actually save — NOT an ad, NOT a product listing, NOT a CGI render.`,
    `Story: ${dims.story}. Hero: ${dims.hero}.`,
    `Setting: ${dims.room}. ${environment}. Season cue: ${dims.season}.`,
    `Owner: ${dims.owner}. Pet: ${dims.breed_hint}, ${dims.emotion}.`,
    `Composition: ${dims.composition}. Camera: ${dims.camera}. Lighting: ${dims.lighting}. Palette: ${dims.palette}.`,
    `Imperfection (to defeat AI sterility): ${dims.imperfection}.`,
    `Product to depict naturally inside the scene (not floating, not centered, not catalog-style): ${productName} — niche: ${nicheLabel}. Preserve product truth: do not alter shape, color, material, tiers, or accessories from the source reference.`,
    `Mobile safe zone: nothing critical in outer 15%, top 15%, bottom 20%.`,
    overlay
      ? `One small unobtrusive text overlay of EXACTLY: "${overlay}" (max 5 words, must not cover faces or product). Tiny GetPawsy wordmark, low-contrast.`
      : `No overlay text at all.`,
    `Absolutely forbidden: AI-looking faces, plastic skin, glowing eyes, extra limbs, warped paws, duplicate pets, text artifacts, watermark grids, infographics, comparison panels, collages, split-screens, price tags, discount banners, CTA bars, stock-photo look, sterile CGI rooms, perfectly symmetric staging, oversaturated colors, HDR halos.`,
    `Required realism: natural lens characteristics, believable shadows and reflections, lived-in textures, micro-clutter consistent with a real home, soft imperfections.`,
  ].join(" ");
}

export type InspirationScore = {
  total: number; // 0-100 weighted
  axes: {
    save_likelihood: number;
    interior_quality: number;
    emotional_impact: number;
    composition: number;
    storytelling: number;
    visual_uniqueness: number;
    lifestyle_realism: number;
    ai_look_risk: number; // higher = worse
  };
  reasons: string[];
  notes: string;
};

const AXIS_WEIGHTS = {
  save_likelihood: 0.22,
  interior_quality: 0.14,
  emotional_impact: 0.14,
  composition: 0.12,
  storytelling: 0.12,
  visual_uniqueness: 0.12,
  lifestyle_realism: 0.14,
};

export function fallbackInspiration(reason: string): InspirationScore {
  return {
    total: 72,
    axes: {
      save_likelihood: 72,
      interior_quality: 72,
      emotional_impact: 72,
      composition: 72,
      storytelling: 72,
      visual_uniqueness: 72,
      lifestyle_realism: 72,
      ai_look_risk: 25,
    },
    reasons: [reason],
    notes: "fallback_soft_pass",
  };
}

export async function scoreInspirationAi(opts: {
  apiKey: string | null | undefined;
  textModel: string;
  dataUrl: string;
  dims: MasterDims;
  productName: string;
}): Promise<InspirationScore> {
  const { apiKey, textModel, dataUrl, dims, productName } = opts;
  if (!apiKey) return fallbackInspiration("inspiration_ai_skipped_no_key");
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: textModel,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              {
                type: "text",
                text:
                  `You are a senior Pinterest creative director judging a single pin for a premium US pet lifestyle brand. The benchmark is: "I would save this to my own home/lifestyle Pinterest board." Judge ONLY the image — ignore the product brand. Score each axis 0-100 (ai_look_risk: 0 = perfectly human-shot, 100 = obviously AI). Return STRICT JSON only: {"save_likelihood":n,"interior_quality":n,"emotional_impact":n,"composition":n,"storytelling":n,"visual_uniqueness":n,"lifestyle_realism":n,"ai_look_risk":n,"reasons":[short string,...],"notes":"one sentence"}. Product depicted: ${productName}. Intended story: ${dims.story}. Intended hero: ${dims.hero}. Intended room: ${dims.room}.`,
              },
            ],
          }],
          temperature: 0.1,
        }),
      },
    );
    if (!resp.ok) return fallbackInspiration(`inspiration_http_${resp.status}`);
    const raw = await resp.text();
    const parsed = JSON.parse(raw);
    const content = parsed?.choices?.[0]?.message?.content ?? raw;
    const match = String(content).match(/\{[\s\S]*\}/);
    if (!match) return fallbackInspiration("inspiration_no_json");
    const v = JSON.parse(match[0]);
    const clamp = (n: unknown) =>
      Math.max(0, Math.min(100, Number.isFinite(Number(n)) ? Number(n) : 70));
    const axes = {
      save_likelihood: clamp(v.save_likelihood),
      interior_quality: clamp(v.interior_quality),
      emotional_impact: clamp(v.emotional_impact),
      composition: clamp(v.composition),
      storytelling: clamp(v.storytelling),
      visual_uniqueness: clamp(v.visual_uniqueness),
      lifestyle_realism: clamp(v.lifestyle_realism),
      ai_look_risk: clamp(v.ai_look_risk),
    };
    let weighted = 0;
    for (const [k, w] of Object.entries(AXIS_WEIGHTS)) {
      weighted += (axes as Record<string, number>)[k] * w;
    }
    // AI-look risk is a hard penalty: subtract up to 30 points.
    const total = Math.max(0, Math.round(weighted - (axes.ai_look_risk * 0.3)));
    return {
      total,
      axes,
      reasons: Array.isArray(v.reasons) ? v.reasons.slice(0, 8).map(String) : [],
      notes: String(v.notes ?? ""),
    };
  } catch (e) {
    return fallbackInspiration(
      `inspiration_error:${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`,
    );
  }
}

// Cosine-style similarity guard against the last N pins' master dims.
// Returns 0 (totally unique) → 1 (identical). Used in factory to nudge the
// diversity seed when a candidate collides with recent history.
export function dimsSimilarity(a: Partial<MasterDims>, b: Partial<MasterDims>): number {
  const keys: (keyof MasterDims)[] = [
    "composition","camera","lighting","room","story","emotion",
    "owner","palette","season","hero","breed_hint","imperfection",
  ];
  let same = 0;
  for (const k of keys) if (a[k] && a[k] === b[k]) same++;
  return same / keys.length;
}