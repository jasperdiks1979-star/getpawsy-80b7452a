/**
 * conversionFlags — lightweight, instant-rollback feature flags for the
 * CI-2 Emotional PDP + Mobile Conversion layer.
 *
 * Storage: localStorage (per-device) with safe SSR-free defaults. Admin can
 * flip values via the browser console (`window.__gpFlags.set('mobileTrustBar', false)`)
 * or we can wire a small admin UI later. All flags default to ON for the
 * conservative additive blocks and OFF for anything more invasive — every
 * block is reversible by toggling its flag back.
 */

export type ConversionFlagKey =
  | 'emotionalHook'
  | 'mobileTrustBar'
  | 'swipeBenefitChips'
  | 'reassuranceCallout'
  | 'dynamicAtcLabel'
  | 'intentGating'
  | 'premiumCard'
  | 'premiumHero';

const DEFAULTS: Record<ConversionFlagKey, boolean> = {
  emotionalHook: true,
  mobileTrustBar: true,
  swipeBenefitChips: true,
  reassuranceCallout: true,
  dynamicAtcLabel: true,
  // When true, weak-intent visitors see the baseline PDP without ad-driven
  // headline overrides or Pinterest-specific banners. Off = legacy behavior.
  intentGating: true,
  // CI-6: premium DTC product card polish (single badge, calmer typography,
  // no emoji, refined spacing). Pure presentation; flip to false to restore
  // the legacy multi-badge card instantly.
  premiumCard: true,
  // CI-7: premium DTC homepage hero — single emotional headline, single
  // primary CTA, hairline trust row, no urgency ping, no secondary CTA.
  // When on, the legacy duplicate trust strips below the hero are suppressed
  // to keep above-the-fold quiet. Flip to false to restore legacy hero.
  premiumHero: true,
};

const LS_KEY = 'gp_conversion_flags_v1';

function readAll(): Partial<Record<ConversionFlagKey, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(next: Partial<Record<ConversionFlagKey, boolean>>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function getConversionFlag(key: ConversionFlagKey): boolean {
  const overrides = readAll();
  return overrides[key] ?? DEFAULTS[key];
}

export function setConversionFlag(key: ConversionFlagKey, value: boolean): void {
  const overrides = readAll();
  overrides[key] = value;
  writeAll(overrides);
}

// Expose a tiny console helper for instant ops-side rollback.
if (typeof window !== 'undefined') {
  (window as unknown as { __gpFlags?: unknown }).__gpFlags = {
    get: getConversionFlag,
    set: setConversionFlag,
    defaults: DEFAULTS,
  };
}