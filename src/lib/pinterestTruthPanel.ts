// Pinterest Traffic — DERIVED view of the shared canonical analytics truth.
//
// There is exactly ONE definition of "Pinterest traffic": a canonical truth
// session whose `resolveCanonicalSource()` classification is "pinterest".
// This is the SAME predicate the Visitor World Map source filter uses
// (`truthSessionMatchesSourceFilter(session, "pinterest")`), so the panel's
// session count reconciles exactly with the map's source=Pinterest count.
//
// No database/edge request lives here — the panel is a pure client-side
// projection of the payload already fetched by `useAnalyticsTruth`.
import type { TruthSession } from "@/hooks/useAnalyticsTruth";
import { isUsTruthSession, truthSessionMatchesSourceFilter } from "@/lib/visitorWorldMapCanonicalFeatures";

export interface PinterestTruthRow {
  label: string;
  count: number;
}

export interface PinterestTruthStats {
  sessions: number;
  visitors: number;
  usSessions: number;
  productViews: number;
  addToCart: number;
  checkout: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
  campaigns: PinterestTruthRow[];
  landingPages: PinterestTruthRow[];
  countries: PinterestTruthRow[];
  cities: PinterestTruthRow[];
}

function topRows(map: Map<string, number>, limit = 5): PinterestTruthRow[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function selectPinterestTruthSessions(
  sessions: TruthSession[],
  opts: { usOnly?: boolean; excludeInternal?: boolean } = {},
): TruthSession[] {
  return sessions
    .filter((s) => truthSessionMatchesSourceFilter(s, "pinterest"))
    .filter((s) => (opts.usOnly ? isUsTruthSession(s) : true))
    .filter((s) => (opts.excludeInternal ? !s.is_internal : true));
}

export function derivePinterestTruthStats(
  sessions: TruthSession[],
  opts: { usOnly?: boolean; excludeInternal?: boolean } = {},
): PinterestTruthStats {
  const rows = selectPinterestTruthSessions(sessions, opts);

  const visitors = new Set<string>();
  const campaigns = new Map<string, number>();
  const landings = new Map<string, number>();
  const countries = new Map<string, number>();
  const cities = new Map<string, number>();

  let usSessions = 0;
  let productViews = 0;
  let addToCart = 0;
  let checkout = 0;
  let purchases = 0;
  let revenue = 0;

  for (const s of rows) {
    visitors.add(s.visitor_id || s.session_id);
    if (isUsTruthSession(s)) usSessions++;
    if (s.has_product_view) productViews++;
    if (s.has_add_to_cart) addToCart++;
    if (s.has_checkout) checkout++;
    if (s.has_purchase) purchases++;
    revenue += Number(s.order_value) || 0;

    const campaign = (s.utm_campaign || "").trim() || "(no campaign)";
    campaigns.set(campaign, (campaigns.get(campaign) || 0) + 1);

    const path = (s.page_path || "").trim() || "(unknown)";
    landings.set(path, (landings.get(path) || 0) + 1);

    const country = (s.country || "").trim() || "Unknown";
    countries.set(country, (countries.get(country) || 0) + 1);

    const city = (s.city || "").trim();
    if (city) cities.set(city, (cities.get(city) || 0) + 1);
  }

  return {
    sessions: rows.length,
    visitors: visitors.size,
    usSessions,
    productViews,
    addToCart,
    checkout,
    purchases,
    revenue,
    conversionRate: rows.length > 0 ? (purchases / rows.length) * 100 : 0,
    campaigns: topRows(campaigns),
    landingPages: topRows(landings),
    countries: topRows(countries),
    cities: topRows(cities),
  };
}
