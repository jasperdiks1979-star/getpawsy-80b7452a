/**
 * Lightweight, dependency-free device + browser classifier.
 *
 * Detects in-app browsers (TikTok, Instagram, Pinterest, Facebook),
 * normalizes device class to mobile / tablet / desktop, and produces a
 * 0–100 confidence score so the admin funnel can weight signals.
 *
 * Pure client-side, sync, no network. Cached per session.
 */

const CACHE_KEY = 'gp_device_v1';

export interface DeviceClassification {
  device: 'mobile' | 'tablet' | 'desktop';
  browser_family: string;
  os_family: string;
  in_app_browser: string | null;
  device_confidence: number;
}

const IN_APP_PATTERNS: Array<[RegExp, string]> = [
  [/\b(musical_ly|bytedancewebview|tiktok)\b/i, 'tiktok'],
  [/\bInstagram\b/i, 'instagram'],
  [/\bPinterest\b/i, 'pinterest'],
  [/\bFBAN\b|\bFBAV\b|\bFB_IAB\b|\bFB4A\b/i, 'facebook'],
  [/\bSnapchat\b/i, 'snapchat'],
  [/\bTwitter\b|\bTwitterAndroid\b/i, 'twitter'],
  [/\bLine\//i, 'line'],
];

function detectInApp(ua: string): string | null {
  for (const [re, name] of IN_APP_PATTERNS) {
    if (re.test(ua)) return name;
  }
  return null;
}

function detectOs(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  return 'unknown';
}

function detectBrowser(ua: string, inApp: string | null): string {
  if (inApp) return `${inApp}_webview`;
  // Order matters: more specific first.
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/CriOS\//.test(ua)) return 'Chrome iOS';
  if (/FxiOS\//.test(ua)) return 'Firefox iOS';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return 'unknown';
}

function detectDevice(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook/i.test(ua)) return 'tablet';
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function readCache(): DeviceClassification | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DeviceClassification) : null;
  } catch {
    return null;
  }
}

function writeCache(c: DeviceClassification): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

function classifyOnce(): DeviceClassification {
  if (typeof navigator === 'undefined') {
    return {
      device: 'desktop',
      browser_family: 'unknown',
      os_family: 'unknown',
      in_app_browser: null,
      device_confidence: 0,
    };
  }

  const ua = navigator.userAgent || '';
  const inApp = detectInApp(ua);
  const os = detectOs(ua);
  const browser = detectBrowser(ua, inApp);
  const device = detectDevice(ua);

  let confidence = 60;
  if (os !== 'unknown') confidence += 15;
  if (browser !== 'unknown') confidence += 15;
  if (inApp) confidence += 5;
  // Cross-check with touch + screen
  try {
    if (typeof screen !== 'undefined' && screen.width > 0) confidence += 5;
  } catch {
    /* ignore */
  }
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    device,
    browser_family: browser,
    os_family: os,
    in_app_browser: inApp,
    device_confidence: confidence,
  };
}

export function getDeviceClassification(): DeviceClassification {
  const cached = readCache();
  if (cached) return cached;
  const fresh = classifyOnce();
  writeCache(fresh);
  return fresh;
}