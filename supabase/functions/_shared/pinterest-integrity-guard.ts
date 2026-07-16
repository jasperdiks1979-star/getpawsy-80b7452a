// Pinterest Integrity Guard
// Permanent, deterministic gate that every new pin draft MUST pass before
// it is inserted into pinterest_pin_queue. Confidence < 0.95 → blocked.
//
// Checks:
//   1. Destination URL is /products/{slug} with utm + the product exists,
//      is_active=true, and slug matches.
//   2. Pin image URL is present and HTTPS.
//   3. Species coherence — product.primary_species must NOT contradict the
//      niche / category_key the renderer chose (dog niche ↔ cat product, etc).
//   4. Title coherence — pin_title must not contradict product.primary_species
//      (e.g. "Cat" pin title for a dog product, or vice versa).
//   5. No unresolved critical/high media-audit finding newer than the last
//      product correction (products.updated_at).
//
// Returns a structured verdict so callers can log + persist the reason.

import { evaluateProductRelevance, preEnabled } from "./pre-product-relevance.ts";
import {
  cachedVisualIdentity,
  evaluateVisualIdentity,
  persistVisualIdentity,
  vpiEnabled,
} from "./visual-product-identity.ts";
import { readVisualTruth } from "./product-identity-graph.ts";
import { verifyProductVariant } from "./product-variant-guard.ts";

export type IntegrityVerdict = {
  passed: boolean;
  confidence: number; // 0..1
  checks: Record<string, { ok: boolean; reason?: string }>;
  blocking_reasons: string[];
};

export type IntegrityInput = {
  product_id: string;
  product_slug: string;
  product_name: string;
  pin_title: string;
  pin_description: string;
  pin_image_url: string | null | undefined;
  destination_link: string;
  niche_or_category?: string | null;
  // Optional: candidate source image (e.g. photo_lock_source / cutout base)
  // evaluated by the Product Variant Guard BEFORE render. When set and the
  // guard fails, the whole integrity check is short-circuited with the
  // concrete `product_variant_mismatch:<kind>` reason.
  source_image_url?: string | null;
  source_image_label?: string | null;
};

const CAT_TOKENS = /\b(cat|kitten|feline|kitty|litter|catnip|scratch|cat tree)\b/i;
const DOG_TOKENS = /\b(dog|puppy|canine|leash|harness|bark|chew)\b/i;

function speciesFromText(text: string): "cat" | "dog" | null {
  const cat = CAT_TOKENS.test(text);
  const dog = DOG_TOKENS.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return null;
}

export async function verifyPinIntegrity(
  supabase: any,
  input: IntegrityInput,
): Promise<IntegrityVerdict> {
  const checks: IntegrityVerdict["checks"] = {};
  const reasons: string[] = [];

  // 1. Destination URL shape + product existence
  const expectedPath = `/products/${input.product_slug}`;
  const urlOk =
    typeof input.destination_link === "string" &&
    input.destination_link.includes(expectedPath) &&
    input.destination_link.includes("utm_source=pinterest");
  checks.destination_url = urlOk
    ? { ok: true }
    : { ok: false, reason: `expected ${expectedPath} with utm_source=pinterest` };
  if (!urlOk) reasons.push("destination_url_invalid");

  // 2. Image URL present + HTTPS
  const imgOk =
    typeof input.pin_image_url === "string" &&
    /^https:\/\//i.test(input.pin_image_url);
  checks.image_url = imgOk
    ? { ok: true }
    : { ok: false, reason: "missing or non-https pin_image_url" };
  if (!imgOk) reasons.push("pin_image_missing");

  // 3. Product lookup
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, slug, name, primary_species, is_active, image_url, updated_at")
    .eq("id", input.product_id)
    .maybeSingle();

  if (pErr || !product) {
    checks.product_exists = { ok: false, reason: pErr?.message ?? "not found" };
    reasons.push("product_not_found");
    return finalize(checks, reasons);
  }
  checks.product_exists = { ok: true };

  // 0. Product Variant Guard — earliest visual identity check on the
  //    candidate SOURCE image (not the final pin). Catches cases where the
  //    catalogue photo or photo_lock_source depicts a different variant/
  //    material than the PDP hero (e.g. plush vs. plastic rolling ball).
  //    Runs only when a source image is supplied by the caller.
  if (input.source_image_url && /^https:\/\//i.test(input.source_image_url)) {
    try {
      const pvg = await verifyProductVariant(supabase, {
        product_id: input.product_id,
        product_slug: input.product_slug,
        product_name: input.product_name,
        source_image_url: input.source_image_url,
        context_label: input.source_image_label ?? "source_image",
        destination_link: input.destination_link,
      });
      if (pvg.skipped) {
        checks.product_variant = { ok: true, reason: `PVG skipped: ${pvg.skip_reason ?? "n/a"}` };
      } else if (!pvg.passed) {
        checks.product_variant = {
          ok: false,
          reason: `PVG ${pvg.identity_score}/100 — ${pvg.detail ?? pvg.reason ?? "variant mismatch"}`,
        };
        reasons.push(pvg.reason ?? "product_variant_mismatch");
        // Short-circuit: no point running PRE/VPI on the final pin — the
        // source is already the wrong product variant.
        return finalize(checks, reasons);
      } else {
        checks.product_variant = {
          ok: true,
          reason: `PVG ${pvg.identity_score}/100${pvg.cached ? " (cached)" : ""}`,
        };
      }
    } catch (err) {
      checks.product_variant = { ok: false, reason: `PVG error: ${(err as Error).message}` };
      reasons.push("product_variant_error");
      return finalize(checks, reasons);
    }
  }


  if (!product.is_active) {
    checks.product_active = { ok: false, reason: "is_active=false" };
    reasons.push("product_inactive");
  } else {
    checks.product_active = { ok: true };
  }

  if (product.slug !== input.product_slug) {
    checks.slug_match = {
      ok: false,
      reason: `db slug=${product.slug} vs pin slug=${input.product_slug}`,
    };
    reasons.push("slug_mismatch");
  } else {
    checks.slug_match = { ok: true };
  }

  // 4. Species coherence — niche/category and title
  const productSpecies = (product.primary_species ?? "").toLowerCase();
  const nicheText = `${input.niche_or_category ?? ""}`;
  const nicheSpecies = speciesFromText(nicheText);
  const titleSpecies = speciesFromText(input.pin_title);

  // "both" / "multi" / "" products are species-agnostic — never block on species.
  const productIsSingleSpecies =
    productSpecies === "cat" || productSpecies === "dog";

  if (productIsSingleSpecies && nicheSpecies && nicheSpecies !== productSpecies) {
    checks.species_niche = {
      ok: false,
      reason: `niche=${nicheSpecies} but product=${productSpecies}`,
    };
    reasons.push("species_niche_mismatch");
  } else {
    checks.species_niche = { ok: true };
  }

  if (productIsSingleSpecies && titleSpecies && titleSpecies !== productSpecies) {
    checks.species_title = {
      ok: false,
      reason: `pin title=${titleSpecies} but product=${productSpecies}`,
    };
    reasons.push("species_title_mismatch");
  } else {
    checks.species_title = { ok: true };
  }

  // 5. Unresolved critical/high media-audit finding
  // Stale audits (created before the product was last corrected) are ignored.
  const { data: audit } = await supabase
    .from("product_media_audit")
    .select("severity, matches_title, created_at, confidence")
    .eq("product_id", input.product_id)
    .in("severity", ["critical", "high"])
    .eq("matches_title", false)
    .order("created_at", { ascending: false })
    .limit(1);

  const fresh =
    Array.isArray(audit) &&
    audit[0] &&
    new Date(audit[0].created_at) > new Date(product.updated_at);

  if (fresh) {
    checks.media_audit = {
      ok: false,
      reason: `unresolved ${audit![0].severity} finding`,
    };
    reasons.push("media_audit_unresolved");
  } else {
    checks.media_audit = { ok: true };
  }

  // 6. Media Integrity Guard — block ONLY if pin_image_url is BLOCKED.
  //    REVIEW is allowed (CLEAN > REVIEW priority enforced upstream).
  if (imgOk && input.pin_image_url) {
    const { data: mi } = await supabase
      .from("media_audit")
      .select("status, issue_type, confidence")
      .eq("product_id", input.product_id)
      .eq("image_url", input.pin_image_url)
      .maybeSingle();
    if (mi && mi.status === "BLOCKED") {
      checks.media_integrity = {
        ok: false,
        reason: `image ${mi.status}: ${mi.issue_type} (${mi.confidence})`,
      };
      reasons.push("media_integrity_contaminated");
    } else {
      checks.media_integrity = { ok: true };
    }
  }

  // 7. Genesis V2 — Product Relevance Engine (PRE). Vision-based gate that
  //    rejects pins whose creative does not actually match the product.
  //    Hard rule: NO pin publishes if PRE fails. Cannot be skipped.
  if (imgOk && input.pin_image_url && (await preEnabled(supabase))) {
    // Genesis V9.5 (M4) — PRE freshness cache.
    // If we already have a PRE evaluation for the SAME product + SAME
    // pin_image_url within the last 24h with overall_score >= 95, reuse it.
    // Threshold unchanged. Cost avoided, and prior-passed pins are no longer
    // re-rejected by transient vision drift.
    try {
      const freshCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: cached } = await supabase
        .from("pre_evaluations")
        .select("overall_score, passed, blocking_reasons, created_at")
        .eq("product_id", input.product_id)
        .eq("pin_image_url", input.pin_image_url)
        .gte("created_at", freshCutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached && cached.passed === true && Number(cached.overall_score) >= 95) {
        checks.product_relevance = { ok: true, reason: `PRE cached ${cached.overall_score}/100` };
        return finalize(checks, reasons);
      }
    } catch (_) { /* fall through to live PRE */ }
    try {
      const pre = await evaluateProductRelevance(supabase, {
        product_id: input.product_id,
        product_slug: input.product_slug,
        product_name: input.product_name,
        product_description: (product as any).description ?? null,
        product_image_url: product.image_url ?? null,
        product_primary_species: product.primary_species ?? null,
        product_category: input.niche_or_category ?? null,
        pin_title: input.pin_title,
        pin_description: input.pin_description,
        pin_image_url: input.pin_image_url,
        destination_link: input.destination_link,
      });
      if (!pre.passed) {
        checks.product_relevance = {
          ok: false,
          reason: `PRE ${pre.overall_score}/100: ${pre.blocking_reasons.slice(0, 3).join(", ")}`,
        };
        reasons.push("pre_relevance_failed");
      } else {
        checks.product_relevance = { ok: true };
      }
    } catch (err) {
      checks.product_relevance = {
        ok: false,
        reason: `PRE error: ${(err as Error).message}`,
      };
      reasons.push("pre_error");
    }
  }

  // 8. Phase 19 — Visual Product Identity (VPI). Same-product certification.
  //    Uses cached score when fresh; otherwise runs Gemini vision comparison
  //    against the full product reference set. Fail-closed when enabled.
  if (imgOk && input.pin_image_url) {
    try {
      const vpiCfg = await vpiEnabled(supabase);
      if (vpiCfg.enabled) {
        const cached = await cachedVisualIdentity(supabase, input.product_id, input.pin_image_url);
        let scoreOk = false;
        let score = 0;
        if (cached && cached.passed && cached.identity_score >= vpiCfg.minScore) {
          scoreOk = true;
          score = cached.identity_score;
          checks.visual_identity = { ok: true, reason: `VPI cached ${score}/100` };
        } else {
          const vpi = await evaluateVisualIdentity(supabase, {
            product_id: input.product_id,
            product_slug: input.product_slug,
            product_name: input.product_name,
            pin_image_url: input.pin_image_url,
            pin_title: input.pin_title,
            pin_description: input.pin_description,
            destination_link: input.destination_link,
            source: "guard_live",
          });
          await persistVisualIdentity(supabase, {
            product_id: input.product_id,
            product_slug: input.product_slug,
            product_name: input.product_name,
            pin_image_url: input.pin_image_url,
            pin_title: input.pin_title,
            pin_description: input.pin_description,
            destination_link: input.destination_link,
            source: "guard_live",
          }, vpi, null);
          score = vpi.identity_score;
          scoreOk = vpi.passed && score >= vpiCfg.minScore;
          checks.visual_identity = scoreOk
            ? { ok: true, reason: `VPI ${score}/100` }
            : { ok: false, reason: `VPI ${score}/100 (${vpi.wrong_product_kind}): ${vpi.differences.slice(0, 2).join("; ")}` };
        }
        if (!scoreOk && vpiCfg.blockPublish) reasons.push("visual_identity_failed");
      }
    } catch (err) {
      checks.visual_identity = { ok: false, reason: `VPI error: ${(err as Error).message}` };
      // Fail-closed only when block_publish is on (default true) — the error path is treated as a fail.
      reasons.push("visual_identity_error");
    }
  }

  // 9. Phase 20 — Product Identity Graph (Visual Truth API).
  //    Pure DB read; no AI credits. Fails closed when a certification exists
  //    but is not passing. When no certification exists yet, we skip (the
  //    PIG sweep will backfill) — VPI above already enforces same-product.
  if (imgOk && input.pin_image_url) {
    try {
      const truth = await readVisualTruth(supabase, input.product_id, input.pin_image_url);
      if (truth.reason === "pig_disabled") {
        // engine off — no gating
      } else if (truth.reason === "node_not_found" || truth.reason === "no_certification") {
        checks.visual_truth = { ok: true, reason: `PIG pending (${truth.reason})` };
      } else if (!truth.certified) {
        checks.visual_truth = { ok: false, reason: `PIG uncertified ${truth.identity_score}/100 (${truth.match_kind})` };
        reasons.push("visual_truth_failed");
      } else {
        checks.visual_truth = { ok: true, reason: `PIG certified ${truth.identity_score}/100 (${truth.match_kind})` };
      }
    } catch (err) {
      checks.visual_truth = { ok: false, reason: `PIG error: ${(err as Error).message}` };
      reasons.push("visual_truth_error");
    }
  }

  return finalize(checks, reasons);
}

function finalize(
  checks: IntegrityVerdict["checks"],
  reasons: string[],
): IntegrityVerdict {
  const total = Object.keys(checks).length;
  const passedCount = Object.values(checks).filter((c) => c.ok).length;
  const confidence = total === 0 ? 0 : passedCount / total;
  // Hard rule: any blocking reason OR confidence < 0.95 → fail.
  const passed = reasons.length === 0 && confidence >= 0.95;
  return { passed, confidence, checks, blocking_reasons: reasons };
}