/**
 * Serverless-safe URL crawler for indexing diagnostics.
 * Runs entirely in-browser — no secrets needed.
 */

const BASE = window.location.origin;
const MAX_URLS = 5000;

export interface CrawlResult {
  url: string;
  status: number | null;
  redirectChain: { url: string; status: number }[];
  finalUrl: string;
  canonical: string | null;
  contentType: string | null;
  isSpaShell: boolean;
  issue: string | null;
  severity: 'critical' | 'warning' | 'info' | 'ok';
}

/** Parse sitemap XML and extract <loc> URLs recursively */
async function parseSitemap(url: string, visited = new Set<string>()): Promise<string[]> {
  if (visited.has(url)) return [];
  visited.add(url);

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    const urls: string[] = [];

    // Check if sitemap index
    const sitemapLocs = [...text.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());
    if (sitemapLocs.length > 0) {
      for (const child of sitemapLocs) {
        const childUrls = await parseSitemap(child, visited);
        urls.push(...childUrls);
      }
    }

    // Regular sitemap entries
    const locMatches = [...text.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());
    urls.push(...locMatches);

    return urls;
  } catch {
    return [];
  }
}

/** Extract Sitemap directives from robots.txt */
async function getSitemapsFromRobots(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/robots.txt`, { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    return [...text.matchAll(/^Sitemap:\s*(.+)$/gmi)].map(m => m[1].trim());
  } catch {
    return [];
  }
}

/** Check if a URL is disallowed by robots.txt rules */
function isDisallowed(path: string, rules: string[]): boolean {
  return rules.some(rule => path.startsWith(rule));
}

/** Parse robots.txt Disallow rules */
async function getDisallowRules(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/robots.txt`, { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    return [...text.matchAll(/^Disallow:\s*(.+)$/gmi)].map(m => m[1].trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Probe a single URL */
async function probeUrl(url: string, disallowRules: string[]): Promise<CrawlResult> {
  const result: CrawlResult = {
    url,
    status: null,
    redirectChain: [],
    finalUrl: url,
    canonical: null,
    contentType: null,
    isSpaShell: false,
    issue: null,
    severity: 'ok',
  };

  // Check robots
  try {
    const path = new URL(url).pathname;
    if (isDisallowed(path, disallowRules)) {
      result.issue = 'Blocked by robots.txt';
      result.severity = 'warning';
      return result;
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Accept': 'text/html' },
    });

    result.status = res.status;
    result.finalUrl = res.url;
    result.contentType = res.headers.get('content-type');

    // Detect redirect (fetch follows automatically, so we compare)
    if (res.url !== url) {
      result.redirectChain.push({ url, status: 301 }); // approximate
    }

    // Classify
    if (res.status >= 400) {
      result.issue = `4xx (other): ${res.status}`;
      result.severity = 'critical';
    } else if (res.status >= 300) {
      result.issue = `Redirect: ${res.status}`;
      result.severity = 'warning';
    }

    // Check canonical + SPA shell for HTML responses
    if (res.ok && result.contentType?.includes('text/html')) {
      const html = await res.text();

      // Extract canonical
      const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      result.canonical = canonMatch ? canonMatch[1] : null;

      // Check for SPA shell (minimal content = soft 404)
      const bodyContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim();
      if (bodyContent.length < 100 && !url.endsWith('/')) {
        result.isSpaShell = true;
        if (!result.issue) {
          result.issue = 'Soft 404 (SPA shell with minimal content)';
          result.severity = 'warning';
        }
      }

      // Canonical mismatch
      if (result.canonical && result.canonical !== result.finalUrl && result.canonical !== url) {
        if (!result.issue) {
          result.issue = `Canonical mismatch: ${result.canonical}`;
          result.severity = 'warning';
        }
      }
    }
  } catch (e: any) {
    result.issue = `Network error: ${e.message || 'unknown'}`;
    result.severity = 'critical';
  }

  return result;
}

export type CrawlProgress = { done: number; total: number; current: string };

/** Run the full crawl with progress callback */
export async function runCrawl(
  onProgress?: (p: CrawlProgress) => void
): Promise<CrawlResult[]> {
  // 1. Gather URLs
  const urlSet = new Set<string>();

  // From robots.txt sitemap directives
  const sitemapUrls = await getSitemapsFromRobots();
  const defaultSitemaps = [`${BASE}/sitemap.xml`];
  const allSitemaps = [...new Set([...sitemapUrls, ...defaultSitemaps])];

  for (const sm of allSitemaps) {
    const urls = await parseSitemap(sm);
    urls.forEach(u => urlSet.add(u));
  }

  // Cap at MAX_URLS
  const urls = [...urlSet].slice(0, MAX_URLS);

  // 2. Get disallow rules
  const disallowRules = await getDisallowRules();

  // 3. Probe each URL (batched for performance)
  const results: CrawlResult[] = [];
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    onProgress?.({ done: i, total: urls.length, current: batch[0] });

    const batchResults = await Promise.all(
      batch.map(url => probeUrl(url, disallowRules))
    );
    results.push(...batchResults);
  }

  onProgress?.({ done: urls.length, total: urls.length, current: 'Done' });

  // Sort by severity
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  results.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return results;
}

/** Probe a single URL for the Live Probe feature */
export async function probeSingleUrl(url: string): Promise<CrawlResult & { cacheControl: string | null }> {
  const disallowRules = await getDisallowRules();
  const base = await probeUrl(url, disallowRules);

  // Also grab cache-control header
  let cacheControl: string | null = null;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    cacheControl = res.headers.get('cache-control');
  } catch { /* ignore */ }

  return { ...base, cacheControl };
}
