// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Collage Engine
// ─────────────────────────────────────────────────────────────────────────────
// Declarative multi-tile compositions for pin modes that need more than a
// single hero frame (before/after, moodboard, multi-angle, …).
//
// We don't hand-stitch images on the server. Instead we generate a structured
// "composition contract" that the image model (gemini-3-pro-image-preview)
// follows in a single render pass — same canvas, multiple cohesive tiles,
// unified palette, safe-area-aware typography zones.
//
// Pure functions only. No I/O. Imported by pinterest-creative-director.

import type { PinMode, PinModeKey } from "./pinterest-pin-modes.ts";
import type { StyleDNA } from "./pinterest-style-dna.ts";

export type CollageLayoutKey =
  | "split_vertical"      // top/bottom — before/after, then/now
  | "split_horizontal"    // left/right — pair compare
  | "grid_2x2"            // four-tile lifestyle moodboard
  | "stack_3"             // 3 stacked horizontal bands — story arc
  | "moodboard_5"         // editorial 5-tile moodboard, varied scales
  | "multi_angle_3";      // hero + 2 detail tiles

export interface CollageTileSpec {
  /** What this tile shows. Plain English so the image model groks it. */
  shows: string;
  /** Camera framing hint. */
  framing: "wide" | "mid" | "close" | "detail" | "macro";
  /** Optional intra-tile mood note. */
  note?: string;
}

export interface CollageLayout {
  key: CollageLayoutKey;
  label: string;
  /** How tiles are arranged on the 1000×1500 vertical canvas. */
  arrangement: string;
  /** Suggested gutter/border treatment. */
  gutter: "none" | "thin off-white seam" | "soft feathered edges";
  /** Where headline + CTA safe areas live in the collage. */
  safe_area: { headline_top_pct: number; cta_bottom_pct: number };
  /** Number of tiles this layout expects. */
  tile_count: number;
}

export const COLLAGE_LAYOUTS: Record<CollageLayoutKey, CollageLayout> = {
  split_vertical: {
    key: "split_vertical",
    label: "Split Vertical",
    arrangement:
      "two equal stacked tiles, top and bottom; identical camera angle and crop scale; thin off-white horizontal seam between them",
    gutter: "thin off-white seam",
    safe_area: { headline_top_pct: 8, cta_bottom_pct: 10 },
    tile_count: 2,
  },
  split_horizontal: {
    key: "split_horizontal",
    label: "Split Horizontal",
    arrangement:
      "two equal side-by-side tiles within a vertical 9:16 canvas; matching tonality across both; thin off-white vertical seam",
    gutter: "thin off-white seam",
    safe_area: { headline_top_pct: 14, cta_bottom_pct: 12 },
    tile_count: 2,
  },
  grid_2x2: {
    key: "grid_2x2",
    label: "2×2 Grid",
    arrangement:
      "balanced 2×2 grid of four lifestyle tiles, equal weights, off-white seams of equal width; unified palette across all four",
    gutter: "thin off-white seam",
    safe_area: { headline_top_pct: 10, cta_bottom_pct: 10 },
    tile_count: 4,
  },
  stack_3: {
    key: "stack_3",
    label: "3-Stack",
    arrangement:
      "three horizontal bands of equal height stacked vertically; each band tells one beat of the story; soft feathered seams",
    gutter: "soft feathered edges",
    safe_area: { headline_top_pct: 8, cta_bottom_pct: 10 },
    tile_count: 3,
  },
  moodboard_5: {
    key: "moodboard_5",
    label: "Moodboard 5",
    arrangement:
      "editorial moodboard: one hero tile (top, ~55% area), two medium tiles below it side-by-side, two small detail tiles at the bottom; off-white gutters, varied shot scales, unified palette",
    gutter: "thin off-white seam",
    safe_area: { headline_top_pct: 6, cta_bottom_pct: 8 },
    tile_count: 5,
  },
  multi_angle_3: {
    key: "multi_angle_3",
    label: "Multi-Angle",
    arrangement:
      "one large hero tile on top (~65% area), two detail tiles side-by-side below; soft feathered edges; same product shown from three angles",
    gutter: "soft feathered edges",
    safe_area: { headline_top_pct: 10, cta_bottom_pct: 10 },
    tile_count: 3,
  },
};

/** Map a pin mode to its preferred collage layout (or null if not a collage mode). */
export function pickLayoutForMode(mode: PinMode): CollageLayoutKey | null {
  if (!mode.is_collage) return null;
  switch (mode.key as PinModeKey) {
    case "before_after":
      return "split_vertical";
    case "moodboard_collage":
      return "moodboard_5";
    default:
      return "grid_2x2";
  }
}

/** Default tile recipes per (mode × layout). Kept abstract — image model fills detail. */
export function buildTilesForMode(
  mode: PinMode,
  layout: CollageLayout,
  ctx: { subject: string; environment_summary: string },
): CollageTileSpec[] {
  const subj = ctx.subject || "the product";
  const env = ctx.environment_summary || "warm, lived-in pet-friendly home";
  switch (mode.key as PinModeKey) {
    case "before_after":
      return [
        { shows: `quiet 'before' state — modest, believable pain hint in ${env}`, framing: "mid", note: "muted tonality, slightly cooler light" },
        { shows: `calm 'after' state — ${subj} naturally integrated, the room feels resolved`, framing: "mid", note: "warmer, brighter, exactly the same camera angle" },
      ];
    case "moodboard_collage":
      return [
        { shows: `editorial wide of ${env}`, framing: "wide" },
        { shows: `${subj} in use, lifestyle context`, framing: "mid" },
        { shows: "candid pet portrait, soft daylight", framing: "close" },
        { shows: "material/texture detail (fabric, wood grain, fibre)", framing: "macro" },
        { shows: "quiet still life accent — cup, book, plant — same palette", framing: "detail" },
      ];
    default: {
      // Generic collage fallback that respects tile_count.
      const base: CollageTileSpec[] = [
        { shows: `wide of ${env}`, framing: "wide" },
        { shows: `${subj} naturally in scene`, framing: "mid" },
        { shows: "warm candid pet moment", framing: "close" },
        { shows: "texture / material detail", framing: "macro" },
        { shows: "quiet companion still life", framing: "detail" },
      ];
      return base.slice(0, layout.tile_count);
    }
  }
}

/**
 * Build the prompt suffix appended to the image-model brief when the chosen
 * pin mode is a collage. Returns an empty string for single-frame modes so the
 * caller can concatenate unconditionally.
 */
export function buildCollagePromptSuffix(
  mode: PinMode,
  dna: StyleDNA,
  ctx: { subject: string; environment_summary: string },
): string {
  if (!mode.is_collage) return "";
  const layoutKey = pickLayoutForMode(mode);
  if (!layoutKey) return "";
  const layout = COLLAGE_LAYOUTS[layoutKey];
  const tiles = buildTilesForMode(mode, layout, ctx);
  const tileLines = tiles
    .map(
      (t, i) =>
        `  Tile ${i + 1} (${t.framing}): ${t.shows}${t.note ? ` — ${t.note}` : ""}.`,
    )
    .join("\n");
  return (
    `\nCollage composition — ${layout.label}: ${layout.arrangement}. ` +
    `Gutter style: ${layout.gutter}. ` +
    `Reserve a clean band of approximately ${layout.safe_area.headline_top_pct}% at the top and ${layout.safe_area.cta_bottom_pct}% at the bottom (no busy detail there). ` +
    `Render the entire composition as ONE cohesive vertical 9:16 image (1000×1500). Do NOT render any text, captions, prices, watermarks, logos, or graphic overlays. ` +
    `Tiles:\n${tileLines}\n` +
    `All tiles must share a unified palette (${dna.palette}) and consistent ${dna.light}.`
  );
}

export function describeCollageContractForBrief(mode: PinMode): string {
  if (!mode.is_collage) return "";
  const layoutKey = pickLayoutForMode(mode);
  if (!layoutKey) return "";
  const layout = COLLAGE_LAYOUTS[layoutKey];
  return ` Collage layout target: ${layout.label} (${layout.tile_count} tiles).`;
}
