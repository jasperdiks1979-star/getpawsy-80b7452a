/**
 * Pinterest API configuration.
 *
 * Hardcoded to PRODUCTION per project memory
 * (mem://infrastructure/pinterest-api-sandbox-testing-constraints).
 *
 * Sandbox returns spurious 200/"success" responses without ever creating
 * a real, viewable pin, which made admin "Posted" counters lie. Production
 * is the only mode where a verified `pin_id` / `external_url` is returned.
 */
export const PINTEREST_API_BASE = "https://api.pinterest.com";
