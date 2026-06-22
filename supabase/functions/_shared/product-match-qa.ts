// Product Match QA — hard reject when any of the four signals don't match the product:
//   1. script ↔ product
//   2. voiceover ↔ script
//   3. scenes ↔ product category/species
//   4. captions ↔ product
// reject_score > 0 → block publish.

export type ProductRef = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  category?: string | null;
  primary_keyword?: string | null;
  seo_keywords?: string[] | null;
  species?: "cat" | "dog" | "other" | null;
};

export type QaInputs = {
  product: ProductRef;
  script?: string | null;
  voiceover_text?: string | null;
  captions?: string[] | null;
  scene_slugs?: string[] | null;
  scene_species?: ("cat" | "dog" | "other")[] | null;
};

export type QaResult = {
  passed: boolean;
  reject_score: number;
  reasons: string[];
  scores: {
    script: number;
    voiceover: number;
    scene: number;
    caption: number;
  };
};

const STOP = new Set(["the","a","an","and","or","for","with","of","to","in","on","is","are","your","you","my","our","this","that","it","get","new","best"]);

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

function productTokens(p: ProductRef): string[] {
  return Array.from(new Set([
    ...tokens(p.name),
    ...tokens(p.primary_keyword),
    ...tokens(p.category),
    ...tokens((p.seo_keywords || []).join(" ")),
  ]));
}

// Detect target species from product category / name.
export function inferSpecies(p: ProductRef): "cat" | "dog" | "other" {
  if (p.species) return p.species;
  const hay = `${p.category || ""} ${p.name || ""} ${(p.seo_keywords || []).join(" ")}`.toLowerCase();
  if (/\bcat\b|\bkitten\b|\bfeline\b|litter\s*box/.test(hay)) return "cat";
  if (/\bdog\b|\bpuppy\b|\bcanine\b/.test(hay)) return "dog";
  return "other";
}

export function runProductMatchQa(input: QaInputs): QaResult {
  const pTok = productTokens(input.product);
  const reasons: string[] = [];

  // 1. script ↔ product
  const scriptTok = tokens(input.script);
  const scriptScore = Math.round(jaccard(pTok, scriptTok) * 100);
  if (scriptTok.length > 0 && scriptScore < 15) reasons.push("script_off_product");

  // 2. voiceover ↔ script  (or product if script missing)
  const voTok = tokens(input.voiceover_text);
  const voBaseline = scriptTok.length > 0 ? scriptTok : pTok;
  const voScore = Math.round(jaccard(voBaseline, voTok) * 100);
  if (voTok.length > 0 && voScore < 20) reasons.push("voiceover_off_script");

  // 3. scenes ↔ product category/species
  const expectedSpecies = inferSpecies(input.product);
  const sceneSpecies = input.scene_species || [];
  let sceneScore = 100;
  if (sceneSpecies.length > 0) {
    const matches = sceneSpecies.filter((s) => s === expectedSpecies).length;
    sceneScore = Math.round((matches / sceneSpecies.length) * 100);
    if (sceneScore < 60) reasons.push("scene_species_mismatch");
  }

  // 4. captions ↔ product
  const capTok = tokens((input.captions || []).join(" "));
  const capScore = capTok.length === 0 ? 100 : Math.round(jaccard(pTok, capTok) * 100);
  if (capTok.length > 0 && capScore < 10) reasons.push("captions_off_product");

  const reject_score = reasons.length;
  return {
    passed: reject_score === 0,
    reject_score,
    reasons,
    scores: { script: scriptScore, voiceover: voScore, scene: sceneScore, caption: capScore },
  };
}

// Anti-slideshow detection — reject videos that are zoom-only, pan-only, or
// have fewer than 4 unique shots / real scene transitions.
export type AntiSlideshowInput = {
  scene_count?: number | null;
  unique_image_count?: number | null;
  camera_motion_score?: number | null; // 0-100, higher = more motion variety
  scene_change_count?: number | null;
  duration_seconds?: number | null;
  engine_version?: string | null;
};

export type AntiSlideshowResult = { passed: boolean; reasons: string[] };

export function runAntiSlideshow(input: AntiSlideshowInput): AntiSlideshowResult {
  const reasons: string[] = [];
  const scenes = Number(input.scene_count ?? 0);
  const unique = Number(input.unique_image_count ?? 0);
  const motion = Number(input.camera_motion_score ?? 100);
  const changes = Number(input.scene_change_count ?? scenes);

  if (scenes > 0 && scenes < 4) reasons.push("too_few_scenes");
  if (unique > 0 && unique < 4) reasons.push("too_few_unique_shots");
  if (changes > 0 && changes < 4) reasons.push("too_few_transitions");
  if (motion > 0 && motion < 35) reasons.push("pan_or_zoom_only");
  return { passed: reasons.length === 0, reasons };
}