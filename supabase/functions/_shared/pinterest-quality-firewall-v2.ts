// Pinterest Quality Intelligence Firewall v2 (PQIF v2)
// Pre-publish + post-publish + nightly-audit protection layer.
// Pure-function design so callers (worker, audit, replayers) share one verdict.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type FirewallStage = "pre_publish" | "post_publish" | "nightly_audit";

export interface FirewallInput {
  queueId?: string;
  productId: string;
  productSlug: string;
  productName: string;
  title: string;
  description: string;
  imageUrl: string | null;
  destinationUrl: string;
  canonicalUrl?: string;
  price?: number | null;
  imagePhash?: string | null;
  imageHash?: string | null;
  creativeFingerprint?: string | null;
  conceptKey?: string | null;
  familyKey?: string | null;
  familyType?: "creative" | "headline" | "hook" | "visual_dna" | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  ocrText?: string | null;
}

export interface FirewallSettings {
  quality_threshold: number;
  similarity_threshold: number;
  min_image_width: number;
  min_image_height: number;
  product_cooldown_hours: number;
  retire_ctr_below: number;
  retire_after_impressions: number;
  enabled: boolean;
}

export interface FirewallVerdict {
  decision: "pass" | "block" | "warn" | "repair";
  overallScore: number;
  threshold: number;
  scores: Record<string, number>;
  checks: Record<string, { ok: boolean; reason?: string }>;
  reasons: string[];
}

const CJ_PLACEHOLDER_HOSTS = [
  "cjdropshipping.com",
  "cf.cjdropshipping.com",
  "img.cjdropshipping.com",
  "oss-cf.cjdropshipping.com",
];

export async function loadSettings(sb: SupabaseClient): Promise<FirewallSettings> {
  const { data } = await sb.from("pqif_settings").select("*").eq("id", 1).maybeSingle();
  return (data as FirewallSettings) ?? {
    quality_threshold: 75,
    similarity_threshold: 0.88,
    min_image_width: 1000,
    min_image_height: 1500,
    product_cooldown_hours: 48,
    retire_ctr_below: 0.0025,
    retire_after_impressions: 500,
    enabled: true,
  };
}

// --- scoring helpers (deterministic, bounded 0..100) ---------------------
function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }
function wordCount(s: string) { return (s || "").trim().split(/\s+/).filter(Boolean).length; }

function scoreEmotion(title: string, desc: string): number {
  const emo = /(love|happy|cozy|safe|gentle|perfect|adorable|comfort|joy|calm)/gi;
  const hits = ((title + " " + desc).match(emo) || []).length;
  return clamp(40 + hits * 12);
}
function scoreCTR(title: string): number {
  const w = wordCount(title);
  const hasNum = /\d/.test(title);
  const hasPower = /(best|new|top|free|easy|tested|proven|guide)/i.test(title);
  let s = 50;
  if (w >= 6 && w <= 14) s += 20;
  if (hasNum) s += 10;
  if (hasPower) s += 15;
  return clamp(s);
}
function scoreIntent(desc: string): number {
  const buy = /(shop|buy|order|in stock|ships|delivery|premium|guarantee)/gi;
  const hits = (desc.match(buy) || []).length;
  return clamp(45 + hits * 10);
}
function scoreSEO(title: string, desc: string): number {
  const t = wordCount(title), d = wordCount(desc);
  let s = 0;
  if (t >= 5 && t <= 12) s += 35; else s += 15;
  if (d >= 40 && d <= 120) s += 40; else if (d >= 20) s += 25;
  if (/cat|dog|pet|kitten|puppy/i.test(title + desc)) s += 25;
  return clamp(s);
}
function scoreComposition(width?: number | null, height?: number | null): number {
  if (!width || !height) return 60;
  const ratio = height / width;
  if (ratio >= 1.45 && ratio <= 1.6) return 95; // 2:3 sweet spot
  if (ratio >= 1.2 && ratio <= 1.8) return 80;
  return 50;
}
function scoreMobile(title: string, ocrText?: string | null): number {
  const overlayChars = (ocrText ?? title).length;
  if (overlayChars > 0 && overlayChars <= 40) return 95;
  if (overlayChars <= 60) return 80;
  return 55;
}
function scoreBranding(desc: string): number {
  return /(getpawsy|get pawsy)/i.test(desc) ? 95 : 70;
}

const NAUGHTY_OCR = /[^\x20-\x7E\n]/g; // non-printable garbage from broken renders

function spellingOk(text: string): boolean {
  // Heuristic: reject if >30% tokens contain repeated 3+ same chars or non-letters mid-word
  const toks = (text || "").split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let bad = 0;
  for (const t of toks) {
    if (/(.)\1{2,}/.test(t)) bad++;
    else if (/[^A-Za-z0-9\-'.,!?&]/.test(t)) bad++;
  }
  return bad / toks.length < 0.3;
}

export async function checkDuplicates(
  sb: SupabaseClient,
  input: FirewallInput,
  settings: FirewallSettings,
): Promise<Record<string, { ok: boolean; reason?: string }>> {
  const checks: Record<string, { ok: boolean; reason?: string }> = {};

  // Duplicate image
  if (input.imagePhash) {
    const { data } = await sb.from("pinterest_pin_queue")
      .select("id").eq("pin_image_phash", input.imagePhash).neq("id", input.queueId ?? "")
      .gt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(1);
    checks.duplicate_image = { ok: !data?.length, reason: data?.length ? "phash match in last 30d" : undefined };
  }
  // Duplicate headline / description / dest URL
  const { data: titleDup } = await sb.from("pinterest_pin_queue")
    .select("id").eq("pin_title", input.title).neq("id", input.queueId ?? "")
    .gt("created_at", new Date(Date.now() - 14 * 86400_000).toISOString()).limit(1);
  checks.duplicate_headline = { ok: !titleDup?.length };

  const { data: descDup } = await sb.from("pinterest_pin_queue")
    .select("id").eq("pin_description", input.description).neq("id", input.queueId ?? "")
    .gt("created_at", new Date(Date.now() - 14 * 86400_000).toISOString()).limit(1);
  checks.duplicate_description = { ok: !descDup?.length };

  const { data: urlDup } = await sb.from("pinterest_pin_queue")
    .select("id").eq("destination_link", input.destinationUrl).neq("id", input.queueId ?? "")
    .gt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(2);
  checks.duplicate_destination = { ok: (urlDup?.length ?? 0) < 1 };

  // Duplicate concept (creative fingerprint)
  if (input.creativeFingerprint) {
    const { data: cfDup } = await sb.from("pinterest_pin_queue")
      .select("id").eq("creative_fingerprint", input.creativeFingerprint).neq("id", input.queueId ?? "")
      .gt("created_at", new Date(Date.now() - 21 * 86400_000).toISOString()).limit(1);
    checks.duplicate_concept = { ok: !cfDup?.length };
  }

  // Product cooldown (too-recent publication)
  const { data: recent } = await sb.from("pinterest_pin_queue")
    .select("id").eq("product_id", input.productId)
    .in("status", ["posted", "publishing", "queued"])
    .gt("created_at", new Date(Date.now() - settings.product_cooldown_hours * 3600_000).toISOString())
    .neq("id", input.queueId ?? "").limit(1);
  checks.product_cooldown = { ok: !recent?.length, reason: recent?.length ? `published within ${settings.product_cooldown_hours}h` : undefined };

  return checks;
}

export async function checkProductIntegrity(
  sb: SupabaseClient,
  input: FirewallInput,
): Promise<Record<string, { ok: boolean; reason?: string }>> {
  const checks: Record<string, { ok: boolean; reason?: string }> = {};
  const { data: prod } = await sb.from("products")
    .select("id, slug, name, price, effective_stock, canonical_url")
    .eq("id", input.productId).maybeSingle();

  if (!prod) {
    checks.product_exists = { ok: false, reason: "product missing/deleted" };
    return checks;
  }
  checks.product_exists = { ok: true };
  checks.title_matches = { ok: looseMatch(input.title, prod.name as string), reason: "title-product mismatch" };
  checks.description_matches = { ok: looseMatch(input.description, prod.name as string), reason: "description-product mismatch" };
  checks.availability = { ok: (prod.effective_stock ?? 0) > 0, reason: "out of stock" };
  if (typeof input.price === "number" && typeof prod.price === "number") {
    checks.price_consistency = { ok: Math.abs(input.price - prod.price) / prod.price < 0.05, reason: "price drift >5%" };
  }
  checks.destination_url = { ok: input.destinationUrl.includes(`/products/${prod.slug}`), reason: "destination slug mismatch" };
  if (input.canonicalUrl) {
    checks.canonical_url = { ok: input.canonicalUrl.includes(`/products/${prod.slug}`), reason: "canonical mismatch" };
  }
  return checks;
}

function looseMatch(text: string, productName: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const a = new Set(norm(text));
  const b = norm(productName);
  if (!b.length) return true;
  const overlap = b.filter((w) => a.has(w)).length;
  return overlap / b.length >= 0.3;
}

export function checkImageQuality(
  input: FirewallInput,
  settings: FirewallSettings,
): Record<string, { ok: boolean; reason?: string }> {
  const checks: Record<string, { ok: boolean; reason?: string }> = {};
  const url = input.imageUrl ?? "";
  checks.cj_placeholder = { ok: !CJ_PLACEHOLDER_HOSTS.some((h) => url.includes(h)), reason: "CJ-hosted asset" };
  if (input.imageWidth && input.imageHeight) {
    checks.resolution = {
      ok: input.imageWidth >= settings.min_image_width && input.imageHeight >= settings.min_image_height,
      reason: `image ${input.imageWidth}x${input.imageHeight} below min ${settings.min_image_width}x${settings.min_image_height}`,
    };
  }
  if (input.ocrText) {
    const garbage = (input.ocrText.match(NAUGHTY_OCR) || []).length;
    checks.ocr_readable = { ok: garbage < 4 && input.ocrText.length >= 3, reason: "OCR unreadable / artifacts" };
    checks.spelling = { ok: spellingOk(input.ocrText), reason: "spelling/typo signal" };
  }
  // AI artifact heuristic: extreme aspect or unusual dim combos
  if (input.imageWidth && input.imageHeight) {
    const r = input.imageHeight / input.imageWidth;
    checks.ai_artifact_shape = { ok: r > 1 && r < 2.2, reason: "non-Pinterest aspect" };
  }
  return checks;
}

export async function evaluate(
  sb: SupabaseClient,
  input: FirewallInput,
  stage: FirewallStage,
): Promise<FirewallVerdict> {
  const settings = await loadSettings(sb);
  const checks: Record<string, { ok: boolean; reason?: string }> = {};

  Object.assign(checks, checkImageQuality(input, settings));
  Object.assign(checks, await checkProductIntegrity(sb, input));
  Object.assign(checks, await checkDuplicates(sb, input, settings));

  const scores = {
    emotion: scoreEmotion(input.title, input.description),
    ctr: scoreCTR(input.title),
    intent: scoreIntent(input.description),
    seo: scoreSEO(input.title, input.description),
    composition: scoreComposition(input.imageWidth, input.imageHeight),
    mobile: scoreMobile(input.title, input.ocrText),
    branding: scoreBranding(input.description),
  };
  const weights = { emotion: 0.15, ctr: 0.2, intent: 0.15, seo: 0.2, composition: 0.1, mobile: 0.1, branding: 0.1 };
  const overallScore = Object.entries(scores).reduce((sum, [k, v]) => sum + v * (weights as any)[k], 0);

  const failedChecks = Object.entries(checks).filter(([, v]) => !v.ok);
  const reasons = failedChecks.map(([k, v]) => `${k}: ${v.reason ?? "failed"}`);

  let decision: FirewallVerdict["decision"] = "pass";
  if (failedChecks.length > 0) decision = "block";
  else if (overallScore < settings.quality_threshold) {
    decision = "block";
    reasons.push(`overall_score ${overallScore.toFixed(1)} < threshold ${settings.quality_threshold}`);
  }

  const verdict: FirewallVerdict = {
    decision, overallScore: +overallScore.toFixed(2), threshold: settings.quality_threshold,
    scores, checks, reasons,
  };

  await sb.from("pqif_verdicts").insert({
    queue_id: input.queueId ?? null,
    product_id: input.productId,
    stage,
    decision,
    overall_score: verdict.overallScore,
    threshold: verdict.threshold,
    scores,
    checks,
    reasons,
  });

  return verdict;
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}