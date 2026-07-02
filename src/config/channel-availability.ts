// GENESIS Ω∞ — Organic Growth Constitution
// Canonical channel-availability registry. Read this before recommending,
// budgeting, ranking, or spending AI credits on any acquisition channel.
//
// Rule: if `available === false`, the channel MUST NOT appear in
// recommendations, ROI ranking, forecasts, budget allocation, autopilot
// decisions, or executive dashboards. Historical data remains untouched.

export type ChannelKey =
  | "pinterest_organic"
  | "seo_google"
  | "seo_bing"
  | "seo_duckduckgo"
  | "direct"
  | "email"
  | "referral"
  | "affiliate"
  | "influencer"
  | "tiktok_organic"
  | "instagram_organic"
  | "facebook_organic"
  | "reddit"
  | "repeat_customers"
  | "word_of_mouth"
  | "google_ads"
  | "meta_ads"
  | "pinterest_ads";

export type ChannelStatus = {
  key: ChannelKey;
  label: string;
  available: boolean;
  priority: "P0" | "P1" | "P2" | "OFF";
  reason?: string;
  unavailable_since?: string;
};

export const CHANNEL_AVAILABILITY: Record<ChannelKey, ChannelStatus> = {
  pinterest_organic:  { key: "pinterest_organic",  label: "Pinterest Organic",  available: true,  priority: "P0" },
  seo_google:         { key: "seo_google",         label: "Google Organic",     available: true,  priority: "P0" },
  seo_bing:           { key: "seo_bing",           label: "Bing Organic",       available: true,  priority: "P1" },
  seo_duckduckgo:     { key: "seo_duckduckgo",     label: "DuckDuckGo Organic", available: true,  priority: "P2" },
  direct:             { key: "direct",             label: "Direct",             available: true,  priority: "P1" },
  email:              { key: "email",              label: "Email / Newsletter", available: true,  priority: "P0" },
  referral:           { key: "referral",           label: "Referral",           available: true,  priority: "P1" },
  affiliate:          { key: "affiliate",          label: "Affiliate",          available: true,  priority: "P1" },
  influencer:         { key: "influencer",         label: "Influencer",         available: true,  priority: "P2" },
  tiktok_organic:     { key: "tiktok_organic",     label: "TikTok Organic",     available: true,  priority: "P1" },
  instagram_organic:  { key: "instagram_organic",  label: "Instagram Organic",  available: true,  priority: "P1" },
  facebook_organic:   { key: "facebook_organic",   label: "Facebook Organic",   available: true,  priority: "P2" },
  reddit:             { key: "reddit",             label: "Reddit",             available: true,  priority: "P2" },
  repeat_customers:   { key: "repeat_customers",   label: "Repeat Customers",   available: true,  priority: "P0" },
  word_of_mouth:      { key: "word_of_mouth",      label: "Word of Mouth",      available: true,  priority: "P1" },

  google_ads: {
    key: "google_ads",
    label: "Google Ads",
    available: false,
    priority: "OFF",
    reason: "Google Ads account permanently suspended. CEO directive: do not recommend, budget, or spend AI credits on this channel until manually re-enabled.",
    unavailable_since: "2026-07-02",
  },
  meta_ads:      { key: "meta_ads",      label: "Meta Ads",      available: false, priority: "OFF", reason: "Not activated — organic-first constitution." },
  pinterest_ads: { key: "pinterest_ads", label: "Pinterest Ads", available: false, priority: "OFF", reason: "Not activated — organic-first constitution." },
};

export function isChannelAvailable(key: ChannelKey | string): boolean {
  const c = CHANNEL_AVAILABILITY[key as ChannelKey];
  return !!c && c.available;
}

export function availableChannels(): ChannelStatus[] {
  return Object.values(CHANNEL_AVAILABILITY).filter((c) => c.available);
}

export function unavailableChannels(): ChannelStatus[] {
  return Object.values(CHANNEL_AVAILABILITY).filter((c) => !c.available);
}

/** Strip any recommendation/row whose channel is marked unavailable. */
export function filterAvailable<T extends { channel?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.channel || isChannelAvailable(r.channel));
}