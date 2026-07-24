import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const q = `
    query Introspect {
      CatalogContextInput: __type(name: "CatalogContextInput") {
        inputFields { name type { kind name ofType { kind name } } }
      }
      CatalogCreateInput: __type(name: "CatalogCreateInput") {
        inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
      }
      PriceListCreateInput: __type(name: "PriceListCreateInput") {
        inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
      }
      PriceListParentCreateInput: __type(name: "PriceListParentCreateInput") {
        inputFields { name type { kind name } }
      }
      PriceListAdjustmentInput: __type(name: "PriceListAdjustmentInput") {
        inputFields { name type { kind name } }
      }
      PriceListPriceInput: __type(name: "PriceListPriceInput") {
        inputFields { name type { kind name } }
      }
    }
  `;
  const r = await shopifyAdminFetch<any>(q, {});
  return new Response(JSON.stringify(r, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});