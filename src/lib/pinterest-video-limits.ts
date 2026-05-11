// Client-side mirror of supabase/functions/_shared/pinterest-video-limits.ts.
// Keep the constants in sync with the edge function so users never get a
// confusing mismatch between client validation and server rejection.
export const MIN_VIDEO_BYTES = 1_000_000; // 1 MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/x-m4v"];
export const ALLOWED_VIDEO_EXT = [".mp4", ".mov", ".m4v"];

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export type VideoValidation =
  | { ok: true }
  | { ok: false; code: "EMPTY" | "TOO_SMALL" | "TOO_LARGE" | "BAD_TYPE"; title: string; message: string };

export function validateVideoFile(file: File): VideoValidation {
  const lower = file.name.toLowerCase();
  const extOk = ALLOWED_VIDEO_EXT.some((e) => lower.endsWith(e));
  const mimeOk = !file.type || ALLOWED_VIDEO_MIME.includes(file.type);
  if (!extOk || !mimeOk) {
    return {
      ok: false,
      code: "BAD_TYPE",
      title: "Unsupported file type",
      message: `“${file.name}” isn’t a supported video. Please upload an ${ALLOWED_VIDEO_EXT.join(", ")} file.`,
    };
  }
  if (!file.size) {
    return { ok: false, code: "EMPTY", title: "Empty file", message: `“${file.name}” appears to be empty.` };
  }
  if (file.size < MIN_VIDEO_BYTES) {
    return {
      ok: false,
      code: "TOO_SMALL",
      title: "File too small",
      message: `“${file.name}” is only ${formatBytes(file.size)}. Minimum size is ${formatBytes(MIN_VIDEO_BYTES)}.`,
    };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      title: "File too large",
      message: `“${file.name}” is ${formatBytes(file.size)}. Pinterest uploads are capped at ${formatBytes(MAX_VIDEO_BYTES)} — please compress and try again.`,
    };
  }
  return { ok: true };
}