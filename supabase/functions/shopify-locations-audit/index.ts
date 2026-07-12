// Read-only Shopify locations audit. No mutations.
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Q = `{
  locations(first: 50) {
    edges { node { id name isActive fulfillsOnlineOrders shipsInventory address { country city } } }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { data, errors, status } = await shopifyAdminFetch<any>(Q, {});
    const locs = (data?.locations?.edges ?? []).map((e: any) => e.node);
    return new Response(JSON.stringify({
      ok: true,
      http_status: status,
      errors: errors ?? null,
      total_locations: locs.length,
      active_locations: locs.filter((l: any) => l.isActive).length,
      inactive_locations: locs.filter((l: any) => !l.isActive).length,
      locations: locs.map((l: any) => ({
        id: l.id,
        name: l.name,
        active: l.isActive,
        fulfills_online_orders: l.fulfillsOnlineOrders,
        ships_inventory: l.shipsInventory,
        country: l.address?.country ?? null,
        city: l.address?.city ?? null,
      })),
      writes_performed: 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 300) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});