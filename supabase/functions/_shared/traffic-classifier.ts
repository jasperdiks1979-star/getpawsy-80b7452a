// Rules-based traffic classifier v1.
// No AI. Fail-safe priority: internal > technical > bot > human > uncertain.
// A single weak bot signal MUST NOT override a session with add_to_cart / checkout.

import { isTechnicalPath } from "./technical-routes.ts";

export type TrafficQuality = "human" | "uncertain" | "bot" | "internal" | "technical";

export interface ClassifierInput {
  page_path?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  is_internal_hint?: boolean | null;
  is_bot_suspect_hint?: boolean | null;
  bot_suspect_reason?: string | null;
  engagement_ms?: number | null;
  interaction_count?: number | null;
  pageviews?: number | null;
  has_atc?: boolean | null;
  has_checkout?: boolean | null;
  has_order?: boolean | null;
  datacenter_signal?: boolean | null;
}

export interface ClassifierResult {
  traffic_quality: TrafficQuality;
  is_bot: boolean;
  is_internal: boolean;
  technical_path: boolean;
  bot_confidence: number; // 0..1
  bot_reason: string | null;
  classification_version: string;
}

export const CLASSIFIER_VERSION = "v1";

const CRAWLER_UA =
  /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|facebot|twitterbot|linkedinbot|pinterest|whatsapp|telegrambot|discordbot|slackbot|embedly|quora|redditbot|applebot|yandex|baiduspider|duckduckbot|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|sogou|exabot|screaming frog|siteauditbot|dataforseobot|serpstatbot)/i;

const SYNTHETIC_UA =
  /(lighthouse|chrome-lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|newrelic|datadogsynthetics|statuscake|site24x7|checkly|headlesschrome|puppeteer|playwright|phantomjs|selenium|webdriver|cypress|katalon|nightmare|electron|node-fetch|axios|python-requests|curl\/|go-http-client|okhttp|apache-httpclient|java\/|wget)/i;

const HIGH_CONF_BOT_REASONS = new Set([
  "known_crawler_ua",
  "synthetic_monitor",
  "headless_browser",
  "automation_signal",
  "declared_bot",
  "malformed_ua_no_interaction",
]);

function classifyBotFromUA(ua: string | null | undefined): { hit: boolean; reason: string | null } {
  if (!ua) return { hit: false, reason: null };
  if (SYNTHETIC_UA.test(ua)) return { hit: true, reason: "synthetic_monitor" };
  if (CRAWLER_UA.test(ua)) return { hit: true, reason: "known_crawler_ua" };
  return { hit: false, reason: null };
}

export function classifyTraffic(input: ClassifierInput): ClassifierResult {
  const path = input.page_path ?? "";
  const ua = input.user_agent ?? "";
  const interactions = Math.max(0, input.interaction_count ?? 0);
  const engagement = Math.max(0, input.engagement_ms ?? 0);
  const pageviews = Math.max(0, input.pageviews ?? 0);
  const hasAtc = !!input.has_atc;
  const hasCheckout = !!input.has_checkout;
  const hasOrder = !!input.has_order;
  const strongHuman = hasAtc || hasCheckout || hasOrder;

  // 1. INTERNAL
  if (input.is_internal_hint) {
    return {
      traffic_quality: "internal",
      is_bot: false,
      is_internal: true,
      technical_path: false,
      bot_confidence: 0,
      bot_reason: null,
      classification_version: CLASSIFIER_VERSION,
    };
  }

  // 2. TECHNICAL
  const isTech = isTechnicalPath(path);
  if (isTech) {
    return {
      traffic_quality: "technical",
      is_bot: false,
      is_internal: false,
      technical_path: true,
      bot_confidence: 0,
      bot_reason: "technical_path",
      classification_version: CLASSIFIER_VERSION,
    };
  }

  // 3. BOT — hard signals only, but strong-human overrides weak-only bot hints
  const uaHit = classifyBotFromUA(ua);
  const highConfExisting =
    !!input.is_bot_suspect_hint &&
    !!input.bot_suspect_reason &&
    HIGH_CONF_BOT_REASONS.has(String(input.bot_suspect_reason));

  if (uaHit.hit) {
    return {
      traffic_quality: "bot",
      is_bot: true,
      is_internal: false,
      technical_path: false,
      bot_confidence: 0.95,
      bot_reason: uaHit.reason,
      classification_version: CLASSIFIER_VERSION,
    };
  }
  if (highConfExisting && !strongHuman) {
    return {
      traffic_quality: "bot",
      is_bot: true,
      is_internal: false,
      technical_path: false,
      bot_confidence: 0.85,
      bot_reason: String(input.bot_suspect_reason),
      classification_version: CLASSIFIER_VERSION,
    };
  }

  // Headless UA + zero interaction on long dwell -> bot
  if (/headlesschrome|puppeteer|playwright|phantomjs/i.test(ua) && interactions === 0) {
    return {
      traffic_quality: "bot",
      is_bot: true,
      is_internal: false,
      technical_path: false,
      bot_confidence: 0.9,
      bot_reason: "headless_browser",
      classification_version: CLASSIFIER_VERSION,
    };
  }

  // 4. HUMAN — strong-human is decisive
  if (strongHuman) {
    return {
      traffic_quality: "human",
      is_bot: false,
      is_internal: false,
      technical_path: false,
      bot_confidence: 0,
      bot_reason: null,
      classification_version: CLASSIFIER_VERSION,
    };
  }
  if (interactions >= 3) {
    return {
      traffic_quality: "human",
      is_bot: false,
      is_internal: false,
      technical_path: false,
      bot_confidence: 0.05,
      bot_reason: null,
      classification_version: CLASSIFIER_VERSION,
    };
  }
  if (pageviews >= 2 && engagement >= 5000 && interactions >= 1) {
    return {
      traffic_quality: "human",
      is_bot: false,
      is_internal: false,
      technical_path: false,
      bot_confidence: 0.1,
      bot_reason: null,
      classification_version: CLASSIFIER_VERSION,
    };
  }

  // 5. UNCERTAIN — includes lone VPN/datacenter, lone bot-suspect low-conf,
  //    0s bounces, direct + single PV + desktop, etc.
  let confidence = 0.2;
  let reason: string | null = null;
  if (input.datacenter_signal) { confidence = 0.4; reason = "datacenter_only"; }
  if (input.is_bot_suspect_hint && !highConfExisting) {
    confidence = Math.max(confidence, 0.5);
    reason = "weak_bot_suspect";
  }
  if (engagement === 0 && pageviews <= 1) {
    reason = reason ?? "zero_dwell_single_pv";
  }
  return {
    traffic_quality: "uncertain",
    is_bot: false,
    is_internal: false,
    technical_path: false,
    bot_confidence: confidence,
    bot_reason: reason,
    classification_version: CLASSIFIER_VERSION,
  };
}

// Session-level aggregation. Fail-safe priority. strong-human protection applies
// via classifyTraffic already; here we only merge per-event classifications.
export function aggregateSessionQuality(
  events: Array<{ traffic_quality: TrafficQuality; bot_confidence?: number | null }>,
  strongHuman: boolean,
): TrafficQuality {
  if (events.length === 0) return "uncertain";
  const has = (q: TrafficQuality) => events.some((e) => e.traffic_quality === q);
  if (has("internal")) return "internal";
  if (has("technical") && events.every((e) => e.traffic_quality === "technical")) return "technical";
  if (has("bot")) {
    if (strongHuman) return "human"; // protected — do not let one weak-bot signal wipe a converter
    return "bot";
  }
  if (has("human") || strongHuman) return "human";
  if (has("technical")) return "technical";
  return "uncertain";
}