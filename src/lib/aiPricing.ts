/**
 * Shared AI cost / pricing service.
 *
 * Lovable AI Gateway does not expose a live workspace balance API, so we use
 * fixed published pricing and read the cached `credits_remaining` from
 * `pinterest_credit_state` (singleton id=1) when we want a balance estimate.
 *
 * Every admin AI surface MUST present cost as credits + USD + EUR together —
 * never credits only.
 */

import { supabase } from "@/integrations/supabase/client";

/** USD per Lovable AI credit (matches Lovable workspace billing: 1 cr ≈ $0.10). */
export const USD_PER_CREDIT = 0.1;
/** EUR per USD (kept conservative; update if FX drifts materially). */
export const EUR_PER_USD = 0.93;

export interface CostBreakdown {
  credits: number;
  usd: number;
  eur: number;
}

export interface AiBalance {
  credits_remaining: number | null;
  /** True when we have a real number from the backend, not a fallback. */
  is_live: boolean;
  source: "pinterest_credit_state" | "unknown";
}

export interface TopUpSuggestion {
  label: "Small" | "Medium" | "Large";
  usd: number;
  eur: number;
  credits: number;
  covers: boolean;
  /** True if this is the smallest tier that fully covers the operation. */
  recommended: boolean;
}

export interface CostAssessment {
  required: CostBreakdown;
  balance: AiBalance;
  balanceCost: CostBreakdown | null;
  sufficient: boolean | null; // null = unknown balance
  shortfall: CostBreakdown | null;
  topUps: TopUpSuggestion[];
}

const TOP_UP_TIERS: { label: TopUpSuggestion["label"]; usd: number }[] = [
  { label: "Small", usd: 10 },
  { label: "Medium", usd: 25 },
  { label: "Large", usd: 50 },
];

export function creditsToCost(credits: number): CostBreakdown {
  const c = Math.max(0, credits);
  const usd = c * USD_PER_CREDIT;
  return { credits: c, usd, eur: usd * EUR_PER_USD };
}

export function usdToCredits(usd: number): number {
  return usd / USD_PER_CREDIT;
}

export function formatCredits(n: number): string {
  return `${n.toFixed(n < 10 ? 2 : 1)} credits`;
}
export function formatUsd(n: number): string {
  return `$${n.toFixed(2)} USD`;
}
export function formatEur(n: number): string {
  return `€${(n).toFixed(2)} EUR`;
}

export async function fetchAiBalance(): Promise<AiBalance> {
  try {
    const { data } = await supabase
      .from("pinterest_credit_state")
      .select("credits_remaining")
      .eq("id", 1)
      .maybeSingle();
    const remaining = (data as { credits_remaining: number | null } | null)?.credits_remaining;
    if (typeof remaining === "number" && Number.isFinite(remaining)) {
      return { credits_remaining: remaining, is_live: true, source: "pinterest_credit_state" };
    }
  } catch {
    /* swallow — treat as unknown */
  }
  return { credits_remaining: null, is_live: false, source: "unknown" };
}

export function assessCost(requiredCredits: number, balance: AiBalance): CostAssessment {
  const required = creditsToCost(requiredCredits);
  const balanceCost = balance.credits_remaining != null ? creditsToCost(balance.credits_remaining) : null;

  let sufficient: boolean | null = null;
  let shortfall: CostBreakdown | null = null;
  if (balance.credits_remaining != null) {
    sufficient = balance.credits_remaining >= required.credits;
    if (!sufficient) {
      shortfall = creditsToCost(required.credits - balance.credits_remaining);
    }
  }

  const shortfallUsd = shortfall?.usd ?? required.usd;
  const topUps: TopUpSuggestion[] = TOP_UP_TIERS.map((tier) => ({
    label: tier.label,
    usd: tier.usd,
    eur: tier.usd * EUR_PER_USD,
    credits: usdToCredits(tier.usd),
    covers: tier.usd >= shortfallUsd,
    recommended: false,
  }));
  const firstCovering = topUps.find((t) => t.covers);
  if (firstCovering) firstCovering.recommended = true;

  return { required, balance, balanceCost, sufficient, shortfall, topUps };
}

export async function assessCostAsync(requiredCredits: number): Promise<CostAssessment> {
  const balance = await fetchAiBalance();
  return assessCost(requiredCredits, balance);
}