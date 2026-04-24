/**
 * TikTok Content Posting API — client-side compliance validator.
 *
 * The user picked "skip encoding, only validate + warn" so this module
 * never re-encodes. It inspects an uploaded File via the browser
 * (HTMLVideoElement metadata + file headers) and reports issues against
 * the official Content Posting API limits.
 *
 * Source of truth (verified Apr 2026):
 *   https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
 *   https://developers.tiktok.com/doc/content-sharing-guidelines
 *
 * We deliberately use the *PULL_FROM_URL* limits because that is the
 * transport the existing GetPawsy publish flow uses (see
 * supabase/functions/tiktok-video-test-upload). PULL_FROM_URL has stricter
 * limits than direct multipart upload, so a file that passes here will
 * also pass the FILE_UPLOAD path.
 */

/** Max file size that TikTok accepts via PULL_FROM_URL. */
export const TIKTOK_MAX_BYTES = 287 * 1024 * 1024; // 287 MB

/** Min/max duration in seconds (sandbox + production share these limits). */
export const TIKTOK_MIN_DURATION_S = 3;
export const TIKTOK_MAX_DURATION_S = 10 * 60; // 10 min hard ceiling

/** Pixel limits for short-form video uploads. */
export const TIKTOK_MIN_SHORT_SIDE = 360;
export const TIKTOK_MAX_LONG_SIDE = 1920;

/** Container MIME types accepted by the Content Posting API. */
export const TIKTOK_ACCEPTED_MIME = new Set<string>([
  "video/mp4",
  "video/quicktime", // .mov
  "video/mpeg",
  "video/x-msvideo", // .avi
  "video/webm", // VP9 only — flagged as a warning below
]);

/** Accepted aspect ratios (width:height), with a small tolerance window. */
const TIKTOK_ASPECTS: { name: string; ratio: number }[] = [
  { name: "9:16 (vertical)", ratio: 9 / 16 },
  { name: "1:1 (square)", ratio: 1 },
  { name: "16:9 (landscape)", ratio: 16 / 9 },
];
const ASPECT_TOLERANCE = 0.04; // ~4% wiggle room for off-by-a-pixel encodes

export type ComplianceSeverity = "error" | "warning" | "info";

export type ComplianceIssue = {
  /** Stable id so the UI can dedupe / link to docs. */
  id: string;
  severity: ComplianceSeverity;
  /** One-line headline shown in the badge/list. */
  title: string;
  /** Friendly explanation + recommended fix. */
  detail: string;
};

export type VideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
};

export type ComplianceReport = {
  /** True only when there are zero `error` severity issues. */
  passes: boolean;
  file: {
    name: string;
    sizeBytes: number;
    mimeType: string;
  };
  metadata: VideoMetadata | null;
  issues: ComplianceIssue[];
  /** Pre-derived summary used for analytics / logs. */
  summary: {
    errorCount: number;
    warningCount: number;
  };
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtSeconds(n: number): string {
  if (n < 60) return `${n.toFixed(1)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

/**
 * Read width/height/duration from a video File using a hidden
 * HTMLVideoElement. The browser only loads metadata (not full pixel data),
 * so this is cheap even for >100 MB files.
 */
export function probeVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    // Some browsers refuse to fire `loadedmetadata` until the element is
    // attached, but offscreen attachment with display:none works.
    video.style.position = "fixed";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out probing video metadata (10s)"));
    }, 10_000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const meta: VideoMetadata = {
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(meta);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(
        new Error(
          "Browser could not decode the video — it may use an unsupported codec.",
        ),
      );
    };

    document.body.appendChild(video);
  });
}

/**
 * Pure validator. Given a file + metadata it returns a list of issues.
 * Split out from `validateFile` so unit tests can hit it without DOM.
 */
export function evaluateCompliance(
  file: { name: string; size: number; type: string },
  metadata: VideoMetadata | null,
): ComplianceReport {
  const issues: ComplianceIssue[] = [];

  // ── Container / MIME ────────────────────────────────────────────────
  const lowerName = file.name.toLowerCase();
  const declaredMime = (file.type || "").toLowerCase();
  const looksLikeMp4 = lowerName.endsWith(".mp4");
  const looksLikeMov = lowerName.endsWith(".mov");
  const looksLikeWebm = lowerName.endsWith(".webm");

  if (!declaredMime && !looksLikeMp4 && !looksLikeMov && !looksLikeWebm) {
    issues.push({
      id: "container_unknown",
      severity: "error",
      title: "Unknown container format",
      detail:
        "The browser couldn't detect the container type. TikTok requires MP4 (H.264/H.265) or MOV. Re-export from your editor as MP4 (H.264 + AAC).",
    });
  } else if (declaredMime && !TIKTOK_ACCEPTED_MIME.has(declaredMime)) {
    issues.push({
      id: "container_unsupported",
      severity: "error",
      title: `Unsupported container: ${declaredMime}`,
      detail:
        "TikTok Content Posting API accepts MP4, MOV, MPEG, AVI, or WebM (VP9). Re-export as MP4 with H.264 video + AAC audio for the most compatible result.",
    });
  } else if (declaredMime === "video/webm" || looksLikeWebm) {
    issues.push({
      id: "container_webm_warning",
      severity: "warning",
      title: "WebM may be re-encoded by TikTok",
      detail:
        "WebM (VP9) is accepted but TikTok will transcode it server-side, which can degrade quality. MP4 (H.264) is the safe default.",
    });
  } else if (declaredMime === "video/quicktime" || looksLikeMov) {
    issues.push({
      id: "container_mov_info",
      severity: "info",
      title: "MOV detected",
      detail:
        "MOV is accepted, but TikTok handles MP4 (H.264) most reliably. If you see a 'video_pull_failed' error, re-export as MP4.",
    });
  }

  // ── File size ───────────────────────────────────────────────────────
  if (file.size > TIKTOK_MAX_BYTES) {
    issues.push({
      id: "size_too_large",
      severity: "error",
      title: `File too large (${fmtBytes(file.size)})`,
      detail: `TikTok PULL_FROM_URL limit is ${fmtBytes(
        TIKTOK_MAX_BYTES,
      )}. Re-export at a lower bitrate (target ~6 Mbps) or trim the clip.`,
    });
  } else if (file.size > 100 * 1024 * 1024) {
    issues.push({
      id: "size_large_warning",
      severity: "warning",
      title: `Large file (${fmtBytes(file.size)})`,
      detail:
        "Files >100 MB upload slowly and increase the chance of TikTok timing out the pull. Consider re-exporting at ~6 Mbps.",
    });
  }

  // ── Duration / dimensions need metadata ─────────────────────────────
  if (!metadata) {
    issues.push({
      id: "metadata_unavailable",
      severity: "error",
      title: "Could not read video metadata",
      detail:
        "The browser couldn't decode this file's duration or resolution, which usually means an unsupported codec. Re-export as MP4 (H.264 + AAC).",
    });
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    return {
      passes: errorCount === 0,
      file: { name: file.name, sizeBytes: file.size, mimeType: file.type },
      metadata: null,
      issues,
      summary: { errorCount, warningCount },
    };
  }

  // ── Duration ────────────────────────────────────────────────────────
  if (metadata.durationSeconds <= 0) {
    issues.push({
      id: "duration_invalid",
      severity: "error",
      title: "Invalid duration",
      detail:
        "Browser reported a non-positive duration. The file may be truncated or use an unsupported codec.",
    });
  } else if (metadata.durationSeconds < TIKTOK_MIN_DURATION_S) {
    issues.push({
      id: "duration_too_short",
      severity: "error",
      title: `Too short (${fmtSeconds(metadata.durationSeconds)})`,
      detail: `TikTok requires at least ${TIKTOK_MIN_DURATION_S}s of playable video.`,
    });
  } else if (metadata.durationSeconds > TIKTOK_MAX_DURATION_S) {
    issues.push({
      id: "duration_too_long",
      severity: "error",
      title: `Too long (${fmtSeconds(metadata.durationSeconds)})`,
      detail: `TikTok caps uploads at ${fmtSeconds(
        TIKTOK_MAX_DURATION_S,
      )}. Trim the clip and re-export.`,
    });
  } else if (metadata.durationSeconds > 60) {
    issues.push({
      id: "duration_long_warning",
      severity: "warning",
      title: `Longer than 60s (${fmtSeconds(metadata.durationSeconds)})`,
      detail:
        "Videos over 60s have lower completion rates and weaker For You distribution. Consider trimming.",
    });
  }

  // ── Dimensions / aspect ratio ───────────────────────────────────────
  const { width, height } = metadata;
  if (!width || !height) {
    issues.push({
      id: "resolution_unknown",
      severity: "error",
      title: "Could not detect resolution",
      detail:
        "Browser reported 0×0. This usually means an unsupported codec — re-export as H.264 MP4.",
    });
  } else {
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);

    if (shortSide < TIKTOK_MIN_SHORT_SIDE) {
      issues.push({
        id: "resolution_too_low",
        severity: "error",
        title: `Resolution too low (${width}×${height})`,
        detail: `TikTok requires the short side to be at least ${TIKTOK_MIN_SHORT_SIDE}px. Re-export at 720×1280 or higher.`,
      });
    }
    if (longSide > TIKTOK_MAX_LONG_SIDE) {
      issues.push({
        id: "resolution_too_high",
        severity: "warning",
        title: `Higher than 1080p (${width}×${height})`,
        detail:
          "TikTok will downscale anything above 1080×1920, which costs encode time and can soften the picture. Re-export at 1080×1920.",
      });
    }

    const aspect = width / height;
    const matched = TIKTOK_ASPECTS.find(
      (a) => Math.abs(aspect - a.ratio) <= ASPECT_TOLERANCE,
    );
    if (!matched) {
      issues.push({
        id: "aspect_off",
        severity: "warning",
        title: `Unusual aspect ratio (${aspect.toFixed(2)}:1)`,
        detail:
          "TikTok favors 9:16 (vertical). Other ratios are accepted but get letterboxed in the For You feed.",
      });
    } else if (matched.name.startsWith("16:9")) {
      issues.push({
        id: "aspect_landscape_info",
        severity: "info",
        title: "Landscape video",
        detail:
          "16:9 uploads play full-width but get letterboxed top/bottom in the vertical feed. 9:16 typically gets ~3× the impressions.",
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    passes: errorCount === 0,
    file: { name: file.name, sizeBytes: file.size, mimeType: file.type },
    metadata,
    issues,
    summary: { errorCount, warningCount },
  };
}

/**
 * One-call convenience: probe metadata, then evaluate. Used by the React
 * component. If metadata probing throws, we still return a report (with
 * the error captured as an issue) so the UI can render a single state.
 */
export async function validateFile(file: File): Promise<ComplianceReport> {
  let metadata: VideoMetadata | null = null;
  try {
    metadata = await probeVideoMetadata(file);
  } catch (err) {
    metadata = null;
    const message = err instanceof Error ? err.message : String(err);
    // Surface the probe failure as a structured issue.
    return {
      passes: false,
      file: { name: file.name, sizeBytes: file.size, mimeType: file.type },
      metadata: null,
      issues: [
        {
          id: "metadata_probe_failed",
          severity: "error",
          title: "Couldn't read video metadata",
          detail: `${message}. Re-export the file as MP4 (H.264 + AAC) and try again.`,
        },
      ],
      summary: { errorCount: 1, warningCount: 0 },
    };
  }

  return evaluateCompliance(
    { name: file.name, size: file.size, type: file.type },
    metadata,
  );
}