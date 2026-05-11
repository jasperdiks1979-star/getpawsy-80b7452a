// Shared Pinterest video upload size limits.
// Pinterest API caps Video Pins at 2 GB, but in practice large files time out
// during edge upload, so we enforce a stricter 500 MB ceiling and reject tiny
// or empty files that almost always indicate corruption.
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

export type SizeCheck = { ok: true } | { ok: false; code: "TOO_SMALL" | "TOO_LARGE" | "EMPTY"; message: string };

export function checkVideoSize(bytes: number): SizeCheck {
  if (!bytes || bytes <= 0) return { ok: false, code: "EMPTY", message: "File is empty or unreadable." };
  if (bytes < MIN_VIDEO_BYTES) {
    return { ok: false, code: "TOO_SMALL", message: `Video is only ${formatBytes(bytes)} — minimum is ${formatBytes(MIN_VIDEO_BYTES)}.` };
  }
  if (bytes > MAX_VIDEO_BYTES) {
    return { ok: false, code: "TOO_LARGE", message: `Video is ${formatBytes(bytes)} — maximum is ${formatBytes(MAX_VIDEO_BYTES)}. Please compress before uploading.` };
  }
  return { ok: true };
}

export function checkVideoMime(mime: string | undefined, filename: string): SizeCheck {
  const lower = (filename || "").toLowerCase();
  const extOk = ALLOWED_VIDEO_EXT.some((e) => lower.endsWith(e));
  const mimeOk = !mime || ALLOWED_VIDEO_MIME.includes(mime);
  if (extOk && mimeOk) return { ok: true };
  return { ok: false, code: "TOO_SMALL", message: `Unsupported file type. Allowed: ${ALLOWED_VIDEO_EXT.join(", ")}.` };
}