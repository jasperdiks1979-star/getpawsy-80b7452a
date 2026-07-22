// Read-only full reconciliation: enumerates every Merchant API v1 processed
// product, every legacy Content API v2.1 product, and every local active
// product. Computes overlap totals and source attribution.
//
// Strictly read-only: no writes, deletes, syncs, refreshes, or reconnects.
// CORS-safe: every path returns JSON with corsHeaders.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, MerchantApiClientError, readEnabled, mlog } from "../_shared/merchant-api.ts";

const CONTENT_API_HOST = "https://shoppingcontent.googleapis.com";

type MerchantRow = {
  resourceName: string;
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
  dataSource: string | null;
  title: string | null;
  link: string | null;
  availability: string | null;
  channel: string | null;
};

type LegacyRow = {
  id: string;
  offerId: string;
  contentLanguage: string;
  targetCountry: string;
  channel: string;
  source: string | null;
  title: string | null;
  link: string | null;
  availability: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip exactly one leading `getpawsy_` prefix only when the remainder is a
 *  valid UUID. Bare UUID offerIds are returned verbatim. Anything else → null. */
export function normalizeLocalUuid(rawOfferId: string): string | null {
  if (!rawOfferId) return null;
  if (UUID_RE.test(rawOfferId)) return rawOfferId.toLowerCase();
  const PREFIX = "getpawsy_";
  if (rawOfferId.startsWith(PREFIX)) {
    const rest = rawOfferId.slice(PREFIX.length);
    if (UUID_RE.test(rest)) return rest.toLowerCase();
  }
  return null;
}

/** Classify a Merchant API dataSource resource using its authoritative shape.
 *  Never infer API as AUTOFEED from `defaultRule` alone. */
export function classifyDataSource(d: Record<string, unknown>): "FILE" | "API" | "AUTOFEED" | "UI" | "UNKNOWN" {
  if (d.fileInput) return "FILE";
  const primary = d.primaryProductDataSource as Record<string, unknown> | undefined;
  if (!primary) return "UNKNOWN";
  const input = typeof primary.input === "string" ? (primary.input as string).toUpperCase() : "";
  if (input === "API" || input === "FILE" || input === "AUTOFEED" || input === "UI") return input;
  return "UNKNOWN";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const probeId = (req.headers.get("x-client-probe-id") || "").slice(0, 64);
  const echoHeaders: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (probeId) echoHeaders["x-echo-probe-id"] = probeId;
  const json = (b: unknown, s = 200) => {
    const body = probeId && b && typeof b === "object" ? { ...(b as object), probeId } : b;
    return new Response(JSON.stringify(body), { status: s, headers: echoHeaders });
  };

  const corrId = crypto.randomUUID();
  let stage = "init";
  try {
    if (!readEnabled()) return json({ ok: false, error: "MERCHANT_API_READ_ENABLED_false" }, 403);

    stage = "auth";
    const authz = req.headers.get("Authorization");
    if (!authz) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (!bearer) return json({ ok: false, error: "invalid_auth" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );
    let userId: string;
    try {
      const { data: userData, error: uerr } = await authClient.auth.getUser(bearer);
      if (uerr || !userData?.user?.id) return json({ ok: false, error: "invalid_auth" }, 401);
      userId = userData.user.id;
    } catch {
      return json({ ok: false, error: "invalid_auth" }, 401);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "authorize";
    const { data: token } = await supabase
      .from("merchant_oauth_tokens")
      .select("id, is_connected, merchant_center_id")
      .eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "forbidden", stage }, 403);

    const client = new MerchantApiClient({ supabase });
    const account = await client.resolveAccount();

    // ── 1. Enumerate Merchant API v1 processed products ─────────────────
    stage = "list_merchant_v1";
    const merchantRows: MerchantRow[] = [];
    {
      let pageToken: string | undefined;
      let pages = 0;
      while (pages < 40) { // 40 * 250 = 10 000 cap
        const page = await client.listProducts(250, pageToken);
        for (const raw of page.products ?? []) {
          const p = raw as Record<string, unknown>;
          const attrs = (p.attributes ?? {}) as Record<string, unknown>;
          merchantRows.push({
            resourceName: String(p.name ?? ""),
            offerId: String(p.offerId ?? ""),
            contentLanguage: String(p.contentLanguage ?? ""),
            feedLabel: String(p.feedLabel ?? ""),
            dataSource: (p.dataSource as string | undefined) ?? null,
            title: (attrs.title as string | undefined) ?? null,
            link: (attrs.link as string | undefined) ?? null,
            availability: (attrs.availability as string | undefined) ?? null,
            channel: (p.channel as string | undefined) ?? null,
          });
        }
        if (!page.nextPageToken) break;
        pageToken = page.nextPageToken;
        pages++;
      }
    }

    // ── 2. Enumerate Merchant API v1 data sources for attribution names ──
    stage = "list_data_sources";
    const dataSourceMeta = new Map<string, { name: string; type: string; displayName: string }>();
    try {
      const ds = await client.listDataSources();
      for (const raw of (ds.dataSources ?? [])) {
        const d = raw as Record<string, unknown>;
        const name = String(d.name ?? "");
        if (!name) continue;
        const type = classifyDataSource(d);
        dataSourceMeta.set(name, {
          name,
          type,
          displayName: String(d.displayName ?? ""),
        });
      }
    } catch (e) {
      mlog("recon_datasources_failed", { corrId, message: (e as Error)?.message });
    }

    // ── 3. Enumerate legacy Content API v2.1 products ────────────────────
    stage = "list_content_v21";
    const legacyRows: LegacyRow[] = [];
    let legacyEnumError: string | null = null;
    try {
      const mid = token.merchant_center_id ?? Deno.env.get("GOOGLE_MERCHANT_ID");
      const accessToken = await client.getAccessToken();
      let pageToken: string | undefined;
      let pages = 0;
      while (pages < 20) {
        const url = new URL(`${CONTENT_API_HOST}/content/v2.1/${mid}/products`);
        url.searchParams.set("maxResults", "250");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const resp = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
          legacyEnumError = `content_v21_http_${resp.status}`;
          break;
        }
        const j = await resp.json() as { resources?: Array<Record<string, unknown>>; nextPageToken?: string };
        for (const r of (j.resources ?? [])) {
          legacyRows.push({
            id: String(r.id ?? ""),
            offerId: String(r.offerId ?? ""),
            contentLanguage: String(r.contentLanguage ?? ""),
            targetCountry: String(r.targetCountry ?? ""),
            channel: String(r.channel ?? ""),
            source: (r.source as string | undefined) ?? null,
            title: (r.title as string | undefined) ?? null,
            link: (r.link as string | undefined) ?? null,
            availability: (r.availability as string | undefined) ?? null,
          });
        }
        if (!j.nextPageToken) break;
        pageToken = j.nextPageToken;
        pages++;
      }
    } catch (e) {
      legacyEnumError = `content_v21_exception: ${(e as Error)?.message ?? "unknown"}`;
    }

    // ── 4. Enumerate local active/exportable products ────────────────────
    stage = "load_local";
    const { data: localProducts, error: lerr } = await supabase
      .from("products_public")
      .select("id, slug, name, price, image_url, is_active")
      .eq("is_active", true);
    if (lerr) return json({ ok: false, error: "local_query_error", stage, message: lerr.message }, 502);
    const localById = new Map<string, { id: string; slug: string; name: string }>();
    for (const p of (localProducts ?? [])) localById.set(p.id, { id: p.id, slug: p.slug, name: p.name });

    // ── 5. Reconcile identity with corrected semantics ───────────────────
    stage = "reconcile";

    // Derive per-merchant identity annotations.
    type Annot = {
      row: MerchantRow;
      rawOfferId: string;
      normalizedLocalUuid: string | null;
      hasGetpawsyPrefix: boolean;
      exactLocalProductExists: boolean;
      dataSourceType: "FILE" | "API" | "AUTOFEED" | "UI" | "UNKNOWN";
    };
    const annotated: Annot[] = merchantRows.map((row) => {
      const raw = row.offerId ?? "";
      const normalized = normalizeLocalUuid(raw);
      const hasPrefix = raw.startsWith("getpawsy_");
      const type = ((row.dataSource ? dataSourceMeta.get(row.dataSource)?.type : "UNKNOWN") ?? "UNKNOWN") as Annot["dataSourceType"];
      return {
        row,
        rawOfferId: raw,
        normalizedLocalUuid: normalized,
        hasGetpawsyPrefix: hasPrefix,
        exactLocalProductExists: normalized ? localById.has(normalized) : false,
        dataSourceType: type,
      };
    });

    const legacyByRawOffer = new Map<string, LegacyRow>();
    for (const l of legacyRows) if (l.offerId) legacyByRawOffer.set(l.offerId, l);
    const legacyOfferIds = new Set(legacyRows.map((r) => r.offerId).filter(Boolean));

    // Mutually exclusive identity buckets (per Merchant row).
    const identity = {
      EXACT_RAW_OFFER_ID_MATCH: 0,          // legacy has identical raw offerId
      SAME_LOCAL_UUID_DIFFERENT_PREFIX: 0,  // same local UUID present in legacy but under differing raw form
      MERCHANT_LOCAL_UUID_MATCH_FILE_BARE: 0,   // bare UUID + FILE + local exists
      MERCHANT_LOCAL_UUID_MATCH_API_PREFIXED: 0,// getpawsy_uuid + API + local exists
      MERCHANT_NO_LOCAL_MAPPING: 0,         // no local product for this identity
      OTHER_LOCAL_UUID_MATCH: 0,            // local exists but doesn't fit the two canonical patterns above
    } as Record<string, number>;

    for (const a of annotated) {
      if (legacyByRawOffer.has(a.rawOfferId)) { identity.EXACT_RAW_OFFER_ID_MATCH++; continue; }
      if (a.normalizedLocalUuid) {
        // Legacy contains same local UUID under differing raw offerId form?
        const altPrefixed = `getpawsy_${a.normalizedLocalUuid}`;
        const legacyHasSameLocal = legacyByRawOffer.has(a.normalizedLocalUuid) || legacyByRawOffer.has(altPrefixed);
        if (legacyHasSameLocal) { identity.SAME_LOCAL_UUID_DIFFERENT_PREFIX++; continue; }
      }
      if (a.exactLocalProductExists) {
        if (!a.hasGetpawsyPrefix && a.dataSourceType === "FILE") { identity.MERCHANT_LOCAL_UUID_MATCH_FILE_BARE++; continue; }
        if (a.hasGetpawsyPrefix && a.dataSourceType === "API") { identity.MERCHANT_LOCAL_UUID_MATCH_API_PREFIXED++; continue; }
        identity.OTHER_LOCAL_UUID_MATCH++; continue;
      }
      identity.MERCHANT_NO_LOCAL_MAPPING++;
    }

    // Legacy Content API v2.1 products with no corresponding Merchant identity.
    const merchantRawOfferIds = new Set(annotated.map((a) => a.rawOfferId));
    const merchantLocalUuids = new Set(annotated.map((a) => a.normalizedLocalUuid).filter((u): u is string => !!u));
    let LEGACY_NO_MERCHANT_MAPPING = 0;
    for (const l of legacyRows) {
      if (merchantRawOfferIds.has(l.offerId)) continue;
      const localUuid = normalizeLocalUuid(l.offerId);
      if (localUuid && merchantLocalUuids.has(localUuid)) continue;
      LEGACY_NO_MERCHANT_MAPPING++;
    }

    // Semantic duplicates: same normalizedLocalUuid across ≥2 Merchant resources.
    const localUuidToResources = new Map<string, string[]>();
    for (const a of annotated) {
      if (!a.normalizedLocalUuid) continue;
      const arr = localUuidToResources.get(a.normalizedLocalUuid) ?? [];
      arr.push(a.row.resourceName);
      localUuidToResources.set(a.normalizedLocalUuid, arr);
    }
    const semanticDuplicates: Array<{ localUuid: string; resources: string[] }> = [];
    for (const [uuid, resources] of localUuidToResources) {
      if (resources.length > 1) semanticDuplicates.push({ localUuid: uuid, resources });
    }

    // Attribution by data-source (authoritative).
    const attribution: Record<string, number> = { AUTOFEED: 0, FILE: 0, API: 0, UI: 0, UNKNOWN: 0 };
    const dsBreakdown = new Map<string, { type: string; displayName: string; count: number }>();
    for (const a of annotated) {
      attribution[a.dataSourceType] = (attribution[a.dataSourceType] ?? 0) + 1;
      const key = a.row.dataSource ?? "unknown";
      const meta = a.row.dataSource ? dataSourceMeta.get(a.row.dataSource) : undefined;
      const cur = dsBreakdown.get(key) ?? { type: a.dataSourceType, displayName: meta?.displayName ?? "", count: 0 };
      cur.count++;
      dsBreakdown.set(key, cur);
    }

    // Source-pair matrix by normalizedLocalUuid.
    const uuidToSourceTypes = new Map<string, Set<string>>();
    for (const a of annotated) {
      if (!a.normalizedLocalUuid) continue;
      const s = uuidToSourceTypes.get(a.normalizedLocalUuid) ?? new Set<string>();
      s.add(a.dataSourceType);
      uuidToSourceTypes.set(a.normalizedLocalUuid, s);
    }
    const sourcePairMatrix = {
      FILE_only: 0, API_only: 0, AUTOFEED_only: 0,
      FILE_API: 0, FILE_AUTOFEED: 0, API_AUTOFEED: 0,
      ALL_THREE: 0, OTHER: 0,
    } as Record<string, number>;
    for (const s of uuidToSourceTypes.values()) {
      const has = (t: string) => s.has(t);
      const total = (has("FILE") ? 1 : 0) + (has("API") ? 1 : 0) + (has("AUTOFEED") ? 1 : 0);
      if (total === 3) sourcePairMatrix.ALL_THREE++;
      else if (has("FILE") && has("API") && !has("AUTOFEED")) sourcePairMatrix.FILE_API++;
      else if (has("FILE") && has("AUTOFEED") && !has("API")) sourcePairMatrix.FILE_AUTOFEED++;
      else if (has("API") && has("AUTOFEED") && !has("FILE")) sourcePairMatrix.API_AUTOFEED++;
      else if (has("FILE") && s.size === 1) sourcePairMatrix.FILE_only++;
      else if (has("API") && s.size === 1) sourcePairMatrix.API_only++;
      else if (has("AUTOFEED") && s.size === 1) sourcePairMatrix.AUTOFEED_only++;
      else sourcePairMatrix.OTHER++;
    }

    // Diagnose the prior 10/10 shadow miss:
    // For each requested `getpawsy_<uuid>`, check whether Merchant actually holds
    // the bare `<uuid>` variant (via annotated rows).
    const shadowSampleOfferIds = legacyRows
      .filter((l) => l.offerId.startsWith("getpawsy_"))
      .slice(0, 10)
      .map((l) => l.offerId);
    const shadowMissExplanation = shadowSampleOfferIds.map((rawOffer) => {
      const uuid = normalizeLocalUuid(rawOffer);
      const bareInMerchant = uuid
        ? annotated.find((a) => a.rawOfferId === uuid) ?? null
        : null;
      const prefixedInMerchant = annotated.find((a) => a.rawOfferId === rawOffer) ?? null;
      return {
        requestedOfferId: rawOffer,
        normalizedLocalUuid: uuid,
        prefixedFoundInMerchant: !!prefixedInMerchant,
        bareUuidFoundInMerchant: !!bareInMerchant,
        merchantResourceForBare: bareInMerchant?.row.resourceName ?? null,
        merchantDataSourceTypeForBare: bareInMerchant?.dataSourceType ?? null,
      };
    });

    // Totals.
    const uniqueMerchantResources = new Set(annotated.map((a) => a.row.resourceName)).size;
    const uniqueLocalUuidsRepresentedInMerchant = merchantLocalUuids.size;
    const uniqueLocalProductsRepresented = Array.from(merchantLocalUuids).filter((u) => localById.has(u)).length;
    const trueUnmappedMerchant = identity.MERCHANT_NO_LOCAL_MAPPING;

    const summary = {
      merchantApiV1Count: merchantRows.length,
      contentApiV21Count: legacyRows.length,
      localActiveCount: localById.size,
      identityBuckets: identity,
      legacyNoMerchantMapping: LEGACY_NO_MERCHANT_MAPPING,
      attribution,
      sourcePairMatrix,
      totals: {
        uniqueMerchantResources,
        uniqueLocalUuidsRepresentedInMerchant,
        uniqueLocalProductsRepresented,
        duplicateLocalIdentities: semanticDuplicates.length,
        trueUnmappedMerchant,
      },
    };

    // Trim per-product samples to keep payload safe (< ~200 KB).
    const merchantSample = annotated.slice(0, 200).map((a) => ({
      resourceName: a.row.resourceName,
      rawOfferId: a.rawOfferId,
      normalizedLocalUuid: a.normalizedLocalUuid,
      hasGetpawsyPrefix: a.hasGetpawsyPrefix,
      exactLocalProductExists: a.exactLocalProductExists,
      contentLanguage: a.row.contentLanguage,
      feedLabel: a.row.feedLabel,
      dataSource: a.row.dataSource,
      dataSourceType: a.dataSourceType,
      title: a.row.title?.slice(0, 120) ?? null,
      link: a.row.link,
      availability: a.row.availability,
      channel: a.row.channel,
    }));

    mlog("recon_ok", { corrId, ...summary });
    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      account,
      merchantApiVersion: "v1",
      summary,
      dataSources: Array.from(dsBreakdown.entries()).map(([name, v]) => ({ name, ...v })),
      merchantProductsSample: merchantSample,
      semanticDuplicates: semanticDuplicates.slice(0, 100),
      shadowMissExplanation,
      legacyEnumError,
      readOnly: true,
      mutations: 0,
    });
  } catch (e) {
    if (e instanceof MerchantApiClientError) {
      const errStage = e.stage || stage;
      mlog("recon_merchant_error", { corrId, stage: errStage, status: e.status, code: e.code });
      if (e.code === "reauth_required") return json({ ok: false, error: "merchant_reauth_required", stage: errStage }, 401);
      if (e.status === 403) return json({ ok: false, error: "forbidden", stage: errStage }, 403);
      if (e.status === 404) return json({ ok: false, error: "merchant_account_not_found", stage: errStage }, 404);
      return json({ ok: false, error: "reconciliation_error", stage: errStage, upstreamStatus: typeof e.status === "number" ? e.status : null }, 502);
    }
    const err = e as Error;
    mlog("recon_unexpected_exception", { corrId, stage, message: err?.message });
    return json({ ok: false, error: "internal_error", stage }, 500);
  }
});