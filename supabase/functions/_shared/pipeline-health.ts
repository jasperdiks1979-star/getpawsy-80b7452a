// Self-Healing Pinterest Engine — shared helpers
// Deno-safe, no esm.sh.

export type FailureSource =
  | "pinterest_api"
  | "render"
  | "inventory"
  | "cj"
  | "supabase"
  | "storage"
  | "voice"
  | "media"
  | "other";

export interface HealthInputs {
  pinsPublished24h: number;
  targetPinsPerDay: number;
  minPinsPerDay: number;
  pendingVideos: number;
  minPendingVideos: number;
  pendingPins: number;
  minPendingPins: number;
  failed24h: number;
  recovered24h: number;
  lastVideoAt: string | null;
  lastPinAt: string | null;
  deadMinutes: number;
}

export interface HealthResult {
  score: number;
  reasons: Array<{ key: string; impact: number; detail?: string }>;
  mode: "normal" | "recovery" | "emergency" | "light_render";
}

const ageMin = (iso: string | null) =>
  iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000) : Infinity;

export function computeHealthScore(i: HealthInputs, recoveryThreshold = 80, emergencyThreshold = 60): HealthResult {
  const reasons: HealthResult["reasons"] = [];
  let score = 100;

  // Throughput vs target (40)
  const throughputRatio = Math.min(1, i.pinsPublished24h / Math.max(1, i.targetPinsPerDay));
  const throughputPenalty = Math.round((1 - throughputRatio) * 40);
  if (throughputPenalty > 0) reasons.push({ key: "throughput_below_target", impact: -throughputPenalty, detail: `${i.pinsPublished24h}/${i.targetPinsPerDay}` });
  score -= throughputPenalty;

  // Pending depth (15) — penalize when below floor
  let depthPenalty = 0;
  if (i.pendingVideos < i.minPendingVideos) depthPenalty += Math.round((1 - i.pendingVideos / Math.max(1, i.minPendingVideos)) * 7);
  if (i.pendingPins < i.minPendingPins) depthPenalty += Math.round((1 - i.pendingPins / Math.max(1, i.minPendingPins)) * 8);
  if (depthPenalty > 0) reasons.push({ key: "queue_depth_low", impact: -depthPenalty, detail: `videos=${i.pendingVideos}/${i.minPendingVideos} pins=${i.pendingPins}/${i.minPendingPins}` });
  score -= depthPenalty;

  // Failure ratio (15)
  const totalAttempts = i.failed24h + i.recovered24h + Math.max(1, i.pinsPublished24h);
  const failureRatio = i.failed24h / totalAttempts;
  const failPenalty = Math.min(15, Math.round(failureRatio * 60));
  if (failPenalty > 0) reasons.push({ key: "failure_rate", impact: -failPenalty, detail: `${i.failed24h} failed` });
  score -= failPenalty;

  // Dead pipeline (15)
  const lastVideoAge = ageMin(i.lastVideoAt);
  const lastPinAge = ageMin(i.lastPinAt);
  let deadPenalty = 0;
  if (lastVideoAge > i.deadMinutes) deadPenalty += 8;
  if (lastPinAge > i.deadMinutes) deadPenalty += 7;
  if (deadPenalty > 0) reasons.push({ key: "dead_pipeline", impact: -deadPenalty, detail: `video=${Math.round(lastVideoAge)}m pin=${Math.round(lastPinAge)}m` });
  score -= deadPenalty;

  // Publish rate floor (15) — drops if 24h volume < min/day
  if (i.pinsPublished24h < i.minPinsPerDay) {
    const p = Math.round((1 - i.pinsPublished24h / Math.max(1, i.minPinsPerDay)) * 15);
    reasons.push({ key: "below_minimum_volume", impact: -p, detail: `${i.pinsPublished24h}/${i.minPinsPerDay}` });
    score -= p;
  }

  score = Math.max(0, Math.min(100, score));
  const mode: HealthResult["mode"] =
    score < emergencyThreshold ? "emergency" : score < recoveryThreshold ? "recovery" : "normal";

  return { score, reasons, mode };
}

export function categorizeFailure(err: unknown, hint?: string): FailureSource {
  const msg = ((err as any)?.message || String(err || "") + " " + (hint || "")).toLowerCase();
  if (/pinterest|pin\b|board|oauth|invalid_grant|token/.test(msg)) return "pinterest_api";
  if (/render|ffmpeg|remotion|worker|runway/.test(msg)) return "render";
  if (/stock|inventory|out_of_stock|effective_stock/.test(msg)) return "inventory";
  if (/cj[-_ ]|cjdrop|cj dropship/.test(msg)) return "cj";
  if (/supabase|postgres|pgrst|jwt|rls|relation .* does not exist/.test(msg)) return "supabase";
  if (/storage|bucket|s3|signed url|404 .*\.(mp4|jpg|png|webp)/.test(msg)) return "storage";
  if (/voice|elevenlabs|tts/.test(msg)) return "voice";
  if (/image|video|media|ffprobe|dimensions|aspect/.test(msg)) return "media";
  return "other";
}

const RETRY_LADDER_MIN = [1, 5, 15, 60];

export function nextRetryAt(attempt: number): string | null {
  if (attempt >= RETRY_LADDER_MIN.length) return null;
  const mins = RETRY_LADDER_MIN[attempt];
  return new Date(Date.now() + mins * 60_000).toISOString();
}

export const MAX_RETRY_ATTEMPTS = RETRY_LADDER_MIN.length;

export async function recordFailure(
  supabase: any,
  payload: { source: FailureSource; job_type: string; job_id?: string | null; error_code?: string | null; error_message?: string | null; meta?: Record<string, unknown> },
) {
  try {
    const next = nextRetryAt(0);
    await supabase.from("pinterest_pipeline_failures").insert({
      source: payload.source,
      job_type: payload.job_type,
      job_id: payload.job_id ?? null,
      error_code: payload.error_code ?? null,
      error_message: (payload.error_message ?? "").slice(0, 2000),
      attempt: 0,
      next_retry_at: next,
      meta: payload.meta ?? {},
    });
  } catch (_) {
    // never throw from failure logger
  }
}

export async function markFailureResolved(supabase: any, id: string) {
  try {
    await supabase.from("pinterest_pipeline_failures").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  } catch (_) {}
}

export async function safeRecord<T>(
  supabase: any,
  jobType: string,
  jobId: string | null,
  fn: () => Promise<T>,
  hint?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const source = categorizeFailure(err, hint);
    await recordFailure(supabase, {
      source,
      job_type: jobType,
      job_id: jobId,
      error_code: (err as any)?.code ?? null,
      error_message: (err as any)?.message ?? String(err),
    });
    throw err;
  }
}