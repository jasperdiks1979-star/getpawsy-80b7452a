// Site-wide crawler-identity coverage for PUBLIC storefront routes.
// One log-crawler-visit call per canonical session (no repeat on SPA
// navigation). Admin/auth/internal/technical routes are excluded; the three
// appeal pages keep their own page-level useCrawlerTracking call.
import { isTechnicalPath } from "@/lib/technicalRoutes";

export const CRAWLER_LOGGED_KEY = "gp_crawler_logged_sid";

const PAGE_LEVEL_TRACKED = new Set(["/google-review", "/technical-declaration", "/appeal-response"]);
const EXCLUDED_PREFIXES = ["/auth", "/login", "/signup", "/account", "/reset-password", "/admin", "/dashboard", "/founder"];

export function isPublicStorefrontPath(path: string): boolean {
  if (!path || isTechnicalPath(path)) return false;
  if (PAGE_LEVEL_TRACKED.has(path)) return false;
  return !EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

/** True when this path should trigger the single per-session crawler log. Marks it as done. */
export function claimCrawlerLog(path: string, sessionId: string | null, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  if (!sessionId || !storage || !isPublicStorefrontPath(path)) return false;
  try {
    if (storage.getItem(CRAWLER_LOGGED_KEY) === sessionId) return false;
    storage.setItem(CRAWLER_LOGGED_KEY, sessionId);
    return true;
  } catch {
    return false;
  }
}
