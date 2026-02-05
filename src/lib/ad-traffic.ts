/**
 * Ad Traffic Detection & Landing Intent Lock
 * 
 * Detects if the current visitor arrived via a paid ad (Pinterest, Google, TikTok, etc.)
 * and prevents automatic redirects or content switching that could break the ad experience.
 * 
 * Pinterest In-App Browser Considerations:
 * - Limited JS execution window
 * - No back button reliability
 * - Content must render within 1 second
 * - Redirects cause blank screens or loading loops
 */

const AD_SOURCES = ['pinterest', 'google', 'tiktok', 'facebook', 'meta', 'bing', 'snapchat'];
const AD_MEDIUMS = ['cpc', 'paid', 'ppc', 'social', 'display', 'retargeting'];
const AD_PARAMS = ['epik', 'pin_id', 'gclid', 'fbclid', 'ttclid', 'msclkid'];

/**
 * Check if the current session originated from paid ad traffic.
 * Uses both URL parameters and sessionStorage (for persistence across navigations).
 */
export function isAdTraffic(): boolean {
  // Check URL parameters first (initial landing)
  const params = new URLSearchParams(window.location.search);
  
  // Check for ad-specific click IDs
  for (const param of AD_PARAMS) {
    if (params.has(param)) return true;
  }
  
  // Check UTM source/medium
  const utmSource = (params.get('utm_source') || '').toLowerCase();
  const utmMedium = (params.get('utm_medium') || '').toLowerCase();
  
  if (AD_SOURCES.includes(utmSource)) return true;
  if (AD_MEDIUMS.includes(utmMedium)) return true;
  
  // Check sessionStorage (persisted from initial landing)
  const storedSource = (sessionStorage.getItem('utm_source') || '').toLowerCase();
  const storedMedium = (sessionStorage.getItem('utm_medium') || '').toLowerCase();
  
  if (AD_SOURCES.includes(storedSource)) return true;
  if (AD_MEDIUMS.includes(storedMedium)) return true;
  
  return false;
}

/**
 * Check specifically for Pinterest ad traffic.
 */
export function isPinterestTraffic(): boolean {
  const params = new URLSearchParams(window.location.search);
  
  if (params.has('epik') || params.has('pin_id')) return true;
  
  const utmSource = (params.get('utm_source') || sessionStorage.getItem('utm_source') || '').toLowerCase();
  return utmSource === 'pinterest';
}
