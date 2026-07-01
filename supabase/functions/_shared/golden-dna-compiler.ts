// Genesis V6.4 — Golden DNA Prompt Compiler
//
// Deterministic pre-processor that sits between the Creative Director and the
// Gemini image model. It NEVER weakens PRE, NEVER lowers thresholds, and NEVER
// bypasses validation — it only guarantees that every prompt Gemini receives
// is species-locked, palette-locked, occupancy-targeted, and DNA-inherited.
//
// Fully additive: reuses the PRE=96 Golden DNA reference from
// `pinterest-style-dna.ts`. This file adds no new engines, no new publishers,
// and no new scorers — only the compiler layer described in Phase 1..9 of the
// V6.4 directive.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Species = "dog" | "cat" | "small_pet" | "bird" | "fish" | "human_only" | "unknown";
export type Environment = "indoor" | "outdoor" | "either";
export type ToyShape =
  | "bird"
  | "mouse"
  | "fish"
  | "squirrel"
  | "rabbit"
  | "bone"
  | "ball"
  | "plush"
  | "none";

export interface ProductLike {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  primary_species?: string | null;
  product_type?: string | null;
  landing_dominant_colors?: string[] | null;
  primary_color?: string | null;
  image_url?: string | null;
  price?: number | null;
  brand?: string | null;
}

export interface CompiledRuleSet {
  species: Species;
  allowed_species: Species[];
  forbidden_species: Species[];
  toy_shape: ToyShape;
  semantic_interpretation: string;
  species_source: "primary_species" | "category" | "tags" | "description" | "title" | "fallback";
  allowed_breeds: string[];
  forbidden_breeds: string[];
  environment: Environment;
  allowed_environment: string[];
  forbidden_environment: string[];
  allowed_use_cases: string[];
  forbidden_use_cases: string[];
  allowed_accessories: string[];
  forbidden_accessories: string[];
  allowed_colors: string[];
  landing_dominant_colors: string[];
  camera_angle: string;
  lens_mm: number;
  lighting: string;
  mood: string;
  composition: string;
  background: string;
  product_occupancy_target: number; // 0..100
  product_visibility_target: number; // 0..100
  landing_similarity_target: number; // 0..100
  shopping_similarity_target: number; // 0..100
  click_intent_target: number; // 0..100
  emotional_trigger: string;
  pinterest_stopping_power: number; // 0..100
  aspect_ratio: "2:3";
  golden_dna_ref: string;
}

export interface CompilerQAResult {
  ok: boolean;
  blockers: string[];
}

export interface CompilerRunResult {
  ok: boolean;
  prompt: string;
  rule_set: CompiledRuleSet;
  rule_hash: string;
  predicted_pre: number;
  qa_blockers: string[];
  dominant_blocker: string | null;
  mutation_step: number;
  reason?: string;
}

export interface CompilerLedgerRow {
  trace_id?: string | null;
  product_id?: string | null;
  product_slug?: string | null;
  rule_hash: string;
  compiled_prompt: string;
  rule_set: CompiledRuleSet;
  predicted_pre: number;
  actual_pre?: number | null;
  dominant_blocker: string | null;
  qa_blockers: string[];
  mutation_step: number;
  gemini_called: boolean;
  succeeded?: boolean | null;
  source_function: string;
}

// -----------------------------------------------------------------------------
// PRE=96 Golden DNA defaults (from the existing pinterest-style-dna reference)
// -----------------------------------------------------------------------------

export const GOLDEN_DNA_DEFAULTS = {
  camera_angle: "eye-level, subject-forward",
  lens_mm: 85,
  lighting: "soft directional golden-hour daylight, gentle rim light",
  mood: "premium, warm, aspirational US lifestyle",
  composition: "rule-of-thirds hero with product in dominant third",
  background: "clean, uncluttered, shallow depth of field",
  product_occupancy_target: 32,
  product_visibility_target: 95,
  landing_similarity_target: 88,
  shopping_similarity_target: 92,
  click_intent_target: 90,
  pinterest_stopping_power: 88,
  emotional_trigger: "trust + delight",
  aspect_ratio: "2:3" as const,
  golden_dna_ref: "pre96-golden-dna-v1",
};

// -----------------------------------------------------------------------------
// Category → species rule table (deterministic, no LLM)
// -----------------------------------------------------------------------------

const DOG_HINTS = [
  "dog", "puppy", "canine", "collar", "leash", "harness", "kennel", "chew",
  "training treat", "dog bed", "dog toy", "dog food",
];
const CAT_HINTS = [
  "cat", "kitten", "feline", "litter", "scratching", "cat tree", "cat bed",
  "cat toy", "cat food", "catnip",
];
const SMALL_PET_HINTS = ["hamster", "rabbit", "guinea", "ferret", "rodent"];
const BIRD_HINTS = ["bird", "parrot", "canary", "budgie", "aviary"];
const FISH_HINTS = ["fish", "aquarium", "tank filter"];

function textBag(product: ProductLike): string {
  return [
    product.name,
    product.description,
    product.category,
    ...(product.categories ?? []),
    ...(product.tags ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function detectSpecies(product: ProductLike): Species {
  const t = textBag(product);
  const hits = (arr: string[]) => arr.some((w) => t.includes(w));
  const dog = hits(DOG_HINTS);
  const cat = hits(CAT_HINTS);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  if (hits(SMALL_PET_HINTS)) return "small_pet";
  if (hits(BIRD_HINTS)) return "bird";
  if (hits(FISH_HINTS)) return "fish";
  return "unknown";
}

// -----------------------------------------------------------------------------
// Genesis V9.8 — Semantic product interpretation
//
// The compiler must NEVER infer the target animal from a single word in the
// product title. A "Bird Toy" listed under the "Bird Toys" collection with
// `primary_species='both'` is a BIRD-SHAPED toy for cats/dogs, NOT a toy for
// real birds. This resolver enforces the priority:
//   1. product.primary_species (explicit metadata — highest trust)
//   2. product.category / categories
//   3. product.tags
//   4. product.description
//   5. product.name (title — LOWEST trust, only used as a last resort)
// -----------------------------------------------------------------------------

const SHAPE_HINTS: Record<Exclude<ToyShape, "none">, string[]> = {
  bird: ["bird", "parrot", "canary", "budgie", "sparrow"],
  mouse: ["mouse", "mice", "rat "],
  fish: ["fish", "goldfish", "koi"],
  squirrel: ["squirrel"],
  rabbit: ["rabbit", "bunny"],
  bone: ["bone-shape", "bone shaped", "bone toy"],
  ball: ["ball toy", "fetch ball"],
  plush: ["plush toy", "stuffed toy"],
};

const CAT_TOY_CATEGORY_HINTS = ["cat toy", "cat toys", "feline toy", "kitten toy"];
const DOG_TOY_CATEGORY_HINTS = ["dog toy", "dog toys", "puppy toy", "chew toy"];

function normalizePrimarySpecies(v: string | null | undefined): Species | null {
  if (!v) return null;
  const s = v.toLowerCase().trim();
  if (s === "cat" || s === "feline") return "cat";
  if (s === "dog" || s === "canine") return "dog";
  if (s === "small_pet" || s === "small pet" || s === "rodent") return "small_pet";
  if (s === "bird" || s === "avian") return "bird";
  if (s === "fish") return "fish";
  // "both" / "cat_dog" / "multi" → default to CAT (cats are the largest
  // Pinterest-organic segment for shape-based novelty toys); the caller may
  // override via metadata but we never silently downgrade to "unknown".
  if (s === "both" || s === "cat_dog" || s === "cat+dog" || s === "multi" || s === "all") {
    return "cat";
  }
  return null;
}

function detectFromField(
  raw: string | null | undefined,
): Species | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  const hits = (arr: string[]) => arr.some((w) => t.includes(w));
  // Category / tag / description-level detection MUST prefer cat/dog signals
  // over shape words like "bird" or "mouse".
  if (hits(CAT_TOY_CATEGORY_HINTS)) return "cat";
  if (hits(DOG_TOY_CATEGORY_HINTS)) return "dog";
  const dog = hits(DOG_HINTS);
  const cat = hits(CAT_HINTS);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  if (hits(SMALL_PET_HINTS)) return "small_pet";
  return null;
}

function detectToyShape(product: ProductLike, targetSpecies: Species): ToyShape {
  // Shape only meaningful when the toy is FOR a mammal that plays with prey-
  // shaped toys (cat, dog, small_pet). For actual birds / fish species, shape
  // is irrelevant.
  if (targetSpecies !== "cat" && targetSpecies !== "dog" && targetSpecies !== "small_pet") {
    return "none";
  }
  const bag = textBag(product);
  for (const [shape, words] of Object.entries(SHAPE_HINTS)) {
    if (words.some((w) => bag.includes(w))) return shape as ToyShape;
  }
  return "none";
}

export interface SemanticInterpretation {
  target_species: Species;
  toy_shape: ToyShape;
  species_source: CompiledRuleSet["species_source"];
  interpretation: string;
}

export function interpretProductSemantics(product: ProductLike): SemanticInterpretation {
  // 1) primary_species — highest trust
  const explicit = normalizePrimarySpecies(product.primary_species);
  if (explicit) {
    const shape = detectToyShape(product, explicit);
    return {
      target_species: explicit,
      toy_shape: shape,
      species_source: "primary_species",
      interpretation: buildInterpretationLine(product, explicit, shape),
    };
  }
  // 2) category / categories
  const catField = [product.category, ...(product.categories ?? [])].filter(Boolean).join(" ");
  const fromCategory = detectFromField(catField);
  if (fromCategory) {
    const shape = detectToyShape(product, fromCategory);
    return {
      target_species: fromCategory,
      toy_shape: shape,
      species_source: "category",
      interpretation: buildInterpretationLine(product, fromCategory, shape),
    };
  }
  // 3) tags
  const fromTags = detectFromField((product.tags ?? []).join(" "));
  if (fromTags) {
    const shape = detectToyShape(product, fromTags);
    return {
      target_species: fromTags,
      toy_shape: shape,
      species_source: "tags",
      interpretation: buildInterpretationLine(product, fromTags, shape),
    };
  }
  // 4) description
  const fromDesc = detectFromField(product.description ?? null);
  if (fromDesc) {
    const shape = detectToyShape(product, fromDesc);
    return {
      target_species: fromDesc,
      toy_shape: shape,
      species_source: "description",
      interpretation: buildInterpretationLine(product, fromDesc, shape),
    };
  }
  // 5) title — last resort, and even here we only accept it if the title
  // yields a mammal species (never real-bird / real-fish inference).
  const fromTitle = detectFromField(product.name ?? null);
  if (fromTitle && (fromTitle === "cat" || fromTitle === "dog" || fromTitle === "small_pet")) {
    const shape = detectToyShape(product, fromTitle);
    return {
      target_species: fromTitle,
      toy_shape: shape,
      species_source: "title",
      interpretation: buildInterpretationLine(product, fromTitle, shape),
    };
  }
  // 6) legacy fallback — old detector (may return bird/fish etc.)
  const legacy = detectSpecies(product);
  return {
    target_species: legacy,
    toy_shape: "none",
    species_source: "fallback",
    interpretation: buildInterpretationLine(product, legacy, "none"),
  };
}

function buildInterpretationLine(
  product: ProductLike,
  species: Species,
  shape: ToyShape,
): string {
  const name = product.name ?? "product";
  if (species === "cat" && shape === "bird") {
    return `${name} = BIRD-SHAPED plush toy FOR CATS. Show a real cat batting / biting / chasing the bird-shaped toy. Never show a real bird.`;
  }
  if (species === "cat" && shape !== "none") {
    return `${name} = ${shape.toUpperCase()}-SHAPED cat toy. Show a real cat interacting with the ${shape}-shaped toy. Never show a real ${shape}.`;
  }
  if (species === "dog" && shape !== "none") {
    return `${name} = ${shape.toUpperCase()}-SHAPED dog toy. Show a real dog interacting with the ${shape}-shaped toy. Never show a real ${shape}.`;
  }
  if (species === "unknown") {
    return `${name} — target species could not be determined from metadata; product-only rendering required.`;
  }
  return `${name} = ${species.toUpperCase()} product. Show a real ${species} using the product.`;
}

function detectEnvironment(product: ProductLike): Environment {
  const t = textBag(product);
  if (/\b(outdoor|backyard|hike|park|beach|patio|yard)\b/.test(t)) return "outdoor";
  if (/\b(indoor|home|apartment|couch|sofa|bedroom|kitchen|living\s*room|scandinavian)\b/.test(t)) {
    return "indoor";
  }
  return "either";
}

function normalizeColors(colors: string[] | null | undefined): string[] {
  return (colors ?? [])
    .map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

// -----------------------------------------------------------------------------
// Phase 2: Automatic rule extraction
// -----------------------------------------------------------------------------

export function extractProductRules(product: ProductLike): CompiledRuleSet {
  const semantic = interpretProductSemantics(product);
  const species = semantic.target_species;
  const toyShape = semantic.toy_shape;
  const env = detectEnvironment(product);
  const landingColors = normalizeColors(
    product.landing_dominant_colors ?? (product.primary_color ? [product.primary_color] : []),
  );

  const forbiddenSpecies: Species[] =
    species === "dog"
      ? ["cat", "small_pet", "bird", "fish"]
      : species === "cat"
      ? ["dog", "small_pet", "bird", "fish"]
      : species === "small_pet"
      ? ["dog", "cat", "bird", "fish"]
      : species === "bird"
      ? ["dog", "cat", "small_pet", "fish"]
      : species === "fish"
      ? ["dog", "cat", "small_pet", "bird"]
      : [];

  const useCasesBySpecies: Record<Species, string[]> = {
    dog: ["walking", "playtime", "training", "rest at home"],
    cat: ["lounging", "grooming", "play"],
    small_pet: ["habitat use", "handling"],
    bird: ["perching", "feeding"],
    fish: ["tank showcase"],
    human_only: ["household demonstration"],
    unknown: ["lifestyle demonstration"],
  };

  const forbiddenUseCases = [
    "child interaction",
    "medical procedure",
    "text overlays",
    "infographic",
    "cta button",
    "watermark",
  ];

  return {
    species,
    allowed_species: species === "unknown" ? [] : [species],
    forbidden_species: forbiddenSpecies,
    toy_shape: toyShape,
    semantic_interpretation: semantic.interpretation,
    species_source: semantic.species_source,
    allowed_breeds: [],
    forbidden_breeds: [],
    environment: env,
    allowed_environment:
      env === "outdoor"
        ? ["modern US backyard", "sunny park path", "clean patio"]
        : env === "indoor"
        ? ["bright US living room", "minimal kitchen", "warm bedroom"]
        : ["modern US home", "clean lifestyle setting"],
    forbidden_environment: [
      "cluttered scene",
      "industrial warehouse",
      "medical clinic",
      "studio seamless background",
    ],
    allowed_use_cases: useCasesBySpecies[species] ?? useCasesBySpecies.unknown,
    forbidden_use_cases: forbiddenUseCases,
    allowed_accessories: [],
    forbidden_accessories: [
      "toys not sold",
      "competing products",
      "children",
      "text",
      "logos",
    ],
    allowed_colors: landingColors,
    landing_dominant_colors: landingColors,
    camera_angle: GOLDEN_DNA_DEFAULTS.camera_angle,
    lens_mm: GOLDEN_DNA_DEFAULTS.lens_mm,
    lighting: GOLDEN_DNA_DEFAULTS.lighting,
    mood: GOLDEN_DNA_DEFAULTS.mood,
    composition: GOLDEN_DNA_DEFAULTS.composition,
    background: GOLDEN_DNA_DEFAULTS.background,
    product_occupancy_target: GOLDEN_DNA_DEFAULTS.product_occupancy_target,
    product_visibility_target: GOLDEN_DNA_DEFAULTS.product_visibility_target,
    landing_similarity_target: GOLDEN_DNA_DEFAULTS.landing_similarity_target,
    shopping_similarity_target: GOLDEN_DNA_DEFAULTS.shopping_similarity_target,
    click_intent_target: GOLDEN_DNA_DEFAULTS.click_intent_target,
    emotional_trigger: GOLDEN_DNA_DEFAULTS.emotional_trigger,
    pinterest_stopping_power: GOLDEN_DNA_DEFAULTS.pinterest_stopping_power,
    aspect_ratio: GOLDEN_DNA_DEFAULTS.aspect_ratio,
    golden_dna_ref: GOLDEN_DNA_DEFAULTS.golden_dna_ref,
  };
}

// -----------------------------------------------------------------------------
// Phase 3 + 5: Deterministic prompt builder with Golden DNA inheritance
// -----------------------------------------------------------------------------

export function buildDeterministicPrompt(
  product: ProductLike,
  rules: CompiledRuleSet,
): string {
  const productName = (product.name ?? "product").trim();
  const speciesLine = rules.species === "unknown"
    ? "PRODUCT-ONLY: no animals of any species."
    : `${rules.species.toUpperCase()} ONLY. Never generate ${
      rules.forbidden_species.map((s) => s.toUpperCase()).join(", ") || "other species"
    }.`;
  const shapeLine =
    rules.toy_shape !== "none" && rules.species !== "unknown"
      ? `TOY SHAPE: ${rules.toy_shape.toUpperCase()}. The product is a ${rules.toy_shape.toUpperCase()}-SHAPED toy FOR ${rules.species.toUpperCase()}S. NEVER render a real ${rules.toy_shape}. Render a real ${rules.species} actively batting, biting, chasing or interacting with the ${rules.toy_shape}-shaped toy.`
      : null;
  const colorLine = rules.landing_dominant_colors.length
    ? `Product color MUST exactly match PDP palette: ${rules.landing_dominant_colors.join(", ")}.`
    : "Product color MUST exactly match the PDP hero image.";
  const envLine = `Environment: ${rules.allowed_environment.join(" OR ")}. Forbidden: ${rules.forbidden_environment.join(", ")}.`;
  const useCaseLine = `Use case: ${rules.allowed_use_cases.join(" OR ")}. Forbidden: ${rules.forbidden_use_cases.join(", ")}.`;

  return [
    `PRODUCT: ${productName}`,
    `SEMANTIC INTERPRETATION: ${rules.semantic_interpretation}`,
    `SPECIES SOURCE: ${rules.species_source} (title is never authoritative).`,
    speciesLine,
    ...(shapeLine ? [shapeLine] : []),
    `Subject MUST be shown actually using / wearing THIS product.`,
    colorLine,
    envLine,
    useCaseLine,
    `Camera: ${rules.camera_angle}, ${rules.lens_mm}mm equivalent.`,
    `Lighting: ${rules.lighting}.`,
    `Composition: ${rules.composition}.`,
    `Background: ${rules.background}.`,
    `Product occupancy target: ${rules.product_occupancy_target}% of frame.`,
    `Product visibility target: ${rules.product_visibility_target}%.`,
    `Landing similarity target: ${rules.landing_similarity_target}%.`,
    `Shopping similarity target: ${rules.shopping_similarity_target}%.`,
    `Emotional trigger: ${rules.emotional_trigger}.`,
    `Pinterest vertical ${rules.aspect_ratio}, maximum stopping power.`,
    `MUST NOT include: text overlays, infographics, CTA buttons, watermarks, children, competing products, other species${
      rules.toy_shape !== "none" ? `, or a real ${rules.toy_shape}` : ""
    }.`,
    `DNA reference: ${rules.golden_dna_ref}.`,
  ].join("\n");
}

// -----------------------------------------------------------------------------
// Phase 6: Self-validation (compiler QA)
// -----------------------------------------------------------------------------

export function compilerQA(
  product: ProductLike,
  rules: CompiledRuleSet,
  prompt: string,
): CompilerQAResult {
  const blockers: string[] = [];
  if (rules.species === "unknown") blockers.push("species_ambiguity");
  if (!rules.allowed_use_cases.length) blockers.push("use_case_ambiguity");
  if (rules.shopping_similarity_target < 85) blockers.push("shopping_ambiguity");
  if (rules.landing_similarity_target < 80) blockers.push("landing_mismatch");
  if (rules.product_occupancy_target < 20) blockers.push("occupancy_low");
  if (rules.product_visibility_target < 85) blockers.push("visibility_low");
  if (!/ONLY|PRODUCT-ONLY/.test(prompt)) blockers.push("species_lock_missing");
  if (!prompt.includes("Product occupancy target")) blockers.push("occupancy_missing");
  if (!prompt.includes("MUST NOT include")) blockers.push("negative_block_missing");
  if (!product.name) blockers.push("missing_product_name");
  return { ok: blockers.length === 0, blockers };
}

// -----------------------------------------------------------------------------
// Phase 8: Deterministic PRE predictor (no LLM call)
// -----------------------------------------------------------------------------

export function predictPre(
  rules: CompiledRuleSet,
  qa: CompilerQAResult,
  priorSuccessRate = 0.5,
): number {
  let score = 100;
  score -= qa.blockers.length * 8;
  if (rules.species === "unknown") score -= 20;
  if (!rules.landing_dominant_colors.length) score -= 6;
  if (rules.product_occupancy_target < 25) score -= 6;
  if (rules.product_visibility_target < 90) score -= 4;
  score += Math.round((priorSuccessRate - 0.5) * 10);
  return Math.max(0, Math.min(100, score));
}

// -----------------------------------------------------------------------------
// Phase 4: PRE-aware mutation (never resend the previous prompt)
// -----------------------------------------------------------------------------

export type Blocker =
  | "species_ambiguity"
  | "species_lock_missing"
  | "occupancy"
  | "occupancy_low"
  | "occupancy_missing"
  | "landing_mismatch"
  | "landing_divergence"
  | "visibility_low"
  | "click_intent"
  | "shopping_ambiguity"
  | "use_case_ambiguity";

export function mutateForBlocker(
  rules: CompiledRuleSet,
  blocker: Blocker | string,
): CompiledRuleSet {
  const next: CompiledRuleSet = { ...rules };
  switch (blocker) {
    case "species_ambiguity":
    case "species_lock_missing":
      // Force a decision: fall back to dog (largest US pet segment) if truly unknown
      if (next.species === "unknown") {
        next.species = "dog";
        next.allowed_species = ["dog"];
        next.forbidden_species = ["cat", "small_pet", "bird", "fish"];
      }
      break;
    case "occupancy":
    case "occupancy_low":
    case "occupancy_missing":
      next.product_occupancy_target = Math.min(50, next.product_occupancy_target + 8);
      next.composition = "hero-centered, product dominates the frame";
      break;
    case "landing_mismatch":
    case "landing_divergence":
      next.landing_similarity_target = Math.min(100, next.landing_similarity_target + 5);
      if (!next.landing_dominant_colors.length) {
        next.landing_dominant_colors = ["warm neutral", "brand accent"];
        next.allowed_colors = next.landing_dominant_colors;
      }
      break;
    case "click_intent":
      next.emotional_trigger = "curiosity + desire, aspirational US lifestyle";
      next.pinterest_stopping_power = Math.min(100, next.pinterest_stopping_power + 5);
      break;
    case "visibility_low":
      next.product_visibility_target = Math.min(100, next.product_visibility_target + 5);
      next.background = "clean minimal, product fully unobscured";
      break;
    case "shopping_ambiguity":
      next.shopping_similarity_target = Math.min(100, next.shopping_similarity_target + 5);
      break;
    case "use_case_ambiguity":
      if (!next.allowed_use_cases.length) {
        next.allowed_use_cases = ["lifestyle demonstration"];
      }
      break;
  }
  return next;
}

// -----------------------------------------------------------------------------
// Rule hash (stable, tiny — for de-duplication in the ledger)
// -----------------------------------------------------------------------------

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

export function ruleHash(rules: CompiledRuleSet, prompt: string): string {
  const key = JSON.stringify({
    s: rules.species,
    e: rules.environment,
    c: rules.landing_dominant_colors,
    o: rules.product_occupancy_target,
    v: rules.product_visibility_target,
    p: prompt,
  });
  return fnv1a(key);
}

// -----------------------------------------------------------------------------
// Phase 1..9 orchestrator — the compiler gate
// -----------------------------------------------------------------------------

export interface CompileOptions {
  minPredictedPre?: number; // default 90
  maxMutations?: number; // default 3
  priorSuccessRate?: number;
}

export function compilePrompt(
  product: ProductLike,
  opts: CompileOptions = {},
): CompilerRunResult {
  const minPre = opts.minPredictedPre ?? 90;
  const maxMut = opts.maxMutations ?? 3;
  const prior = opts.priorSuccessRate ?? 0.5;

  let rules = extractProductRules(product);
  let prompt = buildDeterministicPrompt(product, rules);
  let qa = compilerQA(product, rules, prompt);
  let predicted = predictPre(rules, qa, prior);
  let step = 0;

  while ((!qa.ok || predicted < minPre) && step < maxMut) {
    const dominant = qa.blockers[0] ??
      (predicted < minPre ? "occupancy" : "landing_divergence");
    rules = mutateForBlocker(rules, dominant);
    prompt = buildDeterministicPrompt(product, rules);
    qa = compilerQA(product, rules, prompt);
    predicted = predictPre(rules, qa, prior);
    step += 1;
  }

  const dominantBlocker = qa.blockers[0] ?? (predicted < minPre ? "low_predicted_pre" : null);
  const ok = qa.ok && predicted >= minPre;

  return {
    ok,
    prompt,
    rule_set: rules,
    rule_hash: ruleHash(rules, prompt),
    predicted_pre: predicted,
    qa_blockers: qa.blockers,
    dominant_blocker: dominantBlocker,
    mutation_step: step,
    reason: ok
      ? undefined
      : qa.ok
      ? `predicted_pre_below_${minPre}`
      : `qa_blocked:${qa.blockers.join(",")}`,
  };
}

// -----------------------------------------------------------------------------
// Ledger writer — fire-and-forget so it never blocks image generation
// -----------------------------------------------------------------------------

export async function writeCompilerLedger(
  sb: SupabaseClient,
  row: CompilerLedgerRow,
): Promise<string | null> {
  try {
    const { data, error } = await sb
      .from("compiler_prompt_ledger")
      .insert({
        trace_id: row.trace_id ?? null,
        product_id: row.product_id ?? null,
        product_slug: row.product_slug ?? null,
        rule_hash: row.rule_hash,
        compiled_prompt: row.compiled_prompt,
        rule_set: row.rule_set,
        predicted_pre: row.predicted_pre,
        actual_pre: row.actual_pre ?? null,
        dominant_blocker: row.dominant_blocker,
        qa_blockers: row.qa_blockers,
        mutation_step: row.mutation_step,
        gemini_called: row.gemini_called,
        succeeded: row.succeeded ?? null,
        source_function: row.source_function,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("[golden-dna-compiler] ledger insert failed", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn("[golden-dna-compiler] ledger threw", (e as Error).message);
    return null;
  }
}

// Update the ledger row after PRE has actually evaluated the generated image.
export async function attachActualPre(
  sb: SupabaseClient,
  ledgerId: string,
  actualPre: number,
  succeeded: boolean,
): Promise<void> {
  try {
    await sb
      .from("compiler_prompt_ledger")
      .update({ actual_pre: actualPre, succeeded })
      .eq("id", ledgerId);
  } catch (e) {
    console.warn("[golden-dna-compiler] attachActualPre failed", (e as Error).message);
  }
}

// Learning helper — recent success rate for a species+blocker combination.
export async function priorSuccessRate(
  sb: SupabaseClient,
  species: Species,
  windowDays = 14,
): Promise<number> {
  try {
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
    const { data, error } = await sb
      .from("compiler_prompt_ledger")
      .select("succeeded, rule_set")
      .gte("created_at", since)
      .limit(500);
    if (error || !data?.length) return 0.5;
    const relevant = data.filter((r) =>
      ((r as any).rule_set?.species ?? "unknown") === species &&
      typeof (r as any).succeeded === "boolean"
    );
    if (!relevant.length) return 0.5;
    const wins = relevant.filter((r) => (r as any).succeeded === true).length;
    return wins / relevant.length;
  } catch {
    return 0.5;
  }
}