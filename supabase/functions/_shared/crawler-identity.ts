// Crawler identity detection + verification. Observational only: never used to
// change what is served. User-Agent alone never yields `verified: true`.

export type CrawlerFamily = "search" | "ads" | "social" | "seo_tool" | "automation";
export type CrawlerClass =
  | "VERIFIED_SEARCH_CRAWLER"
  | "VERIFIED_ADS_CRAWLER"
  | "VERIFIED_SOCIAL_CRAWLER"
  | "KNOWN_OTHER_CRAWLER"
  | "PROBABLE_BOT_OR_AUTOMATION";

type Def = { id: string; re: RegExp; family: CrawlerFamily; verifier: "google" | "bing" | "dns" | null; dns?: string[] };

// Order matters: most specific first.
const DEFS: Def[] = [
  { id: "AdsBot-Google-Mobile", re: /AdsBot-Google-Mobile/i, family: "ads", verifier: "google" },
  { id: "AdsBot-Google", re: /AdsBot-Google/i, family: "ads", verifier: "google" },
  { id: "Mediapartners-Google", re: /Mediapartners-Google/i, family: "ads", verifier: "google" },
  { id: "Google-InspectionTool", re: /Google-InspectionTool/i, family: "search", verifier: "google" },
  { id: "Googlebot-Image", re: /Googlebot-Image/i, family: "search", verifier: "google" },
  { id: "Googlebot", re: /Googlebot/i, family: "search", verifier: "google" },
  { id: "BingPreview", re: /BingPreview/i, family: "search", verifier: "bing" },
  { id: "Bingbot", re: /bingbot/i, family: "search", verifier: "bing" },
  { id: "Applebot", re: /Applebot/i, family: "search", verifier: "dns", dns: [".applebot.apple.com"] },
  { id: "DuckDuckBot", re: /DuckDuckBot/i, family: "search", verifier: null },
  { id: "Pinterestbot", re: /Pinterest(bot)?\//i, family: "social", verifier: "dns", dns: [".pinterest.com"] },
  { id: "Meta-Crawler", re: /facebookexternalhit|meta-externalagent|Facebot/i, family: "social", verifier: null },
  { id: "AhrefsBot", re: /AhrefsBot/i, family: "seo_tool", verifier: null },
  { id: "SemrushBot", re: /SemrushBot/i, family: "seo_tool", verifier: null },
  { id: "Generic-Automation", re: /HeadlessChrome|python-requests|curl\/|wget|scrapy|go-http-client|node-fetch|axios|puppeteer|playwright|phantomjs|\bbot\b|crawler|spider/i, family: "automation", verifier: null },
];

const GOOGLE_DNS = [".googlebot.com", ".google.com", ".googleusercontent.com"];
const BING_DNS = [".search.msn.com"];

export interface CrawlerCandidate { identity: string; family: CrawlerFamily; verifier: Def["verifier"]; dns?: string[] }

export function identifyCrawler(ua: string | null | undefined): CrawlerCandidate | null {
  if (!ua) return null;
  for (const d of DEFS) if (d.re.test(ua)) return { identity: d.id, family: d.family, verifier: d.verifier, dns: d.dns };
  return null;
}

export function userAgentFamily(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const c = identifyCrawler(ua);
  if (c) return c.family === "automation" ? "automation" : "crawler";
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

export interface VerifyDeps {
  inGoogleRanges?: (ip: string) => Promise<boolean>;
  inBingRanges?: (ip: string) => Promise<boolean>;
  reverseDns?: (ip: string) => Promise<string[]>;
  forwardDns?: (host: string) => Promise<string[]>;
}

export interface CrawlerIdentityResult {
  crawler_identity: string | null;
  crawler_family: CrawlerFamily | null;
  crawler_verified: boolean;
  crawler_verification_method: "ip_range" | "reverse_dns_roundtrip" | "ua_only" | null;
  crawler_confidence: number;
  crawler_hostname: string | null;
  is_datacenter: boolean;
  crawler_class: CrawlerClass | null;
  reasons: string[];
}

const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9]+/g, "_");

async function dnsRoundTrip(ip: string, suffixes: string[], deps: VerifyDeps): Promise<string | null> {
  if (!deps.reverseDns || !deps.forwardDns) return null;
  try {
    for (const raw of await deps.reverseDns(ip)) {
      const host = raw.replace(/\.$/, "").toLowerCase();
      if (!suffixes.some((s) => host.endsWith(s))) continue;
      if ((await deps.forwardDns(host)).includes(ip)) return host;
    }
  } catch { /* unsupported / failed → not verified */ }
  return null;
}

export async function resolveCrawlerIdentity(ua: string | null | undefined, ip: string | null | undefined, deps: VerifyDeps = {}): Promise<CrawlerIdentityResult> {
  const c = identifyCrawler(ua);
  if (!c) return { crawler_identity: null, crawler_family: null, crawler_verified: false, crawler_verification_method: null, crawler_confidence: 0, crawler_hostname: null, is_datacenter: false, crawler_class: null, reasons: [] };

  let verified = false;
  let method: CrawlerIdentityResult["crawler_verification_method"] = "ua_only";
  let host: string | null = null;
  const cleanIp = ip && ip !== "unknown" ? ip : null;

  if (cleanIp && c.verifier) {
    try {
      if (c.verifier === "google" && deps.inGoogleRanges && (await deps.inGoogleRanges(cleanIp))) { verified = true; method = "ip_range"; }
      if (c.verifier === "bing" && deps.inBingRanges && (await deps.inBingRanges(cleanIp))) { verified = true; method = "ip_range"; }
    } catch { /* fall through */ }
    if (!verified) {
      const suffixes = c.verifier === "google" ? GOOGLE_DNS : c.verifier === "bing" ? BING_DNS : c.dns ?? [];
      host = await dnsRoundTrip(cleanIp, suffixes, deps);
      if (host) { verified = true; method = "reverse_dns_roundtrip"; }
    }
  }

  const reasons: string[] = [];
  let cls: CrawlerClass;
  if (c.family === "automation") { reasons.push("crawler:generic_automation"); cls = "PROBABLE_BOT_OR_AUTOMATION"; }
  else if (verified) {
    reasons.push(`crawler:verified_${slug(c.identity)}`);
    cls = c.family === "ads" ? "VERIFIED_ADS_CRAWLER" : c.family === "social" ? "VERIFIED_SOCIAL_CRAWLER" : c.family === "search" ? "VERIFIED_SEARCH_CRAWLER" : "KNOWN_OTHER_CRAWLER";
  } else { reasons.push(`crawler:ua_${slug(c.identity)}_unverified`); cls = "KNOWN_OTHER_CRAWLER"; }
  if (verified) reasons.push("crawler:known_datacenter_network");

  return {
    crawler_identity: c.identity, crawler_family: c.family, crawler_verified: verified,
    crawler_verification_method: method, crawler_confidence: verified ? 0.99 : c.family === "automation" ? 0.6 : 0.5,
    crawler_hostname: host, is_datacenter: verified, crawler_class: cls, reasons,
  };
}

/** Salted SHA-256 of IP; raw IP is never persisted. */
export async function hashIp(ip: string | null | undefined, salt: string): Promise<string | null> {
  if (!ip || ip === "unknown") return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Verified/known crawlers must never count as human or commercial traffic. */
export function isCrawlerNonHuman(r: Pick<CrawlerIdentityResult, "crawler_class">): boolean {
  return r.crawler_class !== null;
}
