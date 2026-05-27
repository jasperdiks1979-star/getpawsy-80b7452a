/**
 * Client-side bot/crawler classifier.
 *
 * Combines four signals:
 *   1. User-agent regex (crawlers, headless, scrapers).
 *   2. `navigator.webdriver === true` (Selenium, Playwright, Puppeteer).
 *   3. Missing browser signals (no `navigator.languages`, no `screen.width`).
 *   4. Impossible event timing (≥3 events fired within <500ms of each other).
 *
 * Result is cached per browser session in `sessionStorage` so every event
 * write picks up the same classification. `traffic_quality_score` is 0-100
 * (100 = clean human, 0 = obvious bot). Anything <50 is treated as bot in
 * the admin funnel dashboard.
 */

const STORAGE_KEY = 'gp_bot_classification_v1';
const TIMING_BUFFER_KEY = 'gp_bot_timing_buffer_v1';

const CRAWLER_PATTERNS = [
  'bot', 'crawler', 'spider', 'scraper', 'headless', 'phantom',
  'selenium', 'puppeteer', 'playwright', 'lighthouse', 'pagespeed',
  'curl', 'wget', 'python-requests', 'go-http-client', 'okhttp',
  'facebookexternalhit', 'twitterbot', 'pinterestbot', 'pinterest',
  'tiktokbot', 'bytespider', 'googlebot', 'bingbot', 'ahrefsbot',
  'semrushbot', 'yandexbot', 'duckduckbot', 'slurp', 'baiduspider',
  'discordbot', 'whatsapp', 'telegrambot', 'linkedinbot', 'embedly',
  'applebot', 'mj12bot', 'dotbot', 'petalbot', 'gptbot', 'oai-searchbot',
  'claudebot', 'perplexitybot',
];

export interface BotClassification {
  is_bot: boolean;
  bot_reason: string | null;
  traffic_quality_score: number; // 0-100
}

function readCached(): BotClassification | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BotClassification;
  } catch {
    return null;
  }
}

function writeCached(c: BotClassification): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

function uaMatch(ua: string): string | null {
  const low = ua.toLowerCase();
  for (const p of CRAWLER_PATTERNS) {
    if (low.includes(p)) return `ua:${p}`;
  }
  return null;
}

function classifyOnce(): BotClassification {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { is_bot: true, bot_reason: 'no_window', traffic_quality_score: 0 };
  }

  let score = 100;
  const reasons: string[] = [];

  const ua = navigator.userAgent || '';
  const uaHit = uaMatch(ua);
  if (uaHit) {
    reasons.push(uaHit);
    score -= 60;
  }

  // navigator.webdriver is set true by Selenium/Playwright/Puppeteer.
  if ((navigator as unknown as { webdriver?: boolean }).webdriver === true) {
    reasons.push('webdriver');
    score -= 40;
  }

  // Missing browser signals — most real browsers populate these.
  if (!navigator.languages || navigator.languages.length === 0) {
    reasons.push('no_languages');
    score -= 15;
  }
  try {
    if (typeof screen === 'undefined' || !screen.width || screen.width < 200) {
      reasons.push('no_screen');
      score -= 15;
    }
  } catch {
    reasons.push('no_screen');
    score -= 15;
  }

  // No touch + no mouse pointer is rare for real visitors on a storefront.
  // (Skipped — too noisy for actual desktop traffic.)

  const is_bot = score < 50;
  return {
    is_bot,
    bot_reason: reasons.length ? reasons.join(',') : null,
    traffic_quality_score: Math.max(0, Math.min(100, score)),
  };
}

/**
 * Get the cached bot classification for this session, computing it once on
 * first call. Safe to call on every event write.
 */
export function getBotClassification(): BotClassification {
  const cached = readCached();
  if (cached) return cached;
  const fresh = classifyOnce();
  writeCached(fresh);
  return fresh;
}

/**
 * Record an event timestamp for impossible-timing detection. If the last
 * 3 events were all fired within <500ms of each other, the session is
 * upgraded to bot.
 */
export function recordEventTimingSample(): void {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(TIMING_BUFFER_KEY);
    const buf: number[] = raw ? JSON.parse(raw) : [];
    buf.push(now);
    while (buf.length > 6) buf.shift();
    sessionStorage.setItem(TIMING_BUFFER_KEY, JSON.stringify(buf));
    if (buf.length >= 3) {
      const span = buf[buf.length - 1] - buf[buf.length - 3];
      if (span < 500) {
        const cur = readCached() ?? classifyOnce();
        if (!cur.is_bot) {
          writeCached({
            is_bot: true,
            bot_reason: (cur.bot_reason ? cur.bot_reason + ',' : '') + 'impossible_timing',
            traffic_quality_score: Math.min(cur.traffic_quality_score, 30),
          });
        }
      }
    }
  } catch {
    /* ignore */
  }
}