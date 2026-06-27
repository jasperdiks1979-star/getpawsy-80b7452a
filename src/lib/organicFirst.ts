/**
 * Organic-First Intelligence Principle — canonical layer classifier.
 *
 * Splits every traffic / revenue row into one of three independent layers:
 *   - LAYER 1 "organic_truth"   : organic Pinterest/Google/Social, SEO,
 *                                 direct, referral, organic email, returning.
 *                                 PRIMARY source of truth for all AI learning.
 *   - LAYER 2 "paid_performance": Pinterest Ads, Google Ads, Meta, TikTok,
 *                                 Shopping, Affiliate, Influencer. Used ONLY
 *                                 to evaluate scaling efficiency (ROAS/CPA).
 *   - LAYER 3 "business_reality": blended (organic + paid). Reporting only.
 *
 * NO AI ranking engine may use Layer 2 volume as a proxy for product quality.
 */

import { resolveCanonicalSource, type SourceInput, type CanonicalSource } from "@/lib/canonicalSource";

export type IntelligenceLayer = "organic_truth" | "paid_performance" | "business_reality";

const PAID_MEDIUMS = new Set([
  "cpc", "ppc", "paid", "paidsearch", "paid_search",
  "paid_social", "display", "retargeting", "remarketing",
  "affiliate", "influencer", "shopping",
]);

const PAID_CAMPAIGN_PREFIXES = ["ads_", "paid_", "promo_", "ppc_", "retarget_", "shop_"];

/** True when the row was acquired via paid advertising spend. */
export function isPaidTraffic(input: SourceInput): boolean {
  const med = (input.utm_medium ?? "").toLowerCase().trim();
  const src = (input.utm_source ?? "").toLowerCase().trim();
  const cmp = (input.utm_campaign ?? "").toLowerCase().trim();
  if (PAID_MEDIUMS.has(med)) return true;
  if (src === "ads" || src === "paid" || src.endsWith("_ads")) return true;
  if (input.gclid || input.fbclid) return true;
  if (input.ttclid && med && med !== "organic_social") return true;
  if (PAID_CAMPAIGN_PREFIXES.some((p) => cmp.startsWith(p))) return true;
  // Pinterest paid is only paid when explicitly tagged — Pinterest organic
  // referral traffic must NEVER be classified as paid.
  if (resolveCanonicalSource(input) === "paid_ads") return true;
  return false;
}

/** True when the row is genuine customer-chosen traffic. */
export function isOrganicTraffic(input: SourceInput): boolean {
  return !isPaidTraffic(input);
}

export function classifyLayer(input: SourceInput): IntelligenceLayer {
  return isPaidTraffic(input) ? "paid_performance" : "organic_truth";
}

/** Canonical source split into (channel, paid?) so dashboards can show both. */
export interface LayeredSource {
  channel: CanonicalSource;
  layer: IntelligenceLayer;
  paid: boolean;
}

export function resolveLayeredSource(input: SourceInput): LayeredSource {
  const channel = resolveCanonicalSource(input);
  const paid = isPaidTraffic(input);
  return { channel, paid, layer: paid ? "paid_performance" : "organic_truth" };
}

/**
 * Hard rule guard — call this from any AI scorer that ranks products,
 * creatives, pins, boards, keywords or landing pages. It rejects features
 * derived purely from paid volume so the True Product Score stays clean.
 */
export const ORGANIC_FIRST_FORBIDDEN_FEATURES = [
  "paid_visitors",
  "paid_impressions",
  "ad_spend",
  "campaign_budget",
  "paid_clicks",
  "paid_sessions",
  "paid_revenue", // allowed only for ROAS calc inside Layer 2
] as const;

export function assertOrganicFirst(featureKeys: string[]): void {
  const leaks = featureKeys.filter((k) =>
    (ORGANIC_FIRST_FORBIDDEN_FEATURES as readonly string[]).includes(k),
  );
  if (leaks.length > 0) {
    throw new Error(
      `Organic-First violation: AI scorer must not consume paid features (${leaks.join(", ")}). ` +
        `Move these to Layer 2 (paid_performance) and use only for ROAS/CPA evaluation.`,
    );
  }
}