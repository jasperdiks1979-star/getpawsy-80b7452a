// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Quality Scorer
// ─────────────────────────────────────────────────────────────────────────────
// Multi-axis scorer that gates every rendered Pinterest pin BEFORE it can be
// queued. Combines deterministic checks (text length, banned terms, file size)
// with a single Gemini multimodal call that returns numeric ratings for the
// visual axes. If a pin scores below QUALITY_THRESHOLD, the caller retries with
// the failure reasons appended to the next brief (max 2 retries).

import type { StyleDNA } from "./pinterest-style-dna.ts";
import type { PinterestPattern } from "./pinterest-patterns.ts";
import type { PinModeKey } from "./pinterest-pin-modes.ts";

// Default gating — can be overridden per-call by runtime settings
// (`pinterest_runtime_settings.quality_threshold` / `max_render_retries`).
// Defaults match the "Balanced" rollout: reject below 70, retry once, log
// a score on every render.
export const QUALITY_THRESHOLD = 70;
export const MAX_RETRIES = 1;

export type QualityBand = "elite" | "strong" | "acceptable" | "weak" | "reject";

export function bandForScore(total: number): QualityBand {
  if (total >= 88) return "elite";
  if (total >= 78) return "strong";
  if (total >= 70) return "acceptable";
  if (total >= 58) return "weak";
  return "reject";
}

const QUALITY_MODEL =
  Deno.env.get("PINTEREST_CD_QUALITY_MODEL") || "google/gemini-2.5-flash";

export interface QualityScores {
  mobile_safety: number;
  visual_balance: number;
  readability: number;
  viral_potential: number;
  pinterest_native: number;
  /** New 8-axis additions (Phase 4 commerce intelligence). */
  emotional_resonance: number;
  luxury_aesthetic: number;
  conversion_potential: number;
  /** Phase 1 — AI-rated mobile safe-zone analysis (text cutoff, CTA overlap,
   *  focal clarity on iPhone Pinterest feed crop). 0-100. */
  mobile_safe_zone: number;
  /** Phase 1 — fused mobile safety: deterministic guard ⨯ AI safe-zone. */
  mobile_safety_score: number;
  /** Phase 2 — composite "is this Pinterest-native premium creative?" score
   *  blended from the visual axes. 0-100. */
  visual_quality_score: number;
  /** Derived composite signals (0-100), not separate AI calls. */
  save_probability: number;
  click_probability: number;
  commerce_probability: number;
  total: number;
  /** Phase 2 — quality band: elite | strong | acceptable | weak | reject. */
  quality_band: QualityBand;
}

export interface QualityResult {
  ok: boolean;
  scores: QualityScores;
  reasons: string[];
  notes?: string;
}

// ── deterministic checks ────────────────────────────────────────────────────

function containsBanned(s: string, banned: string[]): string | null {
  const low = s.toLowerCase();
  for (const b of banned) if (low.includes(b)) return b;
  return null;
}

function deterministicChecks(args: {
  bytes: Uint8Array;
  headline: string;
  cta: string;
  full_prompt: string;
  environment_summary: string;
  dna: StyleDNA;
  pattern?: PinterestPattern | null;
}): { reasons: string[]; mobile_safety: number; viral_potential: number } {
  const reasons: string[] = [];
  let mobile_safety = 100;
  let viral_potential = 70;

  if (!args.bytes || args.bytes.length < 80 * 1024) {
    reasons.push("image too small (<80KB)");
    mobile_safety -= 25;
  }
  if (args.bytes && args.bytes.length > 8 * 1024 * 1024) {
    reasons.push("image too large (>8MB)");
  }
  if (!args.headline) {
    reasons.push("missing headline");
    mobile_safety -= 30;
  }
  if (args.headline.length > 42) {
    reasons.push("headline >42 chars");
    mobile_safety -= 20;
  }
  if (!args.cta) {
    reasons.push("missing cta");
    mobile_safety -= 15;
  }
  if (args.cta.length > 18) {
    reasons.push("cta >18 chars");
    mobile_safety -= 10;
  }

  for (const field of [args.headline, args.cta, args.full_prompt]) {
    const hit = containsBanned(field, args.dna.banned_terms);
    if (hit) reasons.push(`banned term: "${hit}"`);
  }

  if (args.pattern) {
    const blob = `${args.full_prompt}\n${args.environment_summary}`.toLowerCase();
    const headline = `${args.headline} ${args.cta}`.toLowerCase();
    for (const term of args.pattern.must_avoid) {
      const t = term.toLowerCase();
      if (blob.includes(t) || headline.includes(t)) {
        reasons.push(`pattern[${args.pattern.id}] forbids: "${term}"`);
      }
    }
    // Bonus when pattern must_have terms appear in environment.
    let hits = 0;
    for (const term of args.pattern.must_have) {
      if (blob.includes(term.toLowerCase())) hits++;
    }
    viral_potential += Math.min(20, hits * 5);
  }

  return {
    reasons,
    mobile_safety: Math.max(0, mobile_safety),
    viral_potential: Math.max(0, Math.min(100, viral_potential)),
  };
}

// ── Gemini multimodal scorer ────────────────────────────────────────────────

function bytesToDataUrl(bytes: Uint8Array, mime = "image/png"): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

async function visualScore(args: {
  bytes: Uint8Array;
  headline: string;
  cta: string;
  patternLabel?: string;
  pinModeLabel?: string;
}): Promise<{
  visual_balance: number;
  readability: number;
  pinterest_native: number;
  emotional_resonance: number;
  luxury_aesthetic: number;
  conversion_potential: number;
  mobile_safe_zone: number;
  notes: string;
}> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    // Without the gateway we can't score visually. Return neutral 70s so the
    // pipeline still works in dev, but log it.
    console.warn("[pinterest-quality] LOVABLE_API_KEY missing; returning neutral visual scores");
    return {
      visual_balance: 70,
      readability: 70,
      pinterest_native: 70,
      emotional_resonance: 70,
      luxury_aesthetic: 70,
      conversion_potential: 70,
      mobile_safe_zone: 70,
      notes: "no_api_key",
    };
  }

  const dataUrl = bytesToDataUrl(args.bytes);

  const sys =
    "You rate Pinterest pin renders for a premium US pet brand. " +
    "You are extremely strict — Canva-looking, dropshipping-looking, or floating-product-card images " +
    "must score below 50 on pinterest_native AND luxury_aesthetic. " +
    "Return ONLY the tool call. Each score is 0-100.";

  const tools = [
    {
      type: "function",
      function: {
        name: "rate_pin",
        description: "Rate a Pinterest pin on seven visual axes for premium commerce, including iPhone mobile safe-zone analysis.",
        parameters: {
          type: "object",
          properties: {
            visual_balance: { type: "integer", minimum: 0, maximum: 100 },
            readability: { type: "integer", minimum: 0, maximum: 100 },
            pinterest_native: { type: "integer", minimum: 0, maximum: 100 },
            emotional_resonance: { type: "integer", minimum: 0, maximum: 100 },
            luxury_aesthetic: { type: "integer", minimum: 0, maximum: 100 },
            conversion_potential: { type: "integer", minimum: 0, maximum: 100 },
            mobile_safe_zone: { type: "integer", minimum: 0, maximum: 100 },
            notes: { type: "string", maxLength: 240 },
          },
          required: [
            "visual_balance",
            "readability",
            "pinterest_native",
            "emotional_resonance",
            "luxury_aesthetic",
            "conversion_potential",
            "mobile_safe_zone",
            "notes",
          ],
          additionalProperties: false,
        },
      },
    },
  ];

  const userText =
    `Planned headline (will be added by us, not in the render yet): "${args.headline}". ` +
    `Planned CTA: "${args.cta}". ` +
    (args.patternLabel ? `Target pattern: ${args.patternLabel}. ` : "") +
    (args.pinModeLabel ? `Pin mode (creative archetype): ${args.pinModeLabel}. ` : "") +
    `Rate the rendered image. ` +
    `visual_balance = composition, depth, layering, no awkward floating objects. ` +
    `readability = whether the planned headline could overlay cleanly on the top third without competing with busy detail. ` +
    `pinterest_native = whether this looks like a high-budget editorial Pinterest pin from a premium US pet brand vs a Canva template / dropshipping ad / collage / floating product card. ` +
    `emotional_resonance = how strongly the scene evokes the intended emotion (warmth, calm, joy, transformation) for a US pet parent on a phone. ` +
    `luxury_aesthetic = how premium / quietly upscale the image feels — refined materials, restrained palette, generous negative space. ` +
    `conversion_potential = how likely a US Pinterest user is to click through and consider buying after seeing this image — clear product visibility, trustworthy framing, no spammy cues. ` +
    `mobile_safe_zone = simulate the iPhone Pinterest feed crop (2:3 visible area, top ~12% obscured by status/header chrome, bottom ~14% obscured by save/CTA chrome and overlay). Score 100 if the focal subject and any planned headline/CTA placements would sit cleanly inside the safe rectangle with no risk of being cropped, hidden behind UI, or competing with cluttered detail. Score below 50 if the subject is centered too low/high, the top/bottom strips already contain critical text or product detail, or there is no breathing room for the planned headline. ` +
    `Be strict. Use the rate_pin tool.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: QUALITY_MODEL,
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "rate_pin" } },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.warn("[pinterest-quality] visual scorer", resp.status, t.slice(0, 200));
      return {
        visual_balance: 70, readability: 70, pinterest_native: 70,
        emotional_resonance: 70, luxury_aesthetic: 70, conversion_potential: 70,
        mobile_safe_zone: 70, notes: `scorer_${resp.status}`,
      };
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return {
        visual_balance: 70, readability: 70, pinterest_native: 70,
        emotional_resonance: 70, luxury_aesthetic: 70, conversion_potential: 70,
        mobile_safe_zone: 70, notes: "no_tool_call",
      };
    }
    const parsed = JSON.parse(call.function.arguments || "{}");
    return {
      visual_balance: clamp(parsed.visual_balance, 0, 100),
      readability: clamp(parsed.readability, 0, 100),
      pinterest_native: clamp(parsed.pinterest_native, 0, 100),
      emotional_resonance: clamp(parsed.emotional_resonance, 0, 100),
      luxury_aesthetic: clamp(parsed.luxury_aesthetic, 0, 100),
      conversion_potential: clamp(parsed.conversion_potential, 0, 100),
      mobile_safe_zone: clamp(parsed.mobile_safe_zone, 0, 100),
      notes: String(parsed.notes || ""),
    };
  } catch (e) {
    console.warn("[pinterest-quality] scorer threw", (e as Error).message);
    return {
      visual_balance: 70,
      readability: 70,
      pinterest_native: 70,
      emotional_resonance: 70,
      luxury_aesthetic: 70,
      conversion_potential: 70,
      mobile_safe_zone: 70,
      notes: `error:${(e as Error).message.slice(0, 60)}`,
    };
  }
}

function clamp(n: unknown, lo: number, hi: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

// ── public API ──────────────────────────────────────────────────────────────

export async function scorePin(args: {
  bytes: Uint8Array;
  headline: string;
  cta: string;
  full_prompt: string;
  environment_summary: string;
  dna: StyleDNA;
  pattern?: PinterestPattern | null;
  pin_mode_label?: string;
  pin_mode_key?: PinModeKey;
  /** Optional runtime override (defaults to QUALITY_THRESHOLD = 70). */
  threshold?: number;
}): Promise<QualityResult> {
  const det = deterministicChecks(args);
  const vis = await visualScore({
    bytes: args.bytes,
    headline: args.headline,
    cta: args.cta,
    patternLabel: args.pattern?.label,
    pinModeLabel: args.pin_mode_label,
  });

  // Phase 1 — fuse the deterministic mobile-safety guard with the AI safe-zone
  // analysis. Both must agree the pin survives the iPhone Pinterest crop.
  const mobile_safety_score = Math.round(
    0.55 * det.mobile_safety + 0.45 * vis.mobile_safe_zone,
  );

  // Phase 2 — composite "is this Pinterest-native premium creative?" score.
  // Weighted blend of the visual axes only (no deterministic guards), so it
  // measures pure creative quality independent of headline/cta length.
  const visual_quality_score = Math.round(
    0.22 * vis.pinterest_native +
      0.18 * vis.luxury_aesthetic +
      0.18 * vis.visual_balance +
      0.14 * vis.emotional_resonance +
      0.14 * vis.readability +
      0.14 * vis.conversion_potential,
  );

  // 8-axis weighted total (kept on the 0-100 scale).
  const total =
    0.14 * mobile_safety_score +
    0.13 * vis.visual_balance +
    0.13 * vis.readability +
    0.10 * det.viral_potential +
    0.15 * vis.pinterest_native +
    0.12 * vis.emotional_resonance +
    0.10 * vis.luxury_aesthetic +
    0.13 * vis.conversion_potential;

  // Derived commerce-intent composites (0-100). Cheap, deterministic blends
  // of the 8 axes — no extra AI call. Used by the learning loop to compare
  // creatives apples-to-apples even before live performance data exists.
  const save_probability = Math.round(
    0.35 * vis.emotional_resonance +
      0.30 * vis.pinterest_native +
      0.20 * vis.luxury_aesthetic +
      0.15 * vis.visual_balance,
  );
  const click_probability = Math.round(
    0.40 * vis.readability +
      0.30 * det.mobile_safety +
      0.15 * det.viral_potential +
      0.15 * vis.conversion_potential,
  );
  const commerce_probability = Math.round(
    0.50 * vis.conversion_potential +
      0.25 * vis.pinterest_native +
      0.15 * vis.luxury_aesthetic +
      0.10 * det.mobile_safety,
  );

  const reasons = [...det.reasons];
  if (vis.pinterest_native < 60) reasons.push(`pinterest_native low (${vis.pinterest_native}) — looks templated`);
  if (vis.visual_balance < 55) reasons.push(`visual_balance low (${vis.visual_balance})`);
  if (vis.readability < 55) reasons.push(`readability low (${vis.readability}) — top third too busy`);
  if (vis.emotional_resonance < 55) reasons.push(`emotional_resonance low (${vis.emotional_resonance})`);
  if (vis.conversion_potential < 55) reasons.push(`conversion_potential low (${vis.conversion_potential})`);
  if (vis.luxury_aesthetic < 50) reasons.push(`luxury_aesthetic low (${vis.luxury_aesthetic}) — feels cheap/spam`);
  if (vis.mobile_safe_zone < 55) reasons.push(`mobile_safe_zone low (${vis.mobile_safe_zone}) — focal subject or text risks iPhone crop`);
  if (mobile_safety_score < 55) reasons.push(`mobile_safety_score low (${mobile_safety_score})`);

  const totalRounded = Math.round(total * 100) / 100;
  const quality_band = bandForScore(totalRounded);
  const threshold = typeof args.threshold === "number" ? args.threshold : QUALITY_THRESHOLD;

  return {
    ok: totalRounded >= threshold && reasons.length === 0,
    scores: {
      mobile_safety: Math.round(det.mobile_safety),
      visual_balance: vis.visual_balance,
      readability: vis.readability,
      viral_potential: Math.round(det.viral_potential),
      pinterest_native: vis.pinterest_native,
      emotional_resonance: vis.emotional_resonance,
      luxury_aesthetic: vis.luxury_aesthetic,
      conversion_potential: vis.conversion_potential,
      mobile_safe_zone: vis.mobile_safe_zone,
      mobile_safety_score,
      visual_quality_score,
      save_probability,
      click_probability,
      commerce_probability,
      total: totalRounded,
      quality_band,
    },
    reasons,
    notes: vis.notes,
  };
}