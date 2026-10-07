/**
 * Numeric US shipping windows in business days — dependency-free so build
 * plugins (Merchant feed, prerendered Product schema) can import it directly.
 * Shopper copy, Product/Offer JSON-LD and the feed all derive from these.
 */
export const US_HANDLING_DAYS = { min: 1, max: 2 } as const;
export const US_TRANSIT_DAYS = { min: 5, max: 10 } as const;
