/**
 * Canonical Event Registry — single source of truth for every analytics
 * event name fired by the GetPawsy frontend. Every dashboard, regression
 * test, edge function, and mirror MUST consume names from this module.
 *
 * Legacy aliases (older variants emitted before the Gold Standard
 * rollout) are auto-resolved via `resolveCanonicalEvent()` so historical
 * payloads continue to map to the correct canonical bucket.
 *
 * Rules:
 *  - Add new events here FIRST, then in the emitter.
 *  - Never rename a canonical key; add an alias instead.
 *  - Regression suite asserts this registry stays in sync with the
 *    emitters in `src/lib/analytics.ts` and the funnel waterfall.
 */

export const CANONICAL_ECOMMERCE_EVENTS = [
  "view_item",
  "view_item_list",
  "add_to_cart",
  "view_cart",
  "remove_from_cart",
  "begin_checkout",
  "add_payment_info",
  "add_shipping_info",
  "purchase",
  "refund",
] as const;

export const CANONICAL_FUNNEL_EVENTS = [
  "click",
  "redirect",
  "landing",
  "engagement_start",
  "page_view",
  "scroll",
  "view_item",
  "add_to_cart",
  "view_cart",
  "remove_from_cart",
  "begin_checkout",
  "payment",
  "purchase",
] as const;

export type CanonicalEcommerceEvent = (typeof CANONICAL_ECOMMERCE_EVENTS)[number];
export type CanonicalFunnelEvent = (typeof CANONICAL_FUNNEL_EVENTS)[number];

/**
 * Legacy alias → canonical mapping. Anything not present here is assumed
 * canonical already and returned unchanged.
 */
export const EVENT_ALIASES: Record<string, CanonicalEcommerceEvent | CanonicalFunnelEvent> = {
  // Legacy cart names
  cart: "view_cart",
  cart_view: "view_cart",
  view_cart_drawer: "view_cart",
  cart_open: "view_cart",
  cart_remove: "remove_from_cart",
  remove_cart_item: "remove_from_cart",
  cart_add: "add_to_cart",
  add_cart: "add_to_cart",

  // Legacy PDP / checkout
  product_view: "view_item",
  pdp_view: "view_item",
  checkout_start: "begin_checkout",
  start_checkout: "begin_checkout",
  initiate_checkout: "begin_checkout",
  order_complete: "purchase",
  order_completed: "purchase",
  transaction: "purchase",

  // Legacy traffic / engagement
  pageview: "page_view",
  visit: "landing",
  session_start: "landing",
  active_engagement: "engagement_start",
};

export function resolveCanonicalEvent(name: string): string {
  if (!name) return name;
  const lower = name.toLowerCase();
  return EVENT_ALIASES[lower] ?? lower;
}

export function isCanonicalEcommerceEvent(name: string): name is CanonicalEcommerceEvent {
  return (CANONICAL_ECOMMERCE_EVENTS as readonly string[]).includes(name);
}

export function isCanonicalFunnelEvent(name: string): name is CanonicalFunnelEvent {
  return (CANONICAL_FUNNEL_EVENTS as readonly string[]).includes(name);
}

/**
 * Required GA4 parameters per canonical ecommerce event. Used by the
 * regression test to fail deployment when an emitter drops a required key.
 */
export const REQUIRED_GA4_PARAMS: Record<CanonicalEcommerceEvent, readonly string[]> = {
  view_item: ["currency", "value", "items"],
  view_item_list: ["item_list_id", "item_list_name", "items"],
  add_to_cart: ["currency", "value", "items"],
  view_cart: ["currency", "value", "items"],
  remove_from_cart: ["currency", "value", "items"],
  begin_checkout: ["currency", "value", "items"],
  add_payment_info: ["currency", "value"],
  add_shipping_info: ["currency", "value"],
  purchase: ["transaction_id", "currency", "value", "items"],
  refund: ["transaction_id"],
};