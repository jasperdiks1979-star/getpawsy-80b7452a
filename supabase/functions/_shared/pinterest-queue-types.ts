// ─────────────────────────────────────────────────────────────────────────────
// Canonical TypeScript contract for the `pinterest_pin_queue` table.
//
// Two distinct shapes:
//   1. PinterestQueueInsert   — ONLY columns that exist on the live table.
//                              These are the ONLY fields ever sent to .insert().
//   2. PinterestPinDraft      — the in-memory shape produced by the batch
//                              generator. Includes optional backdrop_* visual
//                              metadata that does NOT exist in the database.
//                              These fields are stripped by `sanitizeQueueRows`
//                              before insert and only surface in dry-run
//                              previews / API responses.
//
// If you add a backdrop_* (or any other enrichment) field, add it to
// `BackdropMetadata` — never to PinterestQueueInsert.
// ─────────────────────────────────────────────────────────────────────────────

export type PinPriority = "high" | "normal" | "low";
export type PinStatus =
  | "draft"
  | "queued"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed"
  | "skipped";

/**
 * The exact set of columns that exist on `pinterest_pin_queue`.
 * Mirror of `ALLOWED_QUEUE_COLUMNS` in pinterest-viral-batch/index.ts.
 * Anything outside this shape MUST be stripped before .insert().
 */
export interface PinterestQueueInsert {
  product_id: string;
  product_slug: string;
  product_name?: string | null;
  pin_variant: string;
  pin_title: string;
  pin_description?: string | null;
  pin_image_url: string;
  destination_link: string;
  board_name?: string | null;
  hashtags?: string[] | null;
  priority?: PinPriority;
  status: PinStatus;
  scheduled_at: string; // ISO 8601
  hook_group?: string | null;
  category_key?: string | null;
  overlay_text?: string | null;
  /** Optional URL-derived image hash (FNV-1a). */
  image_hash?: string | null;
  /** Optional creative DNA fingerprint (FNV-1a). */
  creative_fingerprint?: string | null;
  /** Optional perceptual hash (64-bit dHash, 16-char hex) of pin_image_url. */
  pin_image_phash?: string | null;
  /** Optional QA reason tags. */
  qa_reasons?: string[] | null;
  /** Optional auto-approval timestamp. */
  approved_at?: string | null;
}

/**
 * Optional Pexels / Cloudinary backdrop enrichment data.
 * NEVER persisted to pinterest_pin_queue — used only for previews and logs.
 * Every field is optional so missing metadata never blocks a batch.
 */
export interface BackdropMetadata {
  backdrop_url?: string | null;
  backdrop_query?: string | null;
  backdrop_avg_color?: string | null;
  backdrop_source?: "pexels" | "cloudinary_fallback" | null;
  backdrop_width?: number | null;
  backdrop_height?: number | null;
  backdrop_photographer?: string | null;
  backdrop_pexels_page?: string | null;
  backdrop_hook_group?: string | null;
  backdrop_style?: "dark" | "subtle" | "accent" | null;
  backdrop_score?: number | null;
  backdrop_variants?: Array<{ style: string; score: number; url: string }> | null;
  uses_lifestyle_backdrop?: boolean;
}

/**
 * In-memory row built by the viral batch generator before insertion.
 * Combines the persisted columns with optional backdrop metadata.
 */
export type PinterestPinDraft = PinterestQueueInsert & BackdropMetadata;

/**
 * Compile-time helper that asserts ANY object passed to .insert() does NOT
 * carry backdrop_* fields — not even as `null`. Use it in call sites that
 * build inserts manually.
 *
 *   const safe: NoBackdropFields<typeof row> = row;
 *
 * Implementation notes:
 *   1. We Omit the backdrop_* keys from `T` first, so any pre-existing
 *      typing (incl. `string | null`) is wiped before we re-stamp them.
 *   2. We then re-add each backdrop_* key as optional `never`, which means
 *      the property may only be `undefined` — assigning `null`, `""`, a
 *      string, or a number all fail to compile.
 */
export type NoBackdropFields<T> = Omit<T, keyof BackdropMetadata> & {
  [K in keyof BackdropMetadata]?: never;
};

/**
 * Runtime counterpart: returns a shallow copy with every backdrop_* key
 * removed, regardless of whether the value was `null`, `undefined`, or set.
 * Use this defensively right before `.insert()` when the source object's
 * type is unknown / dynamic.
 */
export function stripBackdropFields<T extends Record<string, unknown>>(
  obj: T,
): NoBackdropFields<T> {
  const BACKDROP_KEYS: ReadonlyArray<keyof BackdropMetadata> = [
    "backdrop_url",
    "backdrop_query",
    "backdrop_avg_color",
    "backdrop_source",
    "backdrop_width",
    "backdrop_height",
    "backdrop_photographer",
    "backdrop_pexels_page",
    "backdrop_hook_group",
    "backdrop_style",
    "backdrop_score",
    "backdrop_variants",
    "uses_lifestyle_backdrop",
  ];
  const out: Record<string, unknown> = { ...obj };
  for (const k of BACKDROP_KEYS) {
    if (k in out) delete out[k as string];
  }
  return out as NoBackdropFields<T>;
}