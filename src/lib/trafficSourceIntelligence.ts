/**
 * Genesis V3.3 — Traffic Source Intelligence Engine.
 *
 * Pure, deterministic, evidence-based classifier. No fake AI, no synthetic
 * probabilities. Every classification is explainable: it returns a list of
 * evidence items plus a confidence score derived from how much of that
 * evidence corroborates the recovered source.
 *
 * Designed to run identically in:
 *   - the browser (live classification at session start)
 *   - an edge function (backfill / nightly enrichment over canonical_sessions)
 *
 * The engine NEVER overwrites original analytics. It produces an enrichment
 * record consumed alongside the original `utm_source` / `referrer`.
 */

export type TSIBucket =
  | "real_customer"
  | "recovered"
  | "direct"
  | "internal"
  | "qa"
  | "smoke_test"
  | "lovable_preview"
  | "ai_worker"
  | "bot"
  | "search_bot"
  | "ai_crawler"
  | "unknown";

export type TSIClassification =
  | "true_direct"
  | "pinterest"
  | "pinterest_recovered"
  | "tiktok"
  | "tiktok_recovered"
  | "google"
  | "google_recovered"
  | "google_ads"
  | "meta"
  | "meta_recovered"
  | "email"
  | "messenger_whatsapp"
  | "qr_code"
  | "mobile_app"
  | "internal"
  | "qa"
  | "smoke_test"
  | "lovable_preview"
  | "ai_worker"
  | "search_bot"
  | "ai_crawler"
  | "bot"
  | "unknown";

export interface TSIInput {
  session_id?: string | null;
  visitor_id?: string | null;
  referrer?: string | null;
  landing_page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  user_agent?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  country?: string | null;
  /** click ids from URL (gclid, fbclid, ttclid, epik, msclkid …) */
  click_ids?: Record<string, string | undefined> | null;
  /** prior canonical session within the attribution window (if any) */
  previous_session?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    referrer?: string | null;
    minutes_ago?: number | null;
  } | null;
  /** flags driven by client/server context */
  is_admin?: boolean;
  is_internal_cookie?: boolean;
  is_lovable_preview?: boolean;
  is_smoke_test?: boolean;
}

export interface TSIEvidence {
  signal: string;
  detail: string;
  weight: number; // 0..1 — contribution toward confidence
}

export interface TSIResult {
  classification: TSIClassification;
  bucket: TSIBucket;
  recovered_source: string;
  original_source: string | null;
  original_medium: string | null;
  confidence: number; // 0..100, integer
  reason: string;
  evidence: TSIEvidence[];
  is_recovered: boolean;
  is_bot: boolean;
  is_internal: boolean;
}

/* ---------------------------------------------------------------- */
/* Reference data                                                    */
/* ---------------------------------------------------------------- */

const SEARCH_BOTS = [
  ["googlebot", "Googlebot"],
  ["bingbot", "Bingbot"],
  ["yandex", "YandexBot"],
  ["duckduckbot", "DuckDuckBot"],
  ["applebot", "Applebot"],
  ["baiduspider", "Baidu"],
] as const;

const AI_CRAWLERS = [
  ["gptbot", "OpenAI GPTBot"],
  ["chatgpt-user", "ChatGPT-User"],
  ["oai-searchbot", "OpenAI SearchBot"],
  ["claude", "Claude / Anthropic"],
  ["anthropic", "Claude / Anthropic"],
  ["perplexitybot", "PerplexityBot"],
  ["google-extended", "Google-Extended"],
  ["cohere", "Cohere"],
] as const;

const SEO_BOTS = [
  ["ahrefsbot", "AhrefsBot"],
  ["semrushbot", "SemrushBot"],
  ["mj12bot", "MJ12Bot"],
  ["dotbot", "DotBot"],
  ["petalbot", "PetalBot"],
] as const;

const SOCIAL_CRAWLERS = [
  ["pinterestbot", "Pinterest crawler"],
  ["pinterest/", "Pinterest fetcher"],
  ["facebookexternalhit", "Facebook crawler"],
  ["twitterbot", "Twitter/X crawler"],
  ["linkedinbot", "LinkedInBot"],
  ["tiktokbot", "TikTok crawler"],
] as const;

const MONITORING_BOTS = [
  ["uptimerobot", "UptimeRobot"],
  ["pingdom", "Pingdom"],
  ["statuscake", "StatusCake"],
  ["cloudflare-healthcheck", "Cloudflare health"],
  ["lighthouse", "Lighthouse"],
  ["headlesschrome", "Headless Chrome"],
  ["puppeteer", "Puppeteer"],
  ["playwright", "Playwright"],
] as const;

const REFERRER_MAP: Array<[RegExp, "pinterest" | "tiktok" | "google" | "google_ads" | "meta" | "email" | "messenger_whatsapp" | "mobile_app"]> = [
  [/pinterest\.[a-z.]+/i, "pinterest"],
  [/pin\.it/i, "pinterest"],
  [/tiktok\.com/i, "tiktok"],
  [/(facebook|instagram|fb)\.com/i, "meta"],
  [/l\.facebook\.com|lm\.facebook\.com/i, "meta"],
  [/m\.facebook\.com/i, "meta"],
  [/messenger\.com/i, "messenger_whatsapp"],
  [/wa\.me|whatsapp\.com|web\.whatsapp\.com/i, "messenger_whatsapp"],
  [/google\.[a-z.]+/i, "google"],
  [/bing\.com|duckduckgo\.com|search\.yahoo\.com/i, "google"], // grouped as organic search
  [/mail\.google|outlook\.live|outlook\.office|mail\.yahoo/i, "email"],
];

const APP_UA_MAP: Array<[RegExp, string]> = [
  [/\bPinterest\//i, "Pinterest App"],
  [/\bTikTok\b/i, "TikTok App"],
  [/\bInstagram\b/i, "Instagram App"],
  [/FBAN|FBAV/i, "Facebook App"],
  [/Messenger/i, "Messenger App"],
  [/WhatsApp/i, "WhatsApp"],
  [/Telegram/i, "Telegram"],
  [/Discord/i, "Discord"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn App"],
  [/RedditApp/i, "Reddit App"],
];

/* ---------------------------------------------------------------- */
/* Helpers                                                            */
/* ---------------------------------------------------------------- */

function matchList<T extends readonly (readonly [string, string])[]>(
  ua: string,
  list: T,
): { needle: string; label: string } | null {
  const lower = ua.toLowerCase();
  for (const [needle, label] of list) {
    if (lower.includes(needle)) return { needle, label };
  }
  return null;
}

function classifyFromReferrer(ref: string): { src: string; label: string } | null {
  for (const [re, src] of REFERRER_MAP) {
    if (re.test(ref)) return { src, label: ref.replace(/^https?:\/\//, "").split("/")[0] };
  }
  return null;
}

function clampConfidence(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function sumWeights(ev: TSIEvidence[]): number {
  return ev.reduce((s, e) => s + e.weight, 0);
}

function buildResult(
  cls: TSIClassification,
  bucket: TSIBucket,
  recovered: string,
  input: TSIInput,
  evidence: TSIEvidence[],
  reason: string,
  opts: { is_recovered?: boolean; is_bot?: boolean; is_internal?: boolean; baseConfidence?: number } = {},
): TSIResult {
  const base = opts.baseConfidence ?? 0;
  const weighted = sumWeights(evidence) * 100;
  return {
    classification: cls,
    bucket,
    recovered_source: recovered,
    original_source: input.utm_source ?? null,
    original_medium: input.utm_medium ?? null,
    confidence: clampConfidence(Math.max(base, weighted)),
    reason,
    evidence,
    is_recovered: !!opts.is_recovered,
    is_bot: !!opts.is_bot,
    is_internal: !!opts.is_internal,
  };
}

/* ---------------------------------------------------------------- */
/* Main classifier                                                    */
/* ---------------------------------------------------------------- */

export function classifyTrafficSource(input: TSIInput): TSIResult {
  const ua = (input.user_agent || "").trim();
  const ref = (input.referrer || "").trim();
  const utmSource = (input.utm_source || "").trim().toLowerCase();
  const utmMedium = (input.utm_medium || "").trim().toLowerCase();
  const landing = (input.landing_page || "").trim();
  const clicks = input.click_ids || {};

  /* 1) Bots & crawlers ------------------------------------------------ */
  if (ua) {
    const search = matchList(ua, SEARCH_BOTS);
    if (search) {
      return buildResult("search_bot", "search_bot", search.label, input,
        [{ signal: "user_agent", detail: search.label, weight: 1 }],
        `Known search engine crawler signature: ${search.label}.`,
        { is_bot: true, baseConfidence: 100 });
    }
    const ai = matchList(ua, AI_CRAWLERS);
    if (ai) {
      return buildResult("ai_crawler", "ai_crawler", ai.label, input,
        [{ signal: "user_agent", detail: ai.label, weight: 1 }],
        `AI crawler signature: ${ai.label}.`,
        { is_bot: true, baseConfidence: 100 });
    }
    const seo = matchList(ua, SEO_BOTS);
    if (seo) {
      return buildResult("bot", "bot", seo.label, input,
        [{ signal: "user_agent", detail: seo.label, weight: 1 }],
        `SEO crawler signature: ${seo.label}.`,
        { is_bot: true, baseConfidence: 100 });
    }
    const social = matchList(ua, SOCIAL_CRAWLERS);
    if (social) {
      return buildResult("bot", "bot", social.label, input,
        [{ signal: "user_agent", detail: social.label, weight: 1 }],
        `Social platform crawler: ${social.label}.`,
        { is_bot: true, baseConfidence: 100 });
    }
    const mon = matchList(ua, MONITORING_BOTS);
    if (mon) {
      return buildResult("ai_worker", "ai_worker", mon.label, input,
        [{ signal: "user_agent", detail: mon.label, weight: 1 }],
        `Monitoring / headless agent: ${mon.label}.`,
        { is_bot: true, is_internal: true, baseConfidence: 100 });
    }
    if (/bot|crawler|spider|http-client|node-fetch|axios|curl|wget/i.test(ua)) {
      return buildResult("bot", "bot", "Generic bot", input,
        [{ signal: "user_agent", detail: ua.slice(0, 80), weight: 0.9 }],
        "Generic bot/library user-agent.",
        { is_bot: true, baseConfidence: 90 });
    }
  }

  /* 2) Internal / QA / preview --------------------------------------- */
  if (input.is_lovable_preview || /lovable\.app|lovableproject\.com/i.test(landing) || /lovable\.app/i.test(ref)) {
    return buildResult("lovable_preview", "lovable_preview", "Lovable Preview", input,
      [{ signal: "host", detail: "lovable preview host", weight: 1 }],
      "Session served from a Lovable preview host.",
      { is_internal: true, baseConfidence: 100 });
  }
  if (input.is_smoke_test || utmSource === "smoke" || utmCampaignIs(input, "smoke")) {
    return buildResult("smoke_test", "smoke_test", "Smoke Test", input,
      [{ signal: "marker", detail: "smoke-test marker present", weight: 1 }],
      "Smoke-test marker detected.",
      { is_internal: true, baseConfidence: 100 });
  }
  if (input.is_admin || utmSource === "internal" || input.is_internal_cookie) {
    return buildResult("internal", "internal", "Internal", input,
      [{ signal: "cookie/role", detail: "internal traffic marker", weight: 1 }],
      "Internal / admin / test traffic marker present.",
      { is_internal: true, baseConfidence: 100 });
  }
  if (utmSource === "qa" || utmMedium === "qa") {
    return buildResult("qa", "qa", "QA", input,
      [{ signal: "utm", detail: "utm marked QA", weight: 1 }],
      "QA-tagged session.",
      { is_internal: true, baseConfidence: 100 });
  }

  /* 3) UTM / click-id (strongest customer signal) -------------------- */
  const evidence: TSIEvidence[] = [];

  if (clicks.ttclid || utmSource.includes("tiktok")) {
    if (clicks.ttclid) evidence.push({ signal: "click_id", detail: "ttclid present", weight: 0.6 });
    if (utmSource) evidence.push({ signal: "utm_source", detail: utmSource, weight: 0.4 });
    return buildResult("tiktok", "real_customer", "TikTok", input, evidence,
      "TikTok click identifier / UTM source.");
  }
  if (clicks.epik || utmSource.includes("pinterest")) {
    if (clicks.epik) evidence.push({ signal: "click_id", detail: "epik present", weight: 0.6 });
    if (utmSource) evidence.push({ signal: "utm_source", detail: utmSource, weight: 0.4 });
    return buildResult("pinterest", "real_customer", "Pinterest", input, evidence,
      "Pinterest click identifier / UTM source.");
  }
  if (clicks.gclid || (utmSource === "google" && /cpc|ppc|paid/.test(utmMedium))) {
    if (clicks.gclid) evidence.push({ signal: "click_id", detail: "gclid present", weight: 0.6 });
    evidence.push({ signal: "utm_medium", detail: utmMedium || "cpc", weight: 0.4 });
    return buildResult("google_ads", "real_customer", "Google Ads", input, evidence,
      "Google Ads click identifier.");
  }
  if (clicks.fbclid || ["facebook", "instagram", "meta"].some((s) => utmSource.includes(s))) {
    if (clicks.fbclid) evidence.push({ signal: "click_id", detail: "fbclid present", weight: 0.6 });
    if (utmSource) evidence.push({ signal: "utm_source", detail: utmSource, weight: 0.4 });
    return buildResult("meta", "real_customer", "Meta", input, evidence,
      "Meta click identifier / UTM source.");
  }
  if (utmMedium === "email" || utmSource.includes("newsletter") || utmSource.includes("email")) {
    evidence.push({ signal: "utm", detail: `${utmSource}/${utmMedium}`, weight: 0.9 });
    return buildResult("email", "real_customer", "Email", input, evidence,
      "Email campaign UTM tag.");
  }
  if (utmMedium === "qr" || utmSource.includes("qr")) {
    evidence.push({ signal: "utm", detail: "qr code marker", weight: 0.9 });
    return buildResult("qr_code", "real_customer", "QR Code", input, evidence,
      "QR-code UTM tag.");
  }

  /* 4) Mobile in-app browsers (UA-based) ---------------------------- */
  for (const [re, label] of APP_UA_MAP) {
    if (re.test(ua)) {
      return buildResult("mobile_app", "real_customer", label, input,
        [{ signal: "user_agent", detail: label, weight: 0.85 }],
        `In-app browser detected: ${label}.`);
    }
  }

  /* 5) Referrer-based ----------------------------------------------- */
  if (ref) {
    const m = classifyFromReferrer(ref);
    if (m) {
      const cls = (m.src === "google_ads" ? "google_ads" : m.src) as TSIClassification;
      return buildResult(cls, "real_customer", m.label, input,
        [{ signal: "referrer", detail: m.label, weight: 0.9 }],
        `Referrer host matches ${m.src}.`);
    }
    return buildResult("unknown", "real_customer", new URL(safeUrl(ref)).hostname, input,
      [{ signal: "referrer", detail: ref.slice(0, 100), weight: 0.6 }],
      "Referral from external site.");
  }

  /* 6) Direct recovery (no referrer, no UTM) ------------------------ */
  const prev = input.previous_session;
  if (prev && prev.minutes_ago != null && prev.minutes_ago <= 60 * 24 * 7) {
    const prevSrc = (prev.utm_source || "").toLowerCase();
    const prevRef = prev.referrer || "";
    let recovered: { cls: TSIClassification; label: string } | null = null;
    if (prevSrc.includes("pinterest") || /pinterest\./i.test(prevRef)) recovered = { cls: "pinterest_recovered", label: "Pinterest (Recovered)" };
    else if (prevSrc.includes("tiktok") || /tiktok\.com/i.test(prevRef)) recovered = { cls: "tiktok_recovered", label: "TikTok (Recovered)" };
    else if (prevSrc.includes("google") || /google\./i.test(prevRef)) recovered = { cls: "google_recovered", label: "Google (Recovered)" };
    else if (["facebook", "instagram", "meta"].some((s) => prevSrc.includes(s)) || /facebook|instagram/i.test(prevRef))
      recovered = { cls: "meta_recovered", label: "Meta (Recovered)" };

    if (recovered) {
      const minutes = Math.round(prev.minutes_ago);
      const ev: TSIEvidence[] = [
        { signal: "previous_session", detail: `prior ${recovered.label.replace(" (Recovered)", "")} session ${minutes}m ago`, weight: 0.7 },
        { signal: "visitor_continuity", detail: "same visitor fingerprint within attribution window", weight: 0.25 },
      ];
      return buildResult(recovered.cls, "recovered", recovered.label, input, ev,
        `Recovered ${recovered.label.replace(" (Recovered)", "")} from prior session ${minutes} minutes ago.`,
        { is_recovered: true });
    }
  }

  /* 7) True direct --------------------------------------------------- */
  const directEv: TSIEvidence[] = [
    { signal: "no_referrer", detail: "no referrer + no UTM + no click id", weight: 0.6 },
    { signal: "no_prior_session", detail: "no prior attributable session", weight: 0.3 },
  ];
  if (input.device || input.browser) {
    directEv.push({ signal: "fingerprint", detail: `${input.device}/${input.browser}`, weight: 0.1 });
  }
  return buildResult("true_direct", "direct", "True Direct", input, directEv,
    "No referrer, UTM or click identifier — likely typed URL or bookmark.",
    { baseConfidence: 80 });
}

function utmCampaignIs(input: TSIInput, needle: string): boolean {
  return !!input.utm_campaign && input.utm_campaign.toLowerCase().includes(needle);
}

function safeUrl(ref: string): string {
  try { return ref.startsWith("http") ? ref : `https://${ref}`; } catch { return "https://example.invalid"; }
}

/* ---------------------------------------------------------------- */
/* Convenience: bucket → friendly label                              */
/* ---------------------------------------------------------------- */

export const TSI_BUCKET_LABEL: Record<TSIBucket, string> = {
  real_customer: "Real Customers",
  recovered: "Recovered Sources",
  direct: "Direct",
  internal: "Internal",
  qa: "QA",
  smoke_test: "Smoke Tests",
  lovable_preview: "Lovable Preview",
  ai_worker: "AI Worker",
  bot: "Bots",
  search_bot: "Search Engine Bots",
  ai_crawler: "AI Crawlers",
  unknown: "Unknown",
};

export const TSI_CLASSIFICATION_LABEL: Record<TSIClassification, string> = {
  true_direct: "True Direct",
  pinterest: "Pinterest",
  pinterest_recovered: "Pinterest (Recovered)",
  tiktok: "TikTok",
  tiktok_recovered: "TikTok (Recovered)",
  google: "Google",
  google_recovered: "Google (Recovered)",
  google_ads: "Google Ads",
  meta: "Meta",
  meta_recovered: "Meta (Recovered)",
  email: "Email",
  messenger_whatsapp: "Messenger / WhatsApp",
  qr_code: "QR Code",
  mobile_app: "Mobile App",
  internal: "Internal",
  qa: "QA",
  smoke_test: "Smoke Test",
  lovable_preview: "Lovable Preview",
  ai_worker: "AI Worker",
  search_bot: "Search Engine Bot",
  ai_crawler: "AI Crawler",
  bot: "Bot",
  unknown: "Unknown",
};