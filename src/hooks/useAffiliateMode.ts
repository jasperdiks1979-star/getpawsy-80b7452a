/**
 * Affiliate Mode Toggle
 * 
 * When AFFILIATE_MODE is true:
 *  - Collection pages show curated affiliate products (Amazon)
 *  - "Expert Curated Picks" badge appears
 * 
 * When false:
 *  - Internal inventory is shown
 *  - Standard product cards used
 * 
 * This makes future inventory swap seamless — no URL or SEO changes needed.
 */

const AFFILIATE_MODE = false; // disabled — all products are first-party inventory

export function useAffiliateMode() {
  return {
    isAffiliate: AFFILIATE_MODE,
    badgeText: AFFILIATE_MODE ? 'Expert Curated Picks' : undefined,
  };
}
