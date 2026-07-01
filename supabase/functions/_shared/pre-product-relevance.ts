// Genesis V2 — Product Relevance Engine (PRE)
// Vision-based pre-publish gate that verifies a Pinterest creative truly
// matches the destination product. Returns a structured verdict and
// persists every evaluation to `pre_evaluations`.
//
// Server-side only. Requires LOVABLE_API_KEY. Caller passes a Supabase
// service-role client.

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

export type PreInput = {
  product_id: string;
  product_slug: string;
  product_name: string;
  product_description?: string | null;
  product_image_url?: string | null;
  product_primary_species?: string | null;
  product_category?: string | null;
  pin_title: string;
  pin_description: string;
  pin_image_url: string;
  destination_link: string;
  pin_queue_id?: string | null;
  trace_id?: string | null;
  function_name?: string | null;
};

export type PreVerdict = {
  passed: boolean;
  overall_score: number;
  scores: {
    product_visibility: number;
    expectation_match: number;
    species_match_ok: boolean;
    detected_species: string;
    use_case_match_ok: boolean;
    detected_use_case: string;
    promise_match: number;
    visual_focus: number;
    product_occupancy_pct: number;
    click_intent: number;
    landing_match: number;
    shopping_match: number;
  };
  blocking_reasons: string[];
  regenerate_brief?: {
    why_failed: string;
    new_headline?: string;
    new_environment?: string;
    new_camera?: string;
    new_emotion?: string;
    new_composition?: string;
    new_image_prompt?: string;
  };
  evaluation_id?: string;
};

const SYSTEM = `You are the Product Relevance Engine (PRE) for a Pinterest commerce platform.
You compare a Pinterest pin creative against the actual product the click leads to.
Pinterest is a search engine, NOT an art gallery. Within one second a viewer must understand:
what product is sold, for which animal, what problem it solves, why to click.
You MUST return strict JSON only.`;

function buildUserPrompt(i: PreInput): string {
  return `Evaluate this Pinterest creative for product relevance.

PRODUCT (the landing page the click goes to)
- name: ${i.product_name}
- slug: ${i.product_slug}
- category: ${i.product_category ?? "unknown"}
- primary_species: ${i.product_primary_species ?? "unknown"}
- description: ${(i.product_description ?? "").slice(0, 400)}
- canonical_image_url: ${i.product_image_url ?? "n/a"}

PIN
- title: ${i.pin_title}
- description: ${i.pin_description}
- destination: ${i.destination_link}

Score the pin image (attached) against the product on EVERY axis below.
Return JSON with EXACTLY this shape:
{
  "product_visibility_score": 0-100,           // Is the actual product clearly visible (not just a pet / room)?
  "expectation_match_score":  0-100,           // Does the image match the product the click leads to?
  "detected_species":  "cat" | "dog" | "multi" | "bird" | "small_animal" | "reptile" | "fish" | "none",
  "species_match_ok":  true | false,           // Image species == product species (or product is multi)
  "detected_use_case": "indoor" | "car" | "garden" | "travel" | "camping" | "walking" | "training" | "sleeping" | "vet" | "kitchen" | "bathroom" | "studio" | "other",
  "use_case_match_ok": true | false,           // Setting matches the product use case
  "promise_match_score": 0-100,                // Headline / description tell the same story as the product
  "visual_focus_score": 0-100,                 // First-second attention goes to product / hero subject (not noise)
  "product_occupancy_pct": 0-100,              // % of the image the product takes up. 20 min, 30-45 optimal
  "click_intent_score": 0-100,                 // "Do I instantly know what I get after the click?"
  "landing_match_score": 0-100,                // Pin image vs canonical product image — same color/variant/animal/use
  "shopping_match_score": 0-100,               // After click, do I buy exactly what I expected?
  "blocking_reasons": [string],                // Plain-English reasons to REJECT, empty if fine
  "regenerate_brief": {
    "why_failed": string,
    "new_headline": string,
    "new_environment": string,
    "new_camera": string,
    "new_emotion": string,
    "new_composition": string,
    "new_image_prompt": string
  }
}

Hard rejects (set passed=false implicitly via blocking_reasons):
- product_visibility < 95
- expectation_match  < 95
- species_match_ok = false
- use_case_match_ok = false
- product_occupancy_pct < 20
- click_intent_score < 95
- shopping_match_score < 95

A beautiful image that does NOT sell the product is a FAILED pin. Be strict.`;
}

async function loadSettings(supabase: any): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("pre_settings").select("key,value");
  const out: Record<string, unknown> = {};
  for (const row of (data ?? [])) out[row.key] = row.value;
  return out;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

export async function evaluateProductRelevance(
  supabase: any,
  input: PreInput,
): Promise<PreVerdict> {
  const t0 = Date.now();
  const settings = await loadSettings(supabase);
  const minOverall = num(settings.min_overall_score, 95);
  const minVisibility = num(settings.min_product_visibility, 95);
  const minClickIntent = num(settings.min_click_intent, 95);
  const minOccupancy = num(settings.min_product_occupancy_pct, 20);
  const model = (settings.vision_model as string) ?? "google/gemini-3-flash-preview";

  if (!KEY) {
    // Fail-closed: no key → block.
    return failClosed(input, "lovable_api_key_missing");
  }
  if (!input.pin_image_url || !/^https:\/\//i.test(input.pin_image_url)) {
    return failClosed(input, "pin_image_url_invalid");
  }

  const body = {
    model,
    temperature: 0.1,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: buildUserPrompt(input) },
          { type: "image_url", image_url: { url: input.pin_image_url } },
        ],
      },
    ],
  };

  let raw: any = null;
  let parsed: any = null;
  let networkError: string | null = null;
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(body),
    });
    raw = await res.text();
    if (!res.ok) {
      networkError = `gateway_${res.status}`;
    } else {
      const j = JSON.parse(raw);
      const text = j?.choices?.[0]?.message?.content ?? "{}";
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = JSON.parse(String(text).replace(/```json|```/g, ""));
      }
    }
  } catch (err) {
    networkError = (err as Error).message;
  }

  if (!parsed) {
    const v = failClosed(input, `pre_ai_${networkError ?? "parse_error"}`);
    await persist(supabase, input, v, model, Date.now() - t0, raw);
    return v;
  }

  const scores = {
    product_visibility: num(parsed.product_visibility_score, 0),
    expectation_match: num(parsed.expectation_match_score, 0),
    species_match_ok: !!parsed.species_match_ok,
    detected_species: String(parsed.detected_species ?? "none"),
    use_case_match_ok: !!parsed.use_case_match_ok,
    detected_use_case: String(parsed.detected_use_case ?? "other"),
    promise_match: num(parsed.promise_match_score, 0),
    visual_focus: num(parsed.visual_focus_score, 0),
    product_occupancy_pct: num(parsed.product_occupancy_pct, 0),
    click_intent: num(parsed.click_intent_score, 0),
    landing_match: num(parsed.landing_match_score, 0),
    shopping_match: num(parsed.shopping_match_score, 0),
  };
  const blocking: string[] = Array.isArray(parsed.blocking_reasons)
    ? parsed.blocking_reasons.map(String).filter(Boolean)
    : [];

  if (scores.product_visibility < minVisibility) blocking.push(`product_visibility<${minVisibility}`);
  if (scores.expectation_match < minOverall) blocking.push(`expectation_match<${minOverall}`);
  if (!scores.species_match_ok) blocking.push("species_mismatch");
  if (!scores.use_case_match_ok) blocking.push("use_case_mismatch");
  if (scores.product_occupancy_pct < minOccupancy) blocking.push(`product_occupancy<${minOccupancy}%`);
  if (scores.click_intent < minClickIntent) blocking.push(`click_intent<${minClickIntent}`);
  if (scores.shopping_match < minOverall) blocking.push(`shopping_match<${minOverall}`);
  if (scores.landing_match < 80) blocking.push("landing_image_divergence");

  // Weighted overall — visibility / expectation / click intent dominate.
  const overall = Math.round(
    0.20 * scores.product_visibility +
    0.20 * scores.expectation_match +
    0.15 * scores.click_intent +
    0.10 * scores.shopping_match +
    0.10 * scores.promise_match +
    0.10 * scores.landing_match +
    0.10 * scores.visual_focus +
    0.05 * Math.min(100, scores.product_occupancy_pct * 2.5),
  );

  const passed = blocking.length === 0 && overall >= minOverall;

  const verdict: PreVerdict = {
    passed,
    overall_score: overall,
    scores,
    blocking_reasons: Array.from(new Set(blocking)),
    regenerate_brief: parsed.regenerate_brief ?? undefined,
  };
  await persist(supabase, input, verdict, model, Date.now() - t0, parsed);
  return verdict;
}

function failClosed(input: PreInput, reason: string): PreVerdict {
  return {
    passed: false,
    overall_score: 0,
    scores: {
      product_visibility: 0,
      expectation_match: 0,
      species_match_ok: false,
      detected_species: "none",
      use_case_match_ok: false,
      detected_use_case: "other",
      promise_match: 0,
      visual_focus: 0,
      product_occupancy_pct: 0,
      click_intent: 0,
      landing_match: 0,
      shopping_match: 0,
    },
    blocking_reasons: [reason],
  };
}

async function persist(
  supabase: any,
  i: PreInput,
  v: PreVerdict,
  model: string,
  latency: number,
  raw: unknown,
) {
  try {
    const { data } = await supabase
      .from("pre_evaluations")
      .insert({
        product_id: i.product_id,
        product_slug: i.product_slug,
        pin_queue_id: i.pin_queue_id ?? null,
        pin_title: i.pin_title,
        pin_description: i.pin_description,
        pin_image_url: i.pin_image_url,
        destination_link: i.destination_link,
        product_visibility_score: v.scores.product_visibility,
        expectation_match_score: v.scores.expectation_match,
        species_match_ok: v.scores.species_match_ok,
        detected_species: v.scores.detected_species,
        use_case_match_ok: v.scores.use_case_match_ok,
        detected_use_case: v.scores.detected_use_case,
        promise_match_score: v.scores.promise_match,
        visual_focus_score: v.scores.visual_focus,
        product_occupancy_pct: v.scores.product_occupancy_pct,
        click_intent_score: v.scores.click_intent,
        landing_match_score: v.scores.landing_match,
        shopping_match_score: v.scores.shopping_match,
        overall_score: v.overall_score,
        passed: v.passed,
        blocking_reasons: v.blocking_reasons,
        regenerate_brief: v.regenerate_brief ?? null,
        raw_response: raw ?? null,
        vision_model: model,
        latency_ms: latency,
        trace_id: i.trace_id ?? null,
      })
      .select("id")
      .maybeSingle();
    if (data?.id) v.evaluation_id = data.id;
    // Emit trace event so PRE outcomes are joinable to the originating
    // AI request / generation-lock / cache lookup via trace_id.
    if (i.trace_id) {
      try {
        await supabase.from("ai_trace_events").insert({
          trace_id: i.trace_id,
          function_name: i.function_name ?? "pre-product-relevance",
          stage: v.passed ? "pre_pass" : "pre_fail",
          product_slug: i.product_slug,
          product_id: i.product_id,
          model,
          status: v.passed ? "ok" : "blocked",
          latency_ms: latency,
          pin_queue_id: i.pin_queue_id ?? null,
          pre_evaluation_id: data?.id ?? null,
          meta: {
            overall_score: v.overall_score,
            blocking_reasons: v.blocking_reasons,
          },
        });
      } catch (_) {}
    }
  } catch (_) {
    // Never let logging failures block the verdict.
  }
}

export async function preEnabled(supabase: any): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("pre_settings")
      .select("value")
      .eq("key", "enabled")
      .maybeSingle();
    return data?.value !== false;
  } catch {
    return true; // fail-closed default
  }
}