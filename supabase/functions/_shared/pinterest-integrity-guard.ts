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