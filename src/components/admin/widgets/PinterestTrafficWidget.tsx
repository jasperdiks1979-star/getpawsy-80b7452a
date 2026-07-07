import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Users, ShoppingCart, CreditCard } from "lucide-react";

interface TrafficStats {
  total: number;
  browsing: number;
  cart: number;
  checkout: number;
  purchases: number;
  campaigns: { name: string; count: number }[];
}

/**
 * Pinterest Traffic — canonical-only source.
 *
 * Reads exclusively from `canonical_sessions` + `canonical_events`, the same
 * truth layer Visitor World Map uses. Legacy paths (`visitor_activity`,
 * `pinterest_attribution_health`, `pinterest_funnel_events` SUMs) are
 * forbidden — see `src/test/pinterest-traffic-widget-canonical-source.test.ts`.
 *
 * Formulas match `pinterest-attribution-canonical-parity.test.ts`:
 *   visitors  = distinct canonical_sessions in window (utm_source/referrer=pinterest)
 *   cart      = COUNT(CANONICAL_ADD_TO_CART)  in those sessions
 *   checkout  = COUNT(CANONICAL_CHECKOUT)     in those sessions
 *   purchases = COUNT(CANONICAL_PURCHASE)     in those sessions
 *   cvr       = purchases / visitors * 100
 */
export const PinterestTrafficWidget = () => {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["pinterest-traffic-stats", "canonical", "30d"],
    queryFn: async (): Promise<TrafficStats> => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

      // 1. Pinterest-attributed canonical sessions in the 30d window.
      //    Uses first_utm_source / first_referrer (locked attribution) with
      //    fallback to live utm_source / referrer, matching Visitor World Map.
      const { data: sessionRows, error: sErr } = await supabase
        .from("canonical_sessions")
        .select("session_id, first_utm_source, utm_source, first_utm_campaign, utm_campaign, first_referrer, referrer")
        .gte("first_seen_at", since)
        .or(
          "utm_source.ilike.%pinterest%,first_utm_source.ilike.%pinterest%,referrer.ilike.%pinterest%,first_referrer.ilike.%pinterest%,referrer.ilike.%pin.it%,first_referrer.ilike.%pin.it%",
        )
        .limit(10000);
      if (sErr) throw sErr;

      const sessions = sessionRows ?? [];
      const sessionIds = sessions.map((s) => s.session_id).filter(Boolean) as string[];

      let cart = 0;
      let checkout = 0;
      let purchases = 0;

      if (sessionIds.length > 0) {
        // Chunk to stay under URL length limits.
        const chunkSize = 500;
        for (let i = 0; i < sessionIds.length; i += chunkSize) {
          const chunk = sessionIds.slice(i, i + chunkSize);
          const { data: evRows, error: eErr } = await supabase
            .from("canonical_events")
            .select("canonical_name")
            .in("session_id", chunk)
            .in("canonical_name", [
              "CANONICAL_ADD_TO_CART",
              "CANONICAL_CHECKOUT",
              "CANONICAL_PURCHASE",
            ])
            .gte("occurred_at", since);
          if (eErr) throw eErr;
          for (const r of evRows ?? []) {
            if (r.canonical_name === "CANONICAL_ADD_TO_CART") cart++;
            else if (r.canonical_name === "CANONICAL_CHECKOUT") checkout++;
            else if (r.canonical_name === "CANONICAL_PURCHASE") purchases++;
          }
        }
      }

      // Distinct sessions = "visitors" for the Pinterest lens.
      const browsing = sessions.length;

      const campaignCounts: Record<string, number> = {};
      for (const s of sessions) {
        const camp = s.first_utm_campaign || s.utm_campaign || "Direct / Organic";
        campaignCounts[camp] = (campaignCounts[camp] || 0) + 1;
      }
      const campaigns = Object.entries(campaignCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return { total: browsing, browsing, cart, checkout, purchases, campaigns };
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
              <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
            </svg>
            Pinterest Traffic
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
              <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
            </svg>
            Pinterest Traffic
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Error loading data</p>
        </CardContent>
      </Card>
    );
  }

  // Purchase-based CVR = purchases / visitors * 100 (matches canonical parity test).
  const conversionRate = stats && stats.browsing > 0
    ? ((stats.purchases / stats.browsing) * 100).toFixed(2)
    : "0";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
            <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
          </svg>
          Pinterest Traffic
          <Badge variant="outline" className="ml-auto text-xs">30 dagen</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs">Bezoekers</span>
            </div>
            <p className="text-2xl font-bold">{stats?.browsing || 0}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShoppingCart className="h-4 w-4" />
              <span className="text-xs">Winkelwagen</span>
            </div>
            <p className="text-2xl font-bold">{stats?.cart || 0}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span className="text-xs">Checkout</span>
            </div>
            <p className="text-2xl font-bold">{stats?.checkout || 0}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Conversie</span>
            </div>
            <p className="text-2xl font-bold">{conversionRate}%</p>
          </div>
        </div>

        {/* Campaigns */}
        {stats?.campaigns && stats.campaigns.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Campagnes</h4>
            <div className="space-y-1.5">
              {stats.campaigns.map((campaign, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[180px]">{campaign.name}</span>
                  <Badge variant="secondary" className="text-xs">{campaign.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats?.total === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nog geen Pinterest verkeer gedetecteerd. Voeg UTM parameters toe aan je pins!
          </p>
        )}
      </CardContent>
    </Card>
  );
};
