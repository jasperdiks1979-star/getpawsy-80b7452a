// READ-ONLY validation for cj-resolver@1.1.0-parent-fallback.
// - Resolves target + control + genuine NOT_FOUND SKUs via canonical resolver.
// - POSTs to logistic/freightCalculate for the proven VID (read-only).
// Zero writes: no mapping rows, no inventory updates, no product mutations.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getCjAccessToken,
  resolveCjVariant,
  CJ_API_BASE,
  CJ_RESOLVER_VERSION,
  type CjBudget,
} from "../_shared/cj-resolver.ts";

const TARGET_SKU = "CJFT268927601AZ";
const DEFAULT_CONTROL_SKU = "CJJJPT01254"; // arbitrary parent-form SKU; overridable
const DEFAULT_NOTFOUND_SKU = "NONEXISTENT-SKU-ZZZ-9999";

async function cjFreightPost(body: unknown, token: string) {
  const res = await fetch(`${CJ_API_BASE}/logistic/freightCalculate`, {
    method: "POST",
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, body: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const controlSku = url.searchParams.get("control") ?? DEFAULT_CONTROL_SKU;
    const notFoundSku = url.searchParams.get("notfound") ?? DEFAULT_NOTFOUND_SKU;

    const { token } = await getCjAccessToken();
    const budget: CjBudget = { reqs: 0, max: 40 };

    const target = await resolveCjVariant(TARGET_SKU, token, budget);
    const control = await resolveCjVariant(controlSku, token, budget);
    const notFound = await resolveCjVariant(notFoundSku, token, budget);

    // Freight POST only if target proven
    let freight: any = null;
    if (target.classification === "EXACT_UNIQUE_CONFIRMED" && target.exact[0]?.vid) {
      const vid = target.exact[0].vid;
      // Try the canonical POST body shape first
      const attempts: any[] = [];
      const bodyA = {
        startCountryCode: "US",
        endCountryCode: "US",
        products: [{ vid, quantity: 1 }],
      };
      const rA = await cjFreightPost(bodyA, token);
      attempts.push({ shape: "products[]", status: rA.status, code: rA.body?.code, message: rA.body?.message, data: rA.body?.data ?? null });

      // Some CJ tenants expect a flat body — try only if A returned no methods.
      let usable = Array.isArray(rA.body?.data) ? rA.body.data : (rA.body?.data ? [rA.body.data] : []);
      if (!usable.length) {
        const bodyB = { startCountryCode: "US", endCountryCode: "US", vid, quantity: 1 };
        const rB = await cjFreightPost(bodyB, token);
        attempts.push({ shape: "flat", status: rB.status, code: rB.body?.code, message: rB.body?.message, data: rB.body?.data ?? null });
        usable = Array.isArray(rB.body?.data) ? rB.body.data : (rB.body?.data ? [rB.body.data] : []);
      }

      const methods = usable.map((m: any) => ({
        logisticName: m?.logisticName ?? m?.logisticsName ?? null,
        logisticAliasName: m?.logisticAliasName ?? null,
        logisticPrice: m?.logisticPrice ?? m?.freightPrice ?? m?.freight ?? null,
        productPrice: m?.productAmount ?? m?.productPrice ?? null,
        totalPrice: m?.totalPrice ?? null,
        processingTime: m?.processingTime ?? null,
        deliveryTime: m?.deliveryTime ?? m?.timeCost ?? null,
      }));
      const fedex6 = methods.find((m: any) => /fedex.*us.*to.*us.*#?6/i.test(String(m.logisticName ?? "")) || /fedex.*us.*to.*us.*#?6/i.test(String(m.logisticAliasName ?? "")));
      freight = {
        attempted: attempts,
        methodsCount: methods.length,
        methods,
        fedexUsToUs6Available: !!fedex6,
        fedexUsToUs6ShippingCost: fedex6?.logisticPrice ?? null,
      };
    }

    const targetOk = target.classification === "EXACT_UNIQUE_CONFIRMED";
    const controlOk = control.classification === "EXACT_UNIQUE_CONFIRMED" || control.classification === "NOT_FOUND";
    const notFoundOk = notFound.classification === "NOT_FOUND";

    let verdict: string;
    if (!targetOk) verdict = "VALIDATION_FAILED_NO_MAPPING";
    else if (freight && freight.methodsCount > 0) verdict = "RESOLVER_PATCHED_AND_COMMERCIALS_VERIFIED";
    else verdict = "RESOLVER_PATCHED_FREIGHT_UNRESOLVED";

    return new Response(JSON.stringify({
      verdict,
      resolverVersion: CJ_RESOLVER_VERSION,
      target: {
        inputSku: TARGET_SKU,
        parentSkuUsed: target.parentSkuUsed ?? null,
        classification: target.classification,
        exact: target.exact.map((e) => ({ pid: e.pid, vid: e.vid, variantSku: e.variantSku, productName: e.productName, variantName: e.variantName })),
        candidatePids: target.candidatePids,
        usStock: target.usStock,
        totalStock: target.totalStock,
        http: target.http,
        codes: target.codes,
        requests: target.requests,
      },
      control: { inputSku: controlSku, classification: control.classification, requests: control.requests, http: control.http, exact: control.exact.map(e => ({ pid: e.pid, vid: e.vid, variantSku: e.variantSku })) },
      notFound: { inputSku: notFoundSku, classification: notFound.classification, requests: notFound.requests, ok: notFoundOk },
      freight,
      totals: { requests: budget.reqs },
      mutations: { shopify: 0, cj: 0, mappings: 0, inventory: 0 },
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ verdict: "VALIDATION_FAILED_NO_MAPPING", error: String(e), mutations: { shopify: 0, cj: 0, mappings: 0, inventory: 0 } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});