/**
 * Shared helpers for the cinematic-ad-render-webhook callback path.
 *
 * Extracted so they can be unit-tested independently of Deno.serve().
 * The webhook re-exports these and uses them on both the original render
 * callback and the auto-trim callback so that:
 *
 *   1. NULL / undefined fields from the trim callback never wipe richer
 *      metadata captured on the first render (motion_score, file_size,
 *      width/height, black_bars, thumbnail_url, scene_plan, ...).
 *   2. output_mp4_url and output_thumbnail_url never contain accidental
 *      double slashes (`…supabase.co//storage/…`) that break iPhone
 *      Safari inline playback.
 */

/**
 * Strip accidental double slashes in path portion of a storage URL.
 * Keep `://` intact, collapse any other `//` to `/`.
 */
export function stripDoubleSlash(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
    return u.toString();
  } catch {
    return url.replace(/([^:])\/{2,}/g, "$1/");
  }
}

/**
 * Merge worker-callback fields into the DB patch without overwriting
 * existing values with NULL/undefined. The mapping value may return either
 * a coerced primitive (which is written under the original body key) or a
 * `[columnName, value]` tuple to rename the target column.
 */
export function mergePreserve(
  patch: Record<string, unknown>,
  body: Record<string, any>,
  mapping: Record<string, (v: any) => unknown>,
): void {
  for (const [bodyKey, transform] of Object.entries(mapping)) {
    const v = body?.[bodyKey];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    const out = transform(v);
    if (out === undefined || out === null) continue;
    if (Array.isArray(out) && out.length === 2 && typeof out[0] === "string") {
      patch[out[0] as string] = (out as [string, unknown])[1];
    } else {
      patch[bodyKey] = out;
    }
  }
}

/**
 * Canonical field map: worker payload key -> coercion + target column.
 * Used by both the original render callback and the auto-trim callback so
 * the trim path never overwrites richer metadata captured on the first
 * call. All URL fields are passed through stripDoubleSlash().
 */
export const FIELD_MAP: Record<string, (v: any) => unknown> = {
  mp4_url:       (v) => ["output_mp4_url", stripDoubleSlash(String(v))],
  duration:      (v) => ["output_duration_seconds", Number(v)],
  file_size:     (v) => ["output_file_size_bytes", Number(v)],
  width:         (v) => ["output_width", Number(v)],
  height:        (v) => ["output_height", Number(v)],
  motion_score:  (v) => ["motion_score", Number(v)],
  motion_quality_score: (v) =>
    ["motion_quality_score", Math.max(0, Math.min(100, Math.round(Number(v))))],
  motion_quality_breakdown: (v) =>
    typeof v === "object" && !Array.isArray(v) ? ["motion_quality_breakdown", v] : undefined,
  black_bars:    (v) => ["output_black_bars", Boolean(v)],
  thumbnail_url: (v) => ["output_thumbnail_url", stripDoubleSlash(String(v))],
  scene_plan:    (v) => Array.isArray(v) ? ["scene_plan", v] : undefined,
};