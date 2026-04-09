/**
 * Pinterest API configuration.
 * 
 * SANDBOX MODE: Set to true while awaiting Standard Access approval.
 * Once approved, flip USE_SANDBOX to false and redeploy.
 */
const USE_SANDBOX = true;

export const PINTEREST_API_BASE = USE_SANDBOX
  ? "https://api-sandbox.pinterest.com"
  : "https://api.pinterest.com";
