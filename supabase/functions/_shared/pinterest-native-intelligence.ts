// Pinterest Native Intelligence V2 — additive pre-render brain for the
// certified Creative Factory. It DOES NOT modify or bypass any downstream
// certified guard (PRE, CI, Guardian, Destination, Description, PCIE2).
// It only decides WHAT prompt to send to the image model so first-attempt
// certification rate rises over time.
//
// Phases implemented:
//   1. Pinterest Native Predictor (heuristic + LLM critic)
//   2. Adaptive Prompt Evolution (failure-aware directive expansion)
//   3. Multi-Concept Competition (N candidates -> keep winner)
//   5. Recovery Intelligence (attempt-specific strategy table)
//   6. Pinterest Native Design Rules (canonical constraint block)
//   7. Self-Critique (would-I-save / would-IKEA-publish gates)
//
// Phase 4 learning is written to `pinterest_native_learnings` by the
// factory as soon as a render's guard outcome is known. Phase 8/9
// certification and publishing stay in their existing certified modules.

export type NiScoreKey =
  | "pinterest_native"
  | "shopping_intent"
  | "save_probability"
  | "click_probability"
  | "product_visibility"
  | "lifestyle_match"
  | "landing_match"
  | "visual_identity"
  | "success_dna"
  | "organic_intelligence"
  | "ai_detection_risk"
  | "commercial_intent"
  | "expected_pre"
  | "expected_ci";

export type NiScore = {
  score: number; // 0..100 (for ai_detection_risk: lower is better)
  confidence: number; // 0..1
};

export type NiPrediction = Record<NiScoreKey, NiScore> & {
  passes_predictor: boolean;
  blockers: string[];
};

export type NiConcept = {
  id: string;
  title: string;
  brief: string; // prompt block
  prediction: NiPrediction;
  critique: string[];
};

export type NiAttemptStrategy = {
  attempt: number;
  focus: string;
  directives: string[];
};

// Phase 5 — Recovery Intelligence
const ATTEMPT_STRATEGIES: NiAttemptStrategy[] = [
  {
    attempt: 1,
    focus: "correct_largest_failure",
    directives: [
      "Address the single largest failure from the previous attempt first; do not spread effort across secondary issues.",
    ],
  },
  {
    attempt: 2,
    focus: "correct_remaining_failures",
    directives: [
      "Keep the fix from attempt 1 and additionally address every remaining PRE / Visual Identity / Description blocker.",
    ],
  },
  {
    attempt: 3,
    focus: "optimise_pinterest_native_score",
    directives: [
      "Move the composition closer to premium Pinterest home-feed pins: Scandinavian interior, natural daylight, product on rule-of-thirds intersection, 22-30% occupancy.",
    ],
  },
  {
    attempt: 4,
    focus: "optimise_shopping_match",
    directives: [
      "Increase landing-page similarity: match product color, silhouette, material and camera angle to the PDP hero image; the pin must be instantly recognisable as the same SKU.",
    ],
  },
  {
    attempt: 5,
    focus: "optimise_save_probability",
    directives: [
      "Style the scene like a home a US Pinterest saver would want to recreate: warm light, curated but lived-in props (max 2, never occluding the product), soft shadows.",
    ],
  },
  {
    attempt: 6,
    focus: "final_commercial_optimisation",
    directives: [
      "Final pass — remove any element that adds artistic value but reduces click intent. The viewer must think 'I want to buy this' within one second.",
    ],
  },
];

export function getAttemptStrategy(attempt: number): NiAttemptStrategy {
  const idx = Math.min(Math.max(attempt, 1), ATTEMPT_STRATEGIES.length) - 1;
  return ATTEMPT_STRATEGIES[idx];
}

// Phase 6 — canonical design rules block, prepended to every concept.
export const NI_DESIGN_RULES = [
  "[PINTEREST_NATIVE_DESIGN_RULES_V2]",
  "Aesthetic: premium US home / IKEA / West Elm / Pottery Barn / CB2 / Architectural Digest editorial photograph.",
  "Interior: luxury Scandinavian, light oak floor, matte white walls, natural linen, minimal curated props (max 2, never in front of the product).",
  "Lighting: soft natural daylight from a large window, realistic shadows, warm colour temperature (~4800K).",
  "Camera: eye-level, 85mm equivalent, shallow depth of field, no wide-angle distortion.",
  "Composition: rule of thirds; the product occupies 22-30% of the frame at the primary intersection; product visibility 98-100%.",
  "Pet (if present): authentic breed, authentic behaviour, secondary role, partially cropped, never occluding the product silhouette.",
  "Forbidden: text overlays, stickers, arrows, badges, fake discounts, floating objects, impossible geometry, fantasy lighting, cinematic movie-poster grading, exaggerated HDR, painterly texture, AI-obvious symmetry, dreamy fog.",
  "Feel: 'I found this beautiful room on Pinterest' — never 'this is an AI ad'.",
].join("\n");

// Phase 7 — self-critique gate questions, must ALL be YES.
export const NI_SELF_CRITIQUE_QUESTIONS = [
  "Would I save this?",
  "Would I click this?",
  "Is the product obvious within one second?",
  "Does this look like a real premium home?",
  "Would Pinterest recommend this?",
  "Would IKEA publish this?",
  "Would West Elm publish this?",
  "Would Pottery Barn publish this?",
  "Would CB2 publish this?",
  "Would Architectural Digest feature this?",
];

// Predictor threshold — must be reached BEFORE we spend a GPU render call.
export const NI_MIN_PREDICTOR_SCORE = 78;

// ---------------------------------------------------------------------------
// Heuristic predictor — cheap, deterministic, no LLM call. Runs first.
// ---------------------------------------------------------------------------

const NEGATIVE_TOKENS: Array<[RegExp, NiScoreKey, number, string]> = [
  [/cinematic|movie[- ]poster|dramatic (grade|colou?r)/i, "visual_identity", -25, "cinematic_grading"],
  [/fantasy|dreamy|surreal|painterly|illustration/i, "ai_detection_risk", +30, "fantasy_or_painterly"],
  [/oversaturat|hdr|bloom|glow halo/i, "visual_identity", -15, "hdr_bloom"],
  [/floating|impossible geometry/i, "ai_detection_risk", +25, "impossible_geometry"],
  [/text overlay|sticker|arrow|badge|discount/i, "pinterest_native", -20, "overlay_or_badge"],
  [/wide (angle|shot).{0,20}(backyard|room|scene)/i, "product_visibility", -20, "wide_shot_shrinks_product"],
];

const POSITIVE_TOKENS: Array<[RegExp, NiScoreKey, number, string]> = [
  [/rule[- ]of[- ]thirds/i, "pinterest_native", +10, "rule_of_thirds"],
  [/eye[- ]level|85mm|shallow depth of field/i, "visual_identity", +10, "editorial_camera"],
  [/scandinavian|light oak|matte white|linen/i, "lifestyle_match", +15, "scandi_interior"],
  [/22[- ]?30%|occupancy.{0,10}25/i, "product_visibility", +15, "occupancy_locked"],
  [/natural daylight|soft window light/i, "visual_identity", +8, "natural_daylight"],
  [/getpawsy|destination|pdp/i, "landing_match", +10, "destination_referenced"],
];

function baseScore(k: NiScoreKey): number {
  return k === "ai_detection_risk" ? 30 : 65;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function heuristicPredict(brief: string): NiPrediction {
  const keys: NiScoreKey[] = [
    "pinterest_native",
    "shopping_intent",
    "save_probability",
    "click_probability",
    "product_visibility",
    "lifestyle_match",
    "landing_match",
    "visual_identity",
    "success_dna",
    "organic_intelligence",
    "ai_detection_risk",
    "commercial_intent",
    "expected_pre",
    "expected_ci",
  ];
  const scores = Object.fromEntries(
    keys.map((k) => [k, { score: baseScore(k), confidence: 0.4 }]),
  ) as Record<NiScoreKey, NiScore>;
  const blockers: string[] = [];
  for (const [re, key, delta, tag] of NEGATIVE_TOKENS) {
    if (re.test(brief)) {
      scores[key].score = clamp(scores[key].score + delta);
      blockers.push(tag);
    }
  }
  for (const [re, key, delta, tag] of POSITIVE_TOKENS) {
    if (re.test(brief)) {
      scores[key].score = clamp(scores[key].score + delta);
      scores[key].confidence = Math.min(0.85, scores[key].confidence + 0.15);
      // tag positive presence to raise related aggregates
      if (tag === "occupancy_locked") {
        scores.expected_pre.score = clamp(scores.expected_pre.score + 10);
      }
      if (tag === "scandi_interior") {
        scores.visual_identity.score = clamp(scores.visual_identity.score + 6);
      }
    }
  }
  // Cross-signal aggregations
  const aggregate = clamp(
    (scores.pinterest_native.score * 0.25) +
      (scores.product_visibility.score * 0.25) +
      (scores.visual_identity.score * 0.2) +
      (scores.lifestyle_match.score * 0.15) +
      ((100 - scores.ai_detection_risk.score) * 0.15),
  );
  scores.pinterest_native.score = aggregate;
  scores.expected_pre.score = clamp(
    (scores.product_visibility.score + scores.visual_identity.score) / 2,
  );
  scores.expected_ci.score = clamp(
    (scores.shopping_intent.score + scores.commercial_intent.score + scores.landing_match.score) / 3,
  );
  return {
    ...scores,
    passes_predictor: aggregate >= NI_MIN_PREDICTOR_SCORE &&
      scores.expected_pre.score >= 82 &&
      scores.ai_detection_risk.score <= 40,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// LLM critic (Phase 1 + Phase 7). Cheap text model, JSON output.
// ---------------------------------------------------------------------------

const CRITIC_MODEL = Deno.env.get("PINTEREST_NI_CRITIC_MODEL") || "google/gemini-2.5-flash";

export type NiCritiqueResult = {
  scores: Partial<Record<NiScoreKey, number>>;
  answers: Array<{ q: string; yes: boolean; reason: string }>;
  verdict: "pass" | "revise";
  revision_notes: string[];
};

export async function llmCritique(
  apiKey: string,
  productName: string,
  brief: string,
): Promise<NiCritiqueResult | null> {
  const questions = NI_SELF_CRITIQUE_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const sys =
    "You are a Pinterest editorial art director for a premium US pet home-goods brand. " +
    "You NEVER lower quality gates; you critique image briefs against IKEA/West Elm/Pottery Barn/CB2/Architectural Digest standards. " +
    "Respond with strict JSON only, no prose, no markdown fences.";
  const user = [
    `Product: ${productName}`,
    "",
    "Brief:",
    brief,
    "",
    "Answer these questions (yes/no + one-line reason):",
    questions,
    "",
    "Also score 0-100 (ai_detection_risk: lower is better):",
    "pinterest_native, shopping_intent, save_probability, click_probability,",
    "product_visibility, lifestyle_match, landing_match, visual_identity,",
    "ai_detection_risk, commercial_intent, expected_pre, expected_ci.",
    "",
    'Return JSON: {"scores":{...},"answers":[{"q":"...","yes":true,"reason":"..."}],"verdict":"pass"|"revise","revision_notes":["..."]}',
  ].join("\n");

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CRITIC_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const raw = j?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    return parsed as NiCritiqueResult;
  } catch {
    return null;
  }
}

// Merge LLM critique into a NiPrediction (LLM gets more weight than heuristic).
export function fusePrediction(
  heuristic: NiPrediction,
  critique: NiCritiqueResult | null,
): NiPrediction {
  if (!critique) return heuristic;
  const merged: NiPrediction = { ...heuristic };
  for (const [k, v] of Object.entries(critique.scores ?? {})) {
    if (typeof v !== "number") continue;
    const key = k as NiScoreKey;
    if (!(key in merged)) continue;
    merged[key] = {
      score: clamp(Math.round(heuristic[key].score * 0.35 + v * 0.65)),
      confidence: Math.min(0.95, heuristic[key].confidence + 0.25),
    };
  }
  const failedQ = (critique.answers ?? []).filter((a) => !a.yes);
  merged.blockers = [
    ...heuristic.blockers,
    ...failedQ.map((a) => `critique_no:${a.q}`),
  ];
  merged.passes_predictor = critique.verdict === "pass" &&
    merged.pinterest_native.score >= NI_MIN_PREDICTOR_SCORE &&
    merged.expected_pre.score >= 82 &&
    merged.ai_detection_risk.score <= 40;
  return merged;
}

// ---------------------------------------------------------------------------
// Multi-concept generator (Phase 3)
// ---------------------------------------------------------------------------

export type NiConceptSeed = {
  id: string;
  angle: string; // e.g. "hero-on-rug", "windowlight-close", "corner-styled"
  hint: string;
};

const DEFAULT_ANGLES: NiConceptSeed[] = [
  { id: "A", angle: "hero-on-rug", hint: "product centred on a plain natural rug, eye-level, tight crop." },
  { id: "B", angle: "windowlight-corner", hint: "product in a styled corner with soft window light from the left." },
  { id: "C", angle: "lived-in-scene", hint: "product in a Scandinavian living room, one authentic pet secondary at frame edge." },
  { id: "D", angle: "top-third-tight", hint: "close-up, product occupying the top-two-thirds of the frame, shallow depth of field." },
  { id: "E", angle: "entryway-editorial", hint: "product in an entryway or hallway, warm oak floor, minimal props." },
];

export function buildConceptBrief(
  productName: string,
  seed: NiConceptSeed,
  attemptStrategy: NiAttemptStrategy,
  priorFailureReason: string | null,
): string {
  const failure = priorFailureReason
    ? `[PRIOR_FAILURE] ${priorFailureReason}\n`
    : "";
  const strategy = `[ATTEMPT_${attemptStrategy.attempt}_STRATEGY] ${attemptStrategy.focus}\n- ${attemptStrategy.directives.join("\n- ")}`;
  return [
    NI_DESIGN_RULES,
    "",
    failure + strategy,
    "",
    `[CONCEPT_${seed.id}_${seed.angle}]`,
    `Product: ${productName}`,
    `Angle: ${seed.hint}`,
    "Render as a premium Pinterest-native shopping pin with product visibility 98-100% and occupancy 22-30%.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Top-level orchestrator — called by the factory before buildPrompt.
// ---------------------------------------------------------------------------

export type NiRunInput = {
  productName: string;
  attempt: number; // 1..6
  priorFailureReason: string | null;
  apiKey: string;
  useLlmCritic?: boolean; // default true
  numConcepts?: number; // default 5
};

export type NiRunResult = {
  winner: NiConcept;
  runners_up: NiConcept[];
  attempt_strategy: NiAttemptStrategy;
  design_rules_version: "v2";
  generated_at: string;
};

export async function runPinterestNativeIntelligence(
  input: NiRunInput,
): Promise<NiRunResult> {
  const strategy = getAttemptStrategy(input.attempt);
  const seeds = DEFAULT_ANGLES.slice(0, input.numConcepts ?? 5);

  // 1. Build brief per seed and score with the heuristic predictor
  const heuristics: NiConcept[] = seeds.map((s) => {
    const brief = buildConceptBrief(input.productName, s, strategy, input.priorFailureReason);
    return {
      id: s.id,
      title: `${s.id}:${s.angle}`,
      brief,
      prediction: heuristicPredict(brief),
      critique: [],
    };
  });

  // 2. Keep top 2 by pinterest_native, discard the rest (Phase 3)
  heuristics.sort(
    (a, b) => b.prediction.pinterest_native.score - a.prediction.pinterest_native.score,
  );
  const finalists = heuristics.slice(0, 2);

  // 3. LLM critique only on finalists (cheap: 2 calls)
  if (input.useLlmCritic !== false && input.apiKey) {
    for (const c of finalists) {
      const crit = await llmCritique(input.apiKey, input.productName, c.brief);
      c.prediction = fusePrediction(c.prediction, crit);
      c.critique = crit?.revision_notes ?? [];
    }
  }

  // 4. Pick the winner by final pinterest_native score
  finalists.sort(
    (a, b) => b.prediction.pinterest_native.score - a.prediction.pinterest_native.score,
  );
  const winner = finalists[0];
  const runners_up = [
    ...finalists.slice(1),
    ...heuristics.slice(2),
  ];

  return {
    winner,
    runners_up,
    attempt_strategy: strategy,
    design_rules_version: "v2",
    generated_at: new Date().toISOString(),
  };
}

// Prompt block the factory should APPEND (never replace) to the compiled
// Golden-DNA prompt. This is the only surface the factory exposes.
export function formatWinnerAsDirectives(result: NiRunResult): string {
  const w = result.winner;
  const scores = Object.entries(w.prediction)
    .filter(([k]) => !["passes_predictor", "blockers"].includes(k))
    .map(([k, v]) => `  ${k}: ${(v as NiScore).score} (conf ${(v as NiScore).confidence.toFixed(2)})`)
    .join("\n");
  return [
    "[PINTEREST_NATIVE_INTELLIGENCE_V2_WINNER]",
    `concept: ${w.title}`,
    `attempt_strategy: ${result.attempt_strategy.focus}`,
    `predictor_scores:\n${scores}`,
    "",
    w.brief,
  ].join("\n");
}