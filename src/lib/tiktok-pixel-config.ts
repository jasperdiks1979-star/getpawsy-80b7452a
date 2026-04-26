/**
 * TikTok Pixel ID configuration + validation.
 *
 * Reads VITE_TIKTOK_PIXEL_ID at build time and validates the format.
 * Falls back to the hardcoded GetPawsy pixel so production keeps firing
 * even if the env var is forgotten — but a clear warning is logged and a
 * dev-only banner is shown so the issue is impossible to miss.
 *
 * TikTok pixel IDs are 20-character uppercase alphanumeric strings.
 */

const FALLBACK_PIXEL_ID = 'D7KDRMBC77U9EB7RJROG'; // GetPawsy Pixel
const PIXEL_ID_REGEX = /^[A-Z0-9]{20}$/;

const OVERRIDE_KEY = 'gp_tiktok_pixel_config';

export interface PixelConfigOverride {
  pixelId?: string;
  eventManagerUrl?: string;
  conversionEvent?: string;
}

/** Read local override (set via the admin form). Browser-only. */
export function getPixelConfigOverride(): PixelConfigOverride {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist local override. Pass an empty object to clear. */
export function setPixelConfigOverride(value: PixelConfigOverride): void {
  if (typeof window === 'undefined') return;
  try {
    if (!value || Object.keys(value).length === 0) {
      localStorage.removeItem(OVERRIDE_KEY);
    } else {
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(value));
    }
    cached = null; // force re-validate next call
  } catch { /* ignore quota */ }
}

const EVENT_MGR_REGEX = /^https:\/\/ads\.tiktok\.com\/i18n\/events_manager(\/|$|\?)/i;
const ALLOWED_CONVERSION_EVENTS = [
  'CompletePayment',
  'Purchase',
  'PlaceAnOrder',
  'Subscribe',
] as const;

export function validateEventManagerUrl(url: string): { ok: boolean; message: string } {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, message: 'URL is required.' };
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return { ok: false, message: 'Must be HTTPS.' };
    if (!EVENT_MGR_REGEX.test(trimmed)) {
      return {
        ok: false,
        message: 'Expected URL under https://ads.tiktok.com/i18n/events_manager/...',
      };
    }
    return { ok: true, message: 'Valid Events Manager URL.' };
  } catch {
    return { ok: false, message: 'Not a valid URL.' };
  }
}

export function validateConversionEvent(name: string): { ok: boolean; message: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: 'Event name is required.' };
  if (!(ALLOWED_CONVERSION_EVENTS as readonly string[]).includes(trimmed)) {
    return {
      ok: false,
      message: `Must be one of: ${ALLOWED_CONVERSION_EVENTS.join(', ')}.`,
    };
  }
  return { ok: true, message: `"${trimmed}" is a valid TikTok standard event.` };
}

export function validatePixelIdString(id: string): { ok: boolean; message: string } {
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, message: 'Pixel ID is required.' };
  if (!PIXEL_ID_REGEX.test(trimmed)) {
    return {
      ok: false,
      message: 'Expected 20 uppercase alphanumeric characters (e.g. D7KDRMBC77U9EB7RJROG).',
    };
  }
  return { ok: true, message: 'Valid TikTok Pixel ID format.' };
}

export const ALLOWED_CONVERSION_EVENT_OPTIONS = ALLOWED_CONVERSION_EVENTS;
export { FALLBACK_PIXEL_ID };

export type PixelValidationStatus = 'ok' | 'missing' | 'invalid';

export interface PixelValidationResult {
  status: PixelValidationStatus;
  pixelId: string;          // The ID that will actually be used (env or fallback)
  source: 'env' | 'fallback';
  rawValue: string | undefined;
  message: string;
}

let cached: PixelValidationResult | null = null;

export function validateTikTokPixelId(): PixelValidationResult {
  if (cached) return cached;

  // Local override (admin form) takes precedence over env var so you can
  // test alternative pixels in the browser without redeploying.
  const override = getPixelConfigOverride().pixelId?.trim();
  const envRaw = (import.meta.env?.VITE_TIKTOK_PIXEL_ID as string | undefined)?.trim();
  const raw = override || envRaw;

  if (!raw) {
    cached = {
      status: 'missing',
      pixelId: FALLBACK_PIXEL_ID,
      source: 'fallback',
      rawValue: raw,
      message:
        'VITE_TIKTOK_PIXEL_ID is not set. Falling back to the hardcoded GetPawsy pixel. ' +
        'Add VITE_TIKTOK_PIXEL_ID to your environment to make this explicit.',
    };
  } else if (!PIXEL_ID_REGEX.test(raw)) {
    cached = {
      status: 'invalid',
      pixelId: FALLBACK_PIXEL_ID,
      source: 'fallback',
      rawValue: raw,
      message:
        `VITE_TIKTOK_PIXEL_ID="${raw}" has an invalid format. ` +
        'Expected a 20-character uppercase alphanumeric string (e.g. D7KDRMBC77U9EB7RJROG). ' +
        'Falling back to the hardcoded pixel.',
    };
  } else {
    cached = {
      status: 'ok',
      pixelId: raw,
      source: 'env',
      rawValue: raw,
      message: `VITE_TIKTOK_PIXEL_ID validated (${raw}).`,
    };
  }

  return cached;
}

/**
 * Run validation early during boot. Logs a clear console message and, in
 * dev/preview, mounts a dismissible banner if the value is missing or invalid.
 * Production keeps working via the fallback ID — this never throws.
 */
export function reportTikTokPixelValidation(): PixelValidationResult {
  const result = validateTikTokPixelId();

  try {
    if (result.status === 'ok') {
      if (import.meta.env.DEV) {
        console.log('[TikTokPixel] ✅', result.message);
      }
    } else {
      console.warn(`[TikTokPixel] ⚠ ${result.status.toUpperCase()} — ${result.message}`);
      if (import.meta.env.DEV && typeof document !== 'undefined') {
        renderDevBanner(result);
      }
    }
  } catch {
    // Validation must never break the app
  }

  return result;
}

function renderDevBanner(result: PixelValidationResult): void {
  if (document.getElementById('ttq-pixel-config-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'ttq-pixel-config-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:2147483647',
    'padding:10px 16px',
    'background:hsl(0 72% 45%)',
    'color:hsl(0 0% 100%)',
    'font:600 13px/1.4 system-ui,-apple-system,sans-serif',
    'box-shadow:0 2px 8px rgba(0,0,0,.25)',
    'display:flex',
    'align-items:center',
    'gap:12px',
  ].join(';');

  const text = document.createElement('span');
  text.style.flex = '1';
  text.textContent = `⚠ TikTok Pixel config (${result.status}): ${result.message}`;

  const dismiss = document.createElement('button');
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.style.cssText = [
    'background:transparent',
    'border:1px solid hsl(0 0% 100% / 0.6)',
    'color:hsl(0 0% 100%)',
    'border-radius:4px',
    'width:24px',
    'height:24px',
    'cursor:pointer',
    'font-size:16px',
    'line-height:1',
    'padding:0',
  ].join(';');
  dismiss.onclick = () => banner.remove();

  banner.appendChild(text);
  banner.appendChild(dismiss);

  const mount = () => document.body && document.body.appendChild(banner);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}