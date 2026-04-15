/**
 * Pinterest API configuration.
 * 
 * SANDBOX MODE: Set to true while awaiting Standard Access approval.
 * Once approved by Pinterest, no changes needed — already on production.
 */
const USE_SANDBOX = true;

export const PINTEREST_API_BASE = USE_SANDBOX
  ? "https://api-sandbox.pinterest.com"
  : "https://api.pinterest.com";
