/**
 * Visitor World Map — source-based marker colors + group filter chips.
 *
 * UI-only helper. Reads existing signals (utm_source / utm_medium /
 * utm_campaign / referrer / canonical source / is_internal) and returns a
 * marker color, group slug and human label. It does NOT change any
 * classification logic — it derives a *presentation* group on top of the
 * canonical resolver so the World Map can render distinct source colors,
 * a legend and per-group filter chips.
 *
 * Palette follows the mission spec:
 *   - Google organic     → green
 *   - Pinterest organic  → red
 *   - TikTok             → purple
 *   - Meta (FB/IG)       → blue
 *   - Paid ads           → amber/orange
 *   - Direct             → gray
 *   - Referral / other   → teal
 *   - Unknown            → light gray
 *   - Internal / test    → white (dashed outline in DOM)
 *   - Bot / synthetic    → hidden by default
 */

import {
  resolveCanonicalSource,
  type CanonicalSource,
  type SourceInput,
} from "@/lib/canonicalSource";

export type MarkerGroup =
  | "google"
  | "pinterest"
  | "tiktok"
  | "meta"
  | "paid"
  | "direct"
  | "referral"
  | "organic"
  | "email"
  | "unknown"
  | "internal"
  | "bot";

export const MARKER_SOURCE_COLORS: Record<MarkerGroup, string> = {
  google:    "#22c55e", // green — organic default
  pinterest: "#E60023", // red
  tiktok:    "#8B5CF6", // purple
  meta:      "#1877F2", // blue
  paid:      "#F59E0B", // amber / orange
  direct:    "#6B7280", // gray
  referral:  "#14B8A6", // teal
  organic:   "#14B8A6", // teal (generic organic)
  email:     "#0EA5E9", // sky
  unknown:   "#9CA3AF", // light gray
  internal:  "#F8FAFC", // white
  bot:       "#111827", // dark (hidden by default)
};

export const MARKER_GROUP_LABELS: Record<MarkerGroup, string> = {
  google:    "Google",
  pinterest: "Pinterest",
  tiktok:    "TikTok",
  meta:      "Meta (FB / IG)",
  paid:      "Paid ads",
  direct:    "Direct",
  referral:  "Referral",
  organic:   "Other organic",
  email:     "Email",
  unknown:   "Unknown",
  internal:  "Internal / test",
  bot:       "Bot / synthetic",
};

export interface MarkerVisualInput extends SourceInput {
  is_internal?: boolean | null;
  is_bot?: boolean | null;
}

export interface MarkerVisual {
  canonical: CanonicalSource;
  group: MarkerGroup;
  color: string;
  label: string;
  isPaid: boolean;
  isOrganic: boolean;
  isInternal: boolean;
  isBot: boolean;
}

const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid_search",
  "paid_social",
  "display",
  "retargeting",
]);

function looksPaid(input: SourceInput): boolean {
  const med = (input.utm_medium ?? "").toLowerCase().trim();
  const src = (input.utm_source ?? "").toLowerCase().trim();
  const cmp = (input.utm_campaign ?? "").toLowerCase().trim();
  if (PAID_MEDIUMS.has(med)) return true;
  if (src === "ads" || src === "paid") return true;
  if (cmp.startsWith("ads_") || cmp.startsWith("paid_")) return true;
  if (input.gclid || input.fbclid || input.ttclid) return true;
  return false;
}

/** Resolve the presentation group for a visitor row. */
export function resolveMarkerVisual(input: MarkerVisualInput): MarkerVisual {
  const isBot = !!input.is_bot;
  const isInternal = !!input.is_internal;
  const canonical = resolveCanonicalSource(input);
  const paid = looksPaid(input) || canonical === "paid_ads";

  let group: MarkerGroup;
  if (isBot) group = "bot";
  else if (isInternal) group = "internal";
  else {
    switch (canonical) {
      case "google":
        group = paid ? "paid" : "google";
        break;
      case "pinterest":
        group = paid ? "paid" : "pinterest";
        break;
      case "tiktok":
        // TikTok organic AND paid both use purple per mission spec.
        group = "tiktok";
        break;
      case "facebook":
      case "instagram":
        group = paid ? "paid" : "meta";
        break;
      case "paid_ads":
        group = "paid";
        break;
      case "email":
        group = "email";
        break;
      case "direct":
        group = paid ? "paid" : "direct";
        break;
      case "referral":
        group = "referral";
        break;
      case "organic":
        group = "organic";
        break;
      case "reddit":
      case "x":
      case "linkedin":
      case "youtube":
        // Treat other social platforms as referral for the color legend
        // (mission taxonomy doesn't call out a color for them separately).
        group = paid ? "paid" : "referral";
        break;
      case "unknown":
      default:
        group = "unknown";
    }
  }

  return {
    canonical,
    group,
    color: MARKER_SOURCE_COLORS[group],
    label: MARKER_GROUP_LABELS[group],
    isPaid: paid,
    isOrganic: !paid && !isBot && !isInternal && canonical !== "unknown" && canonical !== "direct",
    isInternal,
    isBot,
  };
}

/** Ordered chips shown in the Visitor World Map legend + filter row. */
export type MarkerGroupFilter = "all" | "organic" | "paid" | MarkerGroup;

export interface MarkerGroupChip {
  key: MarkerGroupFilter;
  label: string;
  color?: string;
  /** True if this chip is a "meta" filter (organic/paid) that spans groups. */
  aggregate?: boolean;
}

export const MARKER_GROUP_CHIPS: MarkerGroupChip[] = [
  { key: "all",       label: "All" },
  { key: "organic",   label: "Organic",   color: MARKER_SOURCE_COLORS.organic,   aggregate: true },
  { key: "paid",      label: "Paid",      color: MARKER_SOURCE_COLORS.paid,      aggregate: true },
  { key: "google",    label: "Google",    color: MARKER_SOURCE_COLORS.google },
  { key: "pinterest", label: "Pinterest", color: MARKER_SOURCE_COLORS.pinterest },
  { key: "tiktok",    label: "TikTok",    color: MARKER_SOURCE_COLORS.tiktok },
  { key: "meta",      label: "Meta",      color: MARKER_SOURCE_COLORS.meta },
  { key: "direct",    label: "Direct",    color: MARKER_SOURCE_COLORS.direct },
  { key: "referral",  label: "Referral",  color: MARKER_SOURCE_COLORS.referral },
  { key: "unknown",   label: "Unknown",   color: MARKER_SOURCE_COLORS.unknown },
];

/** Whether a resolved visual matches the given chip filter. */
export function markerMatchesGroupFilter(
  visual: Pick<MarkerVisual, "group" | "isPaid" | "isOrganic">,
  filter: MarkerGroupFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "organic") return visual.isOrganic;
  if (filter === "paid") return visual.isPaid;
  return visual.group === filter;
}

/** Convenience for the legend component. */
export const MARKER_LEGEND_ITEMS: Array<{ group: MarkerGroup; label: string; color: string; note?: string }> = [
  { group: "google",    label: "Google organic",   color: MARKER_SOURCE_COLORS.google },
  { group: "pinterest", label: "Pinterest organic",color: MARKER_SOURCE_COLORS.pinterest },
  { group: "tiktok",    label: "TikTok",           color: MARKER_SOURCE_COLORS.tiktok,   note: "organic + paid" },
  { group: "meta",      label: "Meta (FB / IG)",   color: MARKER_SOURCE_COLORS.meta },
  { group: "paid",      label: "Paid ads",         color: MARKER_SOURCE_COLORS.paid },
  { group: "direct",    label: "Direct",           color: MARKER_SOURCE_COLORS.direct },
  { group: "referral",  label: "Referral / other", color: MARKER_SOURCE_COLORS.referral },
  { group: "unknown",   label: "Unknown",          color: MARKER_SOURCE_COLORS.unknown },
  { group: "internal",  label: "Internal / test",  color: MARKER_SOURCE_COLORS.internal, note: "dashed, hidden by default" },
  { group: "bot",       label: "Bot / synthetic",  color: MARKER_SOURCE_COLORS.bot,      note: "hidden by default" },
];