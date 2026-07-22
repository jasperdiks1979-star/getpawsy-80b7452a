// Merchant API v1 single-product canary — READ-ONLY, SINGLE-PASS verification.
//
// Purpose:
//   Verify that a previously-accepted `productInputs.insert` for the canary
//   offer has finished processing into a retrievable `Product`. Called
//   manually by the admin; the client re-invokes at its own cadence.
//
// Guarantees:
//   * Zero mutations. GET only.
//   * Never invokes productInputs.insert / delete / update.
//   * SINGLE-PASS: no sleep, no setTimeout, no polling loop, no delayed
//     retries. At most one productInputs read attempt, one products.get
//     attempt, and one products.list fallback. Returns within ~10s under
//     normal upstream latency.
//
// Verdicts:
//   MERCHANT_V1_CANARY_PROCESSED_MATCHED
//   MERCHANT_V1_CANARY_ACCEPTED_PROCESSING_PENDING
//   MERCHANT_V1_CANARY_PROCESSED_MISMATCH
//   MERCHANT_V1_CANARY_NOT_FOUND
//   MERCHANT_V1_CANARY_PROCESSING_REJECTED
//   MERCHANT_V1_CANARY_READBACK_INCONCLUSIVE
//   MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import {
  MerchantApiClient,
  MerchantApiClientError,
  readEnabled,
  mlog,
} from "../_shared/merchant-api.ts";

const CONTENT_LANGUAGE = "en";
const FEED_LABEL = "US";

// SINGLE-PASS verifier. No server-side polling. Client re-invokes on demand.

type Verdict =
  | "MERCHANT_V1_CANARY_PROCESSED_MATCHED"
  | "MERCHANT_V1_CANARY_ACCEPTED_PROCESSING_PENDING"
  | "MERCHANT_V1_CANARY_PROCESSED_MISMATCH"
  | "MERCHANT_V1_CANARY_NOT_FOUND"
  | "MERCHANT_V1_CANARY_PROCESSING_REJECTED"
  | "MERCHANT_V1_CANARY_READBACK_INCONCLUSIVE"
  | "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE";

function allowedUuid(): string | null {
  const v = (Deno.env.get("MERCHANT_API_WRITE_CANARY_ALLOWED_UUID") ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : null;
}

function priceToMicros(usd: number): string {
  return String(Math.round(usd * 1_000_000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const corrId = crypto.randomUUID();
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify({ ...(b as object), correlationId: corrId }), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let stage = "init";
  try {
    // Parse optional overrides. Only `offerId` is honored; legacy polling
    // knobs are ignored — this verifier is strictly single-pass.
    let overrides: { offerId?: string } = {};
    if (req.method === "POST") {
      try { overrides = (await req.json()) as typeof overrides; } catch { /* ignore */ }
    }

    stage = "flags";
    if (!readEnabled()) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "MERCHANT_API_READ_ENABLED_false" }, 403);
    }

    stage = "auth";
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith("Bearer ")) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.slice(7).trim();
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );
    const { data: userData, error: uerr } = await authClient.auth.getUser(bearer);
    if (uerr || !userData?.user?.id) return json({ ok: false, error: "invalid_auth" }, 401);
    const userId = userData.user.id;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "authorize";
    const { data: token } = await supabase
      .from("merchant_oauth_tokens")
      .select("id, is_connected")
      .eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "forbidden" }, 403);

    stage = "resolve_target";
    const targetUuid = allowedUuid();
    if (!targetUuid) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "allowed_uuid_missing_or_invalid" }, 500);
    }
    const offerId = (overrides.offerId?.trim()) || `getpawsy_${targetUuid}`;
    if (!/^[a-zA-Z0-9._~-]{1,150}$/.test(offerId)) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "offerId_invalid" }, 400);
    }

    stage = "merchant_setup";
    const client = new MerchantApiClient({ supabase });
    const account = await client.resolveAccount();
    let dataSourceName: string;
    try {
      dataSourceName = client.resolveDataSourceName();
    } catch (dsErr) {
      return json({ ok: false, verdict: "MERCHANT_V1_CANARY_ABORTED_SAFETY_GATE" as Verdict, error: "data_source_unresolved", detail: (dsErr as Error).message }, 500);
    }
    const dataSourceIdMatch = dataSourceName.match(/dataSources\/(\d+)$/);
    const dataSourceId = dataSourceIdMatch ? dataSourceIdMatch[1] : null;

    // ── 1. Confirm existence of the ProductInput via list ────────────────
    stage = "confirm_product_input";
    let productInputFound: {
      name: string;
      dataSource?: string;
      contentLanguage?: string;
      feedLabel?: string;
    } | null = null;
    let piScanned = 0;
    let piBareUuidPresent = false;
    let productInputDirectReadStatus:
      | "CONFIRMED"
      | "NOT_FOUND"
      | "PRODUCT_INPUT_DIRECT_READ_UNAVAILABLE" = "NOT_FOUND";
    let productInputDirectReadHttpStatus: number | null = null;
    let productInputDirectReadError: string | undefined;
    try {
      // SINGLE productInputs read attempt (one page, up to 250).
      const pageRes = await client.listProductInputs(250);
      const items = (pageRes.productInputs ?? []) as Array<Record<string, unknown>>;
      for (const raw of items) {
        piScanned++;
        const oid = typeof raw.offerId === "string" ? raw.offerId : "";
        if (oid === offerId) {
          productInputFound = {
            name: String(raw.name ?? ""),
            dataSource: typeof raw.dataSource === "string" ? raw.dataSource : undefined,
            contentLanguage: typeof raw.contentLanguage === "string" ? raw.contentLanguage : undefined,
            feedLabel: typeof raw.feedLabel === "string" ? raw.feedLabel : undefined,
          };
        }
        if (oid === targetUuid) piBareUuidPresent = true;
      }
      productInputDirectReadStatus = productInputFound ? "CONFIRMED" : "NOT_FOUND";
    } catch (e) {
      // A 404/permission error on productInputs.list must NOT be treated as a
      // write failure. Fall through to processed-product read.
      if (e instanceof MerchantApiClientError) {
        productInputDirectReadHttpStatus = e.status;
        productInputDirectReadError = e.code ?? e.googleError?.status ?? "list_error";
      } else {
        productInputDirectReadError = (e as Error)?.message ?? "list_error";
      }
      productInputDirectReadStatus = "PRODUCT_INPUT_DIRECT_READ_UNAVAILABLE";
      mlog("canary_verify_product_input_read_unavailable", {
        corrId, httpStatus: productInputDirectReadHttpStatus, error: productInputDirectReadError,
      });
    }

    // Load expected canary payload from local products table for field-diff.
    stage = "load_expected";
    const { data: expectedRow } = await supabase
      .from("products")
      .select("id, slug, name, image_url, price, availability, brand")
      .eq("id", targetUuid)
      .maybeSingle();
    const expected = expectedRow
      ? {
          title: String(expectedRow.name ?? ""),
          link: `https://getpawsy.pet/products/${expectedRow.slug}`,
          imageLink: String(expectedRow.image_url ?? ""),
          price: {
            amountMicros: priceToMicros(Number(expectedRow.price ?? 0)),
            currencyCode: "USD",
          },
          availability: String(expectedRow.availability ?? "in_stock"),
          brand: expectedRow.brand ? String(expectedRow.brand) : null,
          contentLanguage: CONTENT_LANGUAGE,
          feedLabel: FEED_LABEL,
        }
      : null;

    // ── 2. SINGLE-PASS processed Product read: GET, then optional list ───
    stage = "read_processed";
    // Exact processed resource name (v1: contentLanguage~feedLabel~offerId).
    const processedName = `${account}/products/${CONTENT_LANGUAGE}~${FEED_LABEL}~${offerId}`;

    const attempts: Array<{
      attempt: number;
      at: string;
      method: "GET_processed" | "LIST_processed_fallback";
      httpStatus: number | null;
      code?: string;
      found: boolean;
      transportError?: string;
    }> = [];

    let processed: Record<string, unknown> | null = null;
    let listBaselineCount: number | null = null;
    let bareUuidProductPresent = false;
    let canonicalProcessedResourceCount = 0;
    let processedProductStatus:
      | "MATCHED"
      | "MISMATCH"
      | "NOT_FOUND"
      | "READ_ERROR" = "NOT_FOUND";
    let processedGetHttpStatus: number | null = null;

    // Single GET attempt on the exact processed resource name.
    {
      let getStatus: number | null = null;
      let getCode: string | undefined;
      let getErr: string | undefined;
      try {
        const p = await client.getProductByResourceName(processedName) as Record<string, unknown>;
        processed = p;
        getStatus = 200;
      } catch (e) {
        if (e instanceof MerchantApiClientError) {
          getStatus = e.status;
          getCode = e.code ?? e.googleError?.status;
        } else {
          getErr = (e as Error)?.message ?? "unknown_get_error";
        }
      }
      processedGetHttpStatus = getStatus;
      attempts.push({
        attempt: 1,
        at: new Date().toISOString(),
        method: "GET_processed",
        httpStatus: getStatus,
        code: getCode,
        found: !!processed,
        transportError: getErr,
      });
    }

    // Single products.list fallback (one page) — only if GET returned
    // 404 or a transport error and we still have no processed product.
    if (!processed && (processedGetHttpStatus === 404 || processedGetHttpStatus === null)) {
      let listErr: string | undefined;
      try {
        const pageRes = await client.listProducts(250);
        let total = 0;
        for (const raw of (pageRes.products ?? [])) {
          total++;
          const oid = typeof (raw as { offerId?: unknown }).offerId === "string"
            ? (raw as { offerId: string }).offerId
            : "";
          if (oid === offerId) {
            canonicalProcessedResourceCount++;
            if (!processed) processed = raw as Record<string, unknown>;
          }
          if (oid === targetUuid) bareUuidProductPresent = true;
        }
        listBaselineCount = total;
      } catch (e) {
        listErr = e instanceof Error ? e.message : String(e);
      }
      attempts.push({
        attempt: 1,
        at: new Date().toISOString(),
        method: "LIST_processed_fallback",
        httpStatus: listErr ? null : 200,
        found: !!processed,
        transportError: listErr,
      });
    }

    // ── 3. Score result ──────────────────────────────────────────────────
    stage = "verdict";
    const attrs = (processed?.productAttributes ?? processed?.attributes ?? {}) as Record<string, unknown>;
    const processedContentLanguage = processed && typeof (processed as { contentLanguage?: unknown }).contentLanguage === "string"
      ? (processed as { contentLanguage: string }).contentLanguage
      : undefined;
    const processedFeedLabel = processed && typeof (processed as { feedLabel?: unknown }).feedLabel === "string"
      ? (processed as { feedLabel: string }).feedLabel
      : undefined;
    const processedDataSource = processed && typeof (processed as { dataSource?: unknown }).dataSource === "string"
      ? (processed as { dataSource: string }).dataSource
      : undefined;

    const identityChecks = processed ? {
      offerIdMatch: (processed as { offerId?: unknown }).offerId === offerId,
      contentLanguageMatch: processedContentLanguage === CONTENT_LANGUAGE,
      feedLabelMatch: processedFeedLabel === FEED_LABEL,
      dataSourceMatch: !dataSourceId ? null : (
        processedDataSource ? processedDataSource.endsWith(`/dataSources/${dataSourceId}`) : null
      ),
    } : null;

    // Field-by-field comparison vs. the local canary payload.
    const remotePrice = (attrs as { price?: { amountMicros?: unknown; currencyCode?: unknown } }).price;
    const fieldMatches = processed && expected ? {
      title: (attrs as { title?: unknown }).title === expected.title,
      link: (attrs as { link?: unknown }).link === expected.link,
      imageLink: (attrs as { imageLink?: unknown }).imageLink === expected.imageLink,
      priceAmountMicros: String((remotePrice?.amountMicros ?? "")) === expected.price.amountMicros,
      priceCurrencyCode: String((remotePrice?.currencyCode ?? "")) === expected.price.currencyCode,
      availability: String((attrs as { availability?: unknown }).availability ?? "") === expected.availability,
      brand: expected.brand === null
        ? true
        : (attrs as { brand?: unknown }).brand === expected.brand,
      contentLanguage: processedContentLanguage === expected.contentLanguage,
      feedLabel: processedFeedLabel === expected.feedLabel,
    } : null;
    const allFieldsMatch = fieldMatches
      ? Object.values(fieldMatches).every((v) => v === true)
      : null;

    // Detect explicit Google rejection signals on the processed product.
    const issues = Array.isArray((processed as { itemIssues?: unknown })?.itemIssues)
      ? ((processed as { itemIssues: Array<Record<string, unknown>> }).itemIssues)
      : [];
    const hardRejections = issues.filter((it) => {
      const sev = String(
        (it as { severity?: unknown }).severity
          ?? ((it as { resolution?: unknown }).resolution as string | undefined)
          ?? "",
      ).toLowerCase();
      return /disapproved|error|demoted/i.test(sev);
    });

    let verdict: Verdict;
    if (processed && hardRejections.length > 0) {
      verdict = "MERCHANT_V1_CANARY_PROCESSING_REJECTED";
      processedProductStatus = "MISMATCH";
    } else if (processed && allFieldsMatch === true
        && identityChecks?.offerIdMatch && identityChecks.contentLanguageMatch && identityChecks.feedLabelMatch) {
      verdict = "MERCHANT_V1_CANARY_PROCESSED_MATCHED";
      processedProductStatus = "MATCHED";
    } else if (processed) {
      verdict = "MERCHANT_V1_CANARY_PROCESSED_MISMATCH";
      processedProductStatus = "MISMATCH";
    } else {
      const anyTransportError = attempts.some((a) => a.transportError);
      processedProductStatus = anyTransportError ? "READ_ERROR" : "NOT_FOUND";
      if (productInputFound) {
        verdict = "MERCHANT_V1_CANARY_ACCEPTED_PROCESSING_PENDING";
      } else if (anyTransportError) {
        verdict = "MERCHANT_V1_CANARY_READBACK_INCONCLUSIVE";
      } else {
        // We could not directly confirm ProductInput and no processed Product
        // is visible. If the upstream insert previously succeeded (which is
        // the whole point of this verifier being invoked), treat this as
        // pending rather than a hard NOT_FOUND. Only escalate to NOT_FOUND
        // when the direct read was actually available and returned nothing.
        verdict = productInputDirectReadStatus === "PRODUCT_INPUT_DIRECT_READ_UNAVAILABLE"
          ? "MERCHANT_V1_CANARY_ACCEPTED_PROCESSING_PENDING"
          : "MERCHANT_V1_CANARY_NOT_FOUND";
      }
    }

    mlog("canary_verify", { corrId, verdict, offerId, attempts: attempts.length, productInputFound: !!productInputFound });

    return json({
      ok: verdict === "MERCHANT_V1_CANARY_PROCESSED_MATCHED",
      verdict,
      mutation: "NONE_ZERO_UPSTREAM_CALLS",
      mutations: 0,
      checkedAt: new Date().toISOString(),
      singlePass: true,
      productInputDirectReadStatus,
      processedProductStatus,
      fieldMatches,
      duplicateCheck: {
        bareUuidProductInputPresent: piBareUuidPresent,
        bareUuidProcessedProductPresent: bareUuidProductPresent,
        canonicalProcessedResourceCount,
        canonicalDuplicate: canonicalProcessedResourceCount > 1,
      },
      attempts,
      expected,
      target: {
        account,
        dataSource: dataSourceName,
        offerId,
        contentLanguage: CONTENT_LANGUAGE,
        feedLabel: FEED_LABEL,
        expectedProcessedResource: processedName,
      },
      productInput: {
        confirmed: !!productInputFound,
        resource: productInputFound?.name ?? null,
        dataSource: productInputFound?.dataSource ?? null,
        contentLanguage: productInputFound?.contentLanguage ?? null,
        feedLabel: productInputFound?.feedLabel ?? null,
        totalProductInputsScanned: piScanned,
        bareUuidDuplicatePresent: piBareUuidPresent,
        directReadStatus: productInputDirectReadStatus,
        directReadHttpStatus: productInputDirectReadHttpStatus,
        directReadError: productInputDirectReadError ?? null,
      },
      polling: {
        mode: "SINGLE_PASS",
        maxAttempts: 1,
        attempts,
        lastProcessedGetHttpStatus: processedGetHttpStatus,
      },
      processed: processed ? {
        resourceName: (processed as { name?: unknown }).name ?? null,
        offerId: (processed as { offerId?: unknown }).offerId ?? null,
        contentLanguage: processedContentLanguage ?? null,
        feedLabel: processedFeedLabel ?? null,
        dataSource: processedDataSource ?? null,
        title: (attrs as { title?: unknown }).title ?? null,
        link: (attrs as { link?: unknown }).link ?? null,
        imageLink: (attrs as { imageLink?: unknown }).imageLink ?? null,
        availability: (attrs as { availability?: unknown }).availability ?? null,
        price: (attrs as { price?: unknown }).price ?? null,
        brand: (attrs as { brand?: unknown }).brand ?? null,
        identityChecks,
        allFieldsMatch,
        hardRejections: hardRejections.slice(0, 20),
      } : null,
      counts: {
        productInputsScanned: piScanned,
        processedProductsScannedInFallback: listBaselineCount,
      },
      note:
        verdict === "MERCHANT_V1_CANARY_ACCEPTED_PROCESSING_PENDING"
          ? "ProductInput accepted upstream. Processed Product not yet retrievable — wait ~30 seconds and click Verify again. No re-insert performed."
          : verdict === "MERCHANT_V1_CANARY_PROCESSED_MATCHED"
          ? "Processed Product matches canary payload on all compared fields."
          : verdict === "MERCHANT_V1_CANARY_PROCESSED_MISMATCH"
          ? "Processed Product exists but one or more compared fields differ. See fieldMatches."
          : verdict === "MERCHANT_V1_CANARY_NOT_FOUND"
          ? "Neither ProductInput nor processed Product could be located via read-only endpoints."
          : verdict === "MERCHANT_V1_CANARY_READBACK_INCONCLUSIVE"
          ? "Read path returned an inconclusive signal. No re-insert performed."
          : undefined,
    });
  } catch (e) {
    if (e instanceof MerchantApiClientError) {
      mlog("canary_verify_upstream_error", { corrId, stage, status: e.status, code: e.code });
      // Only real auth / 5xx upstream failures should surface as HTTP 5xx.
      // 4xx read-side errors (404/403 on a specific read endpoint) are
      // surfaced as a 200 inconclusive verdict so the caller can continue.
      const isServerSide = e.status >= 500 || e.status === 401 || e.status === 0;
      return json({
        ok: false,
        verdict: "MERCHANT_V1_CANARY_READBACK_INCONCLUSIVE" as Verdict,
        mutations: 0,
        error: e.code ?? "upstream_error",
        stage,
        upstreamStatus: e.status,
      }, isServerSide ? 502 : 200);
    }
    const err = e as Error;
    mlog("canary_verify_unexpected", { corrId, stage, message: err?.message });
    return json({ ok: false, verdict: "MERCHANT_V1_CANARY_READBACK_INCONCLUSIVE" as Verdict, mutations: 0, error: "internal_error", stage }, 500);
  }
});