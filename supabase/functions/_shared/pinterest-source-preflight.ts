// Pinterest Source-Image Preflight — Control 5.
// Deterministic + cached PRE-class checks that MUST pass before any paid
// image-model call. Fails closed with zero paid credit spend.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { sha256Hex } from "./pinterest-qa-cache.ts";
import { isCjSupplierImageUrl } from "./pinterest-credit-guard.ts";

export interface SourcePreflightInput {
  product_id: string;
  product_slug: string;
  product_species?: "dog" | "cat" | "small_pet" | "unknown";
  expected_species?: "dog" | "cat" | "small_pet";
  pdp_hero_url: string;
  variant_key?: string;
}

export interface SourcePreflightResult {
  pass: boolean;
  failed: string[];
  image_hash: string | null;
  pdp_hero_hash: string | null;
  occupancy_pct: number | null;
  identity_confidence: number | null;
  pdp_similarity: number | null;
  paid_calls: number; // MUST be 0
  reason: string | null;
}

const MIN_OCCUPANCY = 0.4;
const MIN_IDENTITY = 0.98;
const MIN_PDP_SIMILARITY = 0.97;

/**
 * Runs deterministic + cheap source-image checks. All expensive vision calls
 * are memoised via pinterest_qa_score_cache — this function itself makes NO
 * paid gateway calls.
 *
 * Returns pass=false with `failed` listing every rule that blocked the
 * candidate. Callers must reject before spending any image-generation credit.
 */
export async function runSourcePreflight(
  sb: SupabaseClient,
  input: SourcePreflightInput,
): Promise<SourcePreflightResult> {
  const failed: string[] = [];
  let image_hash: string | null = null;
  let pdp_hero_hash: string | null = null;
  let occupancy_pct: number | null = null;
  let identity_confidence: number | null = null;
  let pdp_similarity: number | null = null;

  // 1. Reject known CJ/supplier hosts outright (existing kill-switch).
  if (isCjSupplierImageUrl(input.pdp_hero_url)) {
    failed.push("cj_supplier_host");
  }

  // 2. Fetch and decode.
  let bytes: Uint8Array | null = null;
  try {
    const resp = await fetch(input.pdp_hero_url);
    if (!resp.ok) {
      failed.push(`http_${resp.status}`);
    } else {
      bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.byteLength < 2048) failed.push("image_too_small");
      // Sniff magic bytes for jpeg/png/webp.
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng =
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
      const isWebp =
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42;
      if (!isJpeg && !isPng && !isWebp) failed.push("decode_fail");
    }
  } catch (e) {
    failed.push(`fetch_error:${(e as Error).message}`);
  }

  if (bytes) {
    image_hash = await sha256Hex(bytes);
    pdp_hero_hash = image_hash; // same source at preflight time
  }

  // 3. Look up any previously cached vision-based verdict for this hash.
  //    Real vision scorers (identity, occupancy, watermark, collage) populate
  //    the cache; here we ONLY read — never trigger new paid work.
  if (image_hash) {
    const { data } = await sb
      .from("pinterest_qa_score_cache")
      .select("scorer, result, passed")
      .eq("image_hash", image_hash);
    for (const row of data ?? []) {
      const r = (row as { result: Record<string, number> }).result ?? {};
      if (row.scorer === "occupancy") occupancy_pct = Number(r.value ?? 0);
      if (row.scorer === "identity") identity_confidence = Number(r.value ?? 0);
      if (row.scorer === "pdp_similarity") pdp_similarity = Number(r.value ?? 0);
      if (row.scorer === "watermark" && row.passed === false) failed.push("watermark");
      if (row.scorer === "supplier_text" && row.passed === false) failed.push("supplier_text");
      if (row.scorer === "collage" && row.passed === false) failed.push("collage");
      if (row.scorer === "species" && row.passed === false) failed.push("species_mismatch");
    }
  }

  // 4. Enforce thresholds only when we have data — a missing measurement means
  //    the deterministic check has not yet run and the candidate is deferred
  //    (fails closed with `insufficient_signal`) rather than rendered.
  if (occupancy_pct == null) failed.push("occupancy_unknown");
  else if (occupancy_pct < MIN_OCCUPANCY)
    failed.push(`occupancy_below_${Math.round(MIN_OCCUPANCY * 100)}pct`);

  if (identity_confidence == null) failed.push("identity_unknown");
  else if (identity_confidence < MIN_IDENTITY)
    failed.push(`identity_below_${MIN_IDENTITY}`);

  if (pdp_similarity != null && pdp_similarity < MIN_PDP_SIMILARITY)
    failed.push(`pdp_similarity_below_${MIN_PDP_SIMILARITY}`);

  if (
    input.expected_species &&
    input.product_species &&
    input.expected_species !== input.product_species
  ) {
    failed.push("species_mismatch");
  }

  return {
    pass: failed.length === 0,
    failed,
    image_hash,
    pdp_hero_hash,
    occupancy_pct,
    identity_confidence,
    pdp_similarity,
    paid_calls: 0,
    reason: failed[0] ?? null,
  };
}