// First Sale Mode — temporary adaptive calibration layer.
// Activates ONLY while the account is still gathering its first wave of
// Pinterest learning data. Lowers exploratory floors (composite, CTR floor,
// novelty) and permits saturated diversity axes a per-axis bump to 0.70.
// Visibility, landing-match, brand-safety and Pinterest-safety floors
// stay untouched. Mode auto-restores when ANY counter crosses its threshold.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

export const FIRST_SALE_TRIGGERS = {
  purchases: 25,
  impressions: 100_000,
  outbound_clicks: 500,
} as const;

export type FirstSaleCounters = {
  purchases: number;
  impressions: number;
  outbound_clicks: number;
};

export type FirstSaleStatus = {
  active: boolean;
  reasons: string[];
  counters: FirstSaleCounters;
  triggers: typeof FIRST_SALE_TRIGGERS;
  // Overrides only when active. Visibility / landing / safety untouched.
  ppe: {
    composite_floor: number;
    ctr_floor: number;
    novelty_floor: number;
    visibility_floor: number; // unchanged copy for transparency
    publish_gate_threshold: number;
  };
  diversity: {
    per_axis_default: number;     // 0.65 — unchanged baseline
    per_axis_saturated_cap: number; // 0.70 — applied only to saturated axes
    saturation_threshold: number;   // axes above this are "saturated"
  };
};

let _cache: { at: number; status: FirstSaleStatus } | null = null;
const CACHE_MS = 60_000;

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function readCounters(sb: SupabaseClient): Promise<FirstSaleCounters> {
  const out: FirstSaleCounters = { purchases: 0, impressions: 0, outbound_clicks: 0 };
  try {
    const { count } = await sb
      .from("orders")
      .select("id", { head: true, count: "exact" })
      .eq("status", "paid");
    out.purchases = Number(count ?? 0);
  } catch { /* ignore */ }
  try {
    const { data } = await sb
      .from("pinterest_analytics_daily")
      .select("impressions,outbound_clicks");
    if (Array.isArray(data)) {
      for (const r of data as Array<{ impressions: number | null; outbound_clicks: number | null }>) {
        out.impressions += Number(r.impressions ?? 0);
        out.outbound_clicks += Number(r.outbound_clicks ?? 0);
      }
    }
  } catch { /* ignore */ }
  return out;
}

export async function getFirstSaleStatus(sb?: SupabaseClient): Promise<FirstSaleStatus> {
  if (_cache && Date.now() - _cache.at < CACHE_MS) return _cache.status;
  const client = sb ?? admin();
  const counters = await readCounters(client);
  const reasons: string[] = [];
  if (counters.purchases < FIRST_SALE_TRIGGERS.purchases) reasons.push("lifetime_purchases<25");
  if (counters.impressions < FIRST_SALE_TRIGGERS.impressions) reasons.push("pinterest_impressions<100000");
  if (counters.outbound_clicks < FIRST_SALE_TRIGGERS.outbound_clicks) reasons.push("outbound_clicks<500");
  const active = reasons.length > 0;

  const status: FirstSaleStatus = {
    active,
    reasons,
    counters,
    triggers: FIRST_SALE_TRIGGERS,
    ppe: active
      ? {
          composite_floor: 55,      // 65 → 55 (exploratory)
          ctr_floor: 80,            // 95 → 80 (exploratory minimum only)
          novelty_floor: 88,        // 96 → 88 (slight)
          visibility_floor: 95,     // unchanged
          publish_gate_threshold: 88, // 95 → 88
        }
      : {
          composite_floor: 92,
          ctr_floor: 95,
          novelty_floor: 96,
          visibility_floor: 95,
          publish_gate_threshold: 95,
        },
    diversity: {
      per_axis_default: 0.65,
      per_axis_saturated_cap: active ? 0.70 : 0.65,
      saturation_threshold: 0.55,
    },
  };

  _cache = { at: Date.now(), status };
  return status;
}

// Convenience: apply first-sale overrides on top of an existing cfg object.
export function applyFirstSaleOverridesToConfig(
  cfg: Record<string, unknown>,
  status: FirstSaleStatus,
): Record<string, unknown> {
  if (!status.active) return cfg;
  return {
    ...cfg,
    ppe_composite_floor: status.ppe.composite_floor,
    ppe_ctr_floor: status.ppe.ctr_floor,
    ppe_novelty_floor: status.ppe.novelty_floor,
    // visibility intentionally NOT overridden
    publish_gate_threshold: status.ppe.publish_gate_threshold,
    first_sale_mode: true,
  };
}