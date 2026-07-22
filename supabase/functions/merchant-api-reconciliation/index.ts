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
        const type = d.fileInput ? "FILE"
          : d.primaryProductDataSource ? (typeof (d.primaryProductDataSource as Record<string, unknown>).defaultRule === "object" ? "AUTOFEED" : "API")
          : "UNKNOWN";
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

    // ── 5. Compute overlap totals ────────────────────────────────────────
    stage = "reconcile";
    const merchantOfferIds = new Set(merchantRows.map((r) => r.offerId).filter(Boolean));
    const legacyOfferIds = new Set(legacyRows.map((r) => r.offerId).filter(Boolean));

    // 1. Exact offerId match between Content API v2.1 and Merchant API v1
    let exactOfferMatch = 0;
    for (const oid of legacyOfferIds) if (merchantOfferIds.has(oid)) exactOfferMatch++;

    // 2. Same local product matched through a different offerId.
    //    Local offerIds follow the `getpawsy_<uuid>` convention. Count local
    //    products whose canonical offerId is missing from Merchant, but where
    //    at least one Merchant offerId contains the local UUID (indirect match).
    let sameLocalDifferentOfferId = 0;
    for (const local of localById.values()) {
      const canonical = `getpawsy_${local.id}`;
      if (merchantOfferIds.has(canonical)) continue;
      const alt = merchantRows.find((m) => m.offerId.includes(local.id));
      if (alt) sameLocalDifferentOfferId++;
    }

    // 3-5. Merchant API attribution by data-source type.
    const attribution = { AUTOFEED: 0, FILE: 0, API: 0, UNKNOWN: 0 } as Record<string, number>;
    const dsBreakdown = new Map<string, { type: string; displayName: string; count: number }>();
    for (const m of merchantRows) {
      const meta = m.dataSource ? dataSourceMeta.get(m.dataSource) : undefined;
      const t = meta?.type ?? "UNKNOWN";
      attribution[t] = (attribution[t] ?? 0) + 1;
      const key = m.dataSource ?? "unknown";
      const cur = dsBreakdown.get(key) ?? { type: t, displayName: meta?.displayName ?? "", count: 0 };
      cur.count++;
      dsBreakdown.set(key, cur);
    }

    // 6. Legacy Content API product absent from Merchant API.
    let legacyMissingFromMerchant = 0;
    for (const oid of legacyOfferIds) if (!merchantOfferIds.has(oid)) legacyMissingFromMerchant++;

    // 7. Merchant API product with no local mapping.
    let merchantNoLocalMapping = 0;
    for (const m of merchantRows) {
      const uuidMatch = m.offerId.startsWith("getpawsy_") ? m.offerId.slice("getpawsy_".length) : "";
      if (!uuidMatch || !localById.has(uuidMatch)) merchantNoLocalMapping++;
    }

    // 8. Duplicate products across data sources (same offerId, ≥2 dataSource).
    const offerToSources = new Map<string, Set<string>>();
    for (const m of merchantRows) {
      if (!m.offerId) continue;
      const s = offerToSources.get(m.offerId) ?? new Set<string>();
      s.add(m.dataSource ?? "unknown");
      offerToSources.set(m.offerId, s);
    }
    let duplicatesAcrossSources = 0;
    for (const s of offerToSources.values()) if (s.size > 1) duplicatesAcrossSources++;

    // 9. Differences in language/feedLabel (per shared offerId).
    let langOrFeedLabelDivergence = 0;
    const merchantByOffer = new Map<string, MerchantRow>();
    for (const m of merchantRows) if (m.offerId && !merchantByOffer.has(m.offerId)) merchantByOffer.set(m.offerId, m);
    for (const l of legacyRows) {
      const m = merchantByOffer.get(l.offerId);
      if (!m) continue;
      const langDiff = l.contentLanguage && m.contentLanguage && l.contentLanguage !== m.contentLanguage;
      const feedDiff = l.targetCountry && m.feedLabel && l.targetCountry !== m.feedLabel;
      if (langDiff || feedDiff) langOrFeedLabelDivergence++;
    }

    // 10. Differences caused by obsolete slugs or URLs.
    let obsoleteLinkDivergence = 0;
    for (const m of merchantRows) {
      const uuid = m.offerId.startsWith("getpawsy_") ? m.offerId.slice("getpawsy_".length) : "";
      const local = uuid ? localById.get(uuid) : undefined;
      if (!local || !m.link) continue;
      if (!m.link.includes(`/${local.slug}`)) obsoleteLinkDivergence++;
    }

    const summary = {
      merchantApiV1Count: merchantRows.length,
      contentApiV21Count: legacyRows.length,
      localActiveCount: localById.size,
      counts: {
        exactOfferMatch,
        sameLocalDifferentOfferId,
        attribution,
        legacyMissingFromMerchant,
        merchantNoLocalMapping,
        duplicatesAcrossSources,
        langOrFeedLabelDivergence,
        obsoleteLinkDivergence,
      },
    };

    // Trim per-product samples to keep payload safe (< ~200 KB).
    const merchantSample = merchantRows.slice(0, 200).map((m) => ({
      resourceName: m.resourceName,
      offerId: m.offerId,
      contentLanguage: m.contentLanguage,
      feedLabel: m.feedLabel,
      dataSource: m.dataSource,
      dataSourceType: (m.dataSource ? dataSourceMeta.get(m.dataSource)?.type : null) ?? null,
      title: m.title?.slice(0, 120) ?? null,
      link: m.link,
      availability: m.availability,
      channel: m.channel,
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