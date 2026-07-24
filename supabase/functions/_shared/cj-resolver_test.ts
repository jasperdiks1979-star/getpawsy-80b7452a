// Focused tests for cj-resolver variant-suffix parent fallback.
// Uses fetch stubbing to keep the suite hermetic (no network, no Supabase).

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveParentSkuFromVariant,
  resolveCjVariant,
  CJ_API_BASE,
  type CjBudget,
} from "./cj-resolver.ts";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;

function installFetch(handler: FetchHandler) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return await handler(url, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const budget = (): CjBudget => ({ reqs: 0, max: 20 });

// ---------------- deriveParentSkuFromVariant ----------------

Deno.test("deriveParentSkuFromVariant: CJFT268927601AZ → CJFT2689276", () => {
  assertEquals(deriveParentSkuFromVariant("CJFT268927601AZ"), "CJFT2689276");
});

Deno.test("deriveParentSkuFromVariant: rejects parent-only SKU", () => {
  assertEquals(deriveParentSkuFromVariant("CJFT2689276"), null);
});

Deno.test("deriveParentSkuFromVariant: rejects malformed / non-CJ SKUs", () => {
  assertEquals(deriveParentSkuFromVariant(""), null);
  assertEquals(deriveParentSkuFromVariant("random-sku"), null);
  assertEquals(deriveParentSkuFromVariant("CJ268927601AZ"), null); // digits too short for parent
  assertEquals(deriveParentSkuFromVariant("CJFT268927601A"), null); // only one trailing letter
  assertEquals(deriveParentSkuFromVariant("CJFT26892760XXX"), null); // wrong tail shape
});

// ---------------- resolveCjVariant ----------------

Deno.test("resolveCjVariant: exact parent SKU still resolves (no fallback needed)", async () => {
  const restore = installFetch((url) => {
    if (url.includes("/product/list?productSku=PARENTONLY123")) {
      return jsonResponse({ code: 200, result: true, data: { total: 1, list: [{ pid: "P1" }] } });
    }
    if (url.includes("/product/query?pid=P1")) {
      return jsonResponse({ code: 200, result: true, data: {
        pid: "P1", productNameEn: "Parent",
        variants: [{ vid: "V1", variantSku: "PARENTONLY123", variantNameEn: "v" }],
      }});
    }
    if (url.includes("/stock/queryBySku")) {
      return jsonResponse({ code: 200, result: true, data: [
        { countryCode: "US", areaEn: "US", totalInventoryNum: 5 },
      ]});
    }
    return jsonResponse({}, 404);
  });
  try {
    const r = await resolveCjVariant("PARENTONLY123", "tok", budget());
    assertEquals(r.classification, "EXACT_UNIQUE_CONFIRMED");
    assertEquals(r.exact[0].vid, "V1");
    assertEquals(r.parentSkuUsed, null);
  } finally { restore(); }
});

Deno.test("resolveCjVariant: variant-SKU fallback resolves CJFT268927601AZ", async () => {
  const restore = installFetch((url) => {
    if (url.includes("productSku=CJFT268927601AZ")) {
      return jsonResponse({ code: 200, result: true, data: { total: 0, list: [] } });
    }
    if (url.includes("productSku=CJFT2689276")) {
      return jsonResponse({ code: 200, result: true, data: { total: 1, list: [{ pid: "2004080752018214914" }] } });
    }
    if (url.includes("/product/query?pid=2004080752018214914")) {
      return jsonResponse({ code: 200, result: true, data: {
        pid: "2004080752018214914", productNameEn: "Enclosed Litter Box",
        variants: [
          { vid: "2004080752219541504", variantSku: "CJFT268927602BZ" },
          { vid: "2004080752219541505", variantSku: "CJFT268927601AZ" },
          { vid: "2004080752219541506", variantSku: "CJFT268927603CZ" },
        ],
      }});
    }
    if (url.includes("/stock/queryBySku")) {
      return jsonResponse({ code: 200, result: true, data: [
        { countryCode: "US", areaEn: "US", totalInventoryNum: 74 },
      ]});
    }
    return jsonResponse({}, 404);
  });
  try {
    const r = await resolveCjVariant("CJFT268927601AZ", "tok", budget());
    assertEquals(r.classification, "EXACT_UNIQUE_CONFIRMED");
    assertEquals(r.parentSkuUsed, "CJFT2689276");
    assertEquals(r.exact.length, 1);
    assertEquals(r.exact[0].pid, "2004080752018214914");
    assertEquals(r.exact[0].vid, "2004080752219541505");
    assertEquals(r.exact[0].variantSku, "CJFT268927601AZ");
    assertEquals(r.usStock, 74);
  } finally { restore(); }
});

Deno.test("resolveCjVariant: malformed SKU does NOT trigger parent fallback", async () => {
  let listCalls = 0;
  const restore = installFetch((url) => {
    if (url.includes("/product/list?productSku=")) {
      listCalls += 1;
      return jsonResponse({ code: 200, result: true, data: { total: 0, list: [] } });
    }
    return jsonResponse({}, 404);
  });
  try {
    const r = await resolveCjVariant("random-sku", "tok", budget());
    assertEquals(r.classification, "NOT_FOUND");
    assertEquals(r.parentSkuUsed, null);
    assertEquals(listCalls, 1); // no fallback attempted
  } finally { restore(); }
});

Deno.test("resolveCjVariant: parent found but no exact variant match → NOT_FOUND", async () => {
  const restore = installFetch((url) => {
    if (url.includes("productSku=CJFT268927601AZ")) {
      return jsonResponse({ code: 200, result: true, data: { total: 0, list: [] } });
    }
    if (url.includes("productSku=CJFT2689276")) {
      return jsonResponse({ code: 200, result: true, data: { total: 1, list: [{ pid: "P" }] } });
    }
    if (url.includes("/product/query?pid=P")) {
      return jsonResponse({ code: 200, result: true, data: {
        pid: "P", variants: [{ vid: "V9", variantSku: "CJFT268927699ZZ" }],
      }});
    }
    return jsonResponse({}, 404);
  });
  try {
    const r = await resolveCjVariant("CJFT268927601AZ", "tok", budget());
    assertEquals(r.classification, "NOT_FOUND");
    assertEquals(r.parentSkuUsed, "CJFT2689276");
  } finally { restore(); }
});

Deno.test("resolveCjVariant: two exact matches → EXACT_MULTIPLE (safe)", async () => {
  const restore = installFetch((url) => {
    if (url.includes("productSku=CJFT268927601AZ")) {
      return jsonResponse({ code: 200, result: true, data: { total: 0, list: [] } });
    }
    if (url.includes("productSku=CJFT2689276")) {
      return jsonResponse({ code: 200, result: true, data: { total: 2, list: [{ pid: "A" }, { pid: "B" }] } });
    }
    if (url.includes("/product/query?pid=A") || url.includes("/product/query?pid=B")) {
      return jsonResponse({ code: 200, result: true, data: {
        pid: url.includes("pid=A") ? "A" : "B",
        variants: [{ vid: url.includes("pid=A") ? "VA" : "VB", variantSku: "CJFT268927601AZ" }],
      }});
    }
    return jsonResponse({}, 404);
  });
  try {
    const r = await resolveCjVariant("CJFT268927601AZ", "tok", budget());
    assertEquals(r.classification, "EXACT_MULTIPLE");
    assert(r.exact.length === 2);
  } finally { restore(); }
});

Deno.test("resolveCjVariant: API auth/upstream failure → UPSTREAM_ERROR (not NOT_FOUND)", async () => {
  const restore = installFetch(() => jsonResponse({ code: 500, message: "boom" }, 500));
  try {
    const r = await resolveCjVariant("CJFT268927601AZ", "tok", budget());
    assertEquals(r.classification, "UPSTREAM_ERROR");
    assertEquals(r.parentSkuUsed, null); // fallback not triggered on non-2xx
  } finally { restore(); }
});