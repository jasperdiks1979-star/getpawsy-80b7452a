/**
 * UTM + referrer attribution classifier.
 *
 * Source classification is conservative:
 *   - `tiktok` / `pinterest` / `meta` if UTM source matches OR referrer host matches.
 *   - `google_ads` if UTM source=google and medium in (cpc, ppc, paid).
 *   - `google_organic` if google referrer and no UTM source.
 *   - `direct` ONLY when referrer is empty AND no UTM params are set.
 *   - `referral` for any other external referrer.
 *
 * First-touch + last-touch are persisted in sessionStorage so they survive
 * SPA navigation within the visit but reset on a new browser session.
 */

export type ClassifiedSource =
  | 'tiktok'
  | 'pinterest'
  | 'google_ads'
  | 'google_organic'
  | 'meta'
  | 'email'
  | 'direct'
  | 'referral'
  | 'other';

export interface AttributionTouch {
  source: ClassifiedSource;
  medium: string | null;
  campaign: string | null;
  at: number;
}

const FIRST_TOUCH_KEY = 'gp_attr_first_touch_v1';
const LAST_TOUCH_KEY = 'gp_attr_last_touch_v1';

function getQueryParam(name: string): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get(name);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function storedUtm(name: string): string | null {
  try {
    return sessionStorage.getItem(`gp_utm_${name}`) || sessionStorage.getItem(name) || null;
  } catch {
    return null;
  }
}

const OWN_HOST_RE = /(^|\.)getpawsy\.pet$/;

export function isOwnHost(host: string | null | undefined): boolean {
  return !!host && OWN_HOST_RE.test(host.toLowerCase());
}

function refHost(): string | null {
  try {
    const r = document.referrer;
    if (!r) return null;
    const h = new URL(r).hostname.toLowerCase();
    // Own-host referrers are internal navigation, never an acquisition source.
    return isOwnHost(h) ? null : h;
  } catch {
    return null;
  }
}

export function classifySource(): AttributionTouch {
  const utmSource =
    (getQueryParam('utm_source') || storedUtm('utm_source') || '').toLowerCase();
  const utmMedium =
    (getQueryParam('utm_medium') || storedUtm('utm_medium') || '').toLowerCase();
  const utmCampaign =
    getQueryParam('utm_campaign') || storedUtm('utm_campaign') || null;
  const host = refHost();

  let source: ClassifiedSource = 'other';

  const isTikTok = utmSource.includes('tiktok') || (host && host.includes('tiktok.com'));
  const isPinterest =
    utmSource.includes('pinterest') || (host && host.includes('pinterest.com'));
  const isMeta =
    ['facebook', 'instagram', 'meta'].some((s) => utmSource.includes(s)) ||
    (host && (host.includes('facebook.com') || host.includes('instagram.com') || host.includes('fb.com')));
  const isGoogle = utmSource.includes('google') || (host && host.includes('google.'));

  if (isTikTok) source = 'tiktok';
  else if (isPinterest) source = 'pinterest';
  else if (isMeta) source = 'meta';
  else if (isGoogle) {
    if (['cpc', 'ppc', 'paid', 'paidsearch'].includes(utmMedium)) source = 'google_ads';
    else source = utmSource ? 'google_ads' : 'google_organic';
  } else if (utmMedium === 'email' || utmSource.includes('newsletter')) source = 'email';
  else if (!host && !utmSource && !utmMedium) source = 'direct';
  else if (host) source = 'referral';

  // A no-signal page (internal navigation / reload) must not overwrite a
  // real first-touch source such as Bing or Google organic.
  if (source === 'direct' || source === 'other') {
    const first = readTouch(FIRST_TOUCH_KEY);
    if (first && first.source !== 'direct' && first.source !== 'other') {
      return { ...first, at: Date.now() };
    }
  }

  return {
    source,
    medium: utmMedium || null,
    campaign: utmCampaign,
    at: Date.now(),
  };
}

function readTouch(key: string): AttributionTouch | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AttributionTouch) : null;
  } catch {
    return null;
  }
}

function writeTouch(key: string, t: AttributionTouch): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function recordTouch(): void {
  const touch = classifySource();
  if (!readTouch(FIRST_TOUCH_KEY)) writeTouch(FIRST_TOUCH_KEY, touch);
  // Always overwrite last-touch on every page so SPA nav updates it.
  writeTouch(LAST_TOUCH_KEY, touch);
}

export function getFirstTouch(): AttributionTouch | null {
  return readTouch(FIRST_TOUCH_KEY);
}

export function getLastTouch(): AttributionTouch | null {
  return readTouch(LAST_TOUCH_KEY);
}