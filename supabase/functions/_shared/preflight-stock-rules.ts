// Pure helpers for cinematic-ad-preflight inventory rules.
// Extracted so they can be unit-tested without spinning up Supabase.

export type StockRuleInput = {
  product: { stock?: number | null; is_active?: boolean | null } | null | undefined;
  forceOverride: boolean;
};

export type StockRuleResult = {
  reasons: string[];
  bypassed: string[];
};

export function evaluateStockRules(input: StockRuleInput): StockRuleResult {
  const reasons: string[] = [];
  const bypassed: string[] = [];
  const p = input.product;
  if (!p) return { reasons, bypassed };
  if (p.is_active === false) {
    if (input.forceOverride) bypassed.push("product_inactive");
    else reasons.push("product_inactive");
  }
  if (typeof p.stock === "number" && p.stock <= 0) {
    if (input.forceOverride) bypassed.push("product_out_of_stock");
    else reasons.push("product_out_of_stock");
  }
  return { reasons, bypassed };
}