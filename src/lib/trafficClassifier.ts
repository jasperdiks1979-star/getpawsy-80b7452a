/**
 * Client-side traffic classifier — non-blocking, best-effort.
 * Distinguishes human vs. prerender / prefetch / bot at engagement time.
 */

export type TrafficType =
  | "human" | "prefetch" | "prerender" | "crawler" | "bot" | "internal" | "unknown";

const BOT_RE =
  /(bot|crawler|spider|crawling|googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|pinterestbot|tiktokbot|ahrefsbot|semrushbot|mj12bot|petalbot|applebot|cloudflare-healthcheck|uptimerobot|prerender|headless|phantom|slurp|chrome-lighthouse)/i;

export function classifyTraffic(): { type: TrafficType; reason: string | null } {
  try {
    const ua = navigator.userAgent || "";
    if (BOT_RE.test(ua)) return { type: "crawler", reason: "ua_match" };
    // Chrome prerendering API
    // @ts-ignore
    if (typeof document !== "undefined" && (document as any).prerendering) {
      return { type: "prerender", reason: "document.prerendering" };
    }
    // Speculation rules navigation type
    const nav = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined);
    // @ts-ignore
    if (nav && (nav as any).activationStart && (nav as any).activationStart > 0) {
      return { type: "prerender", reason: "activationStart>0" };
    }
    return { type: "human", reason: null };
  } catch {
    return { type: "unknown", reason: "exception" };
  }
}

export function detectDevice(): { device: string; browser: string; os: string } {
  try {
    const ua = navigator.userAgent || "";
    const device = /iPad|tablet/i.test(ua) ? "tablet"
      : /Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile" : "desktop";
    const browser =
      /TikTok/i.test(ua) ? "tiktok-inapp" :
      /Instagram/i.test(ua) ? "instagram-inapp" :
      /FBAN|FBAV/i.test(ua) ? "facebook-inapp" :
      /Edg\//i.test(ua) ? "edge" :
      /Chrome\//i.test(ua) ? "chrome" :
      /Firefox\//i.test(ua) ? "firefox" :
      /Safari\//i.test(ua) ? "safari" : "other";
    const os =
      /iPhone|iPad|iPod/i.test(ua) ? "ios" :
      /Android/i.test(ua) ? "android" :
      /Mac OS X/i.test(ua) ? "macos" :
      /Windows/i.test(ua) ? "windows" :
      /Linux/i.test(ua) ? "linux" : "unknown";
    return { device, browser, os };
  } catch {
    return { device: "unknown", browser: "unknown", os: "unknown" };
  }
}