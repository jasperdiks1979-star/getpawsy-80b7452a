import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============= JWT / GSC AUTH =============

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const b64 = (s: string) =>
    btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = b64(JSON.stringify(header));
  const payloadB64 = b64(JSON.stringify(payload));
  const signatureInput = `${headerB64}.${payloadB64}`;

  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c: string) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signatureInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signatureInput}.${sigB64}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ============= GSC QUERY FETCH (paginated) =============

interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function fetchAllQueryRows(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<GSCRow[]> {
  const allRows: GSCRow[] = [];
  let startRow = 0;
  const ROW_LIMIT = 25000;

  while (true) {
    const body = {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: ROW_LIMIT,
      startRow,
    };

    console.log(`[GSC-KI] Fetching rows ${startRow}–${startRow + ROW_LIMIT}...`);

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GSC API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const rows: GSCRow[] = data.rows || [];
    allRows.push(...rows);

    console.log(`[GSC-KI] Got ${rows.length} rows (total: ${allRows.length})`);

    if (rows.length < ROW_LIMIT) break;
    startRow += ROW_LIMIT;

    // Safety cap: 100k rows max
    if (allRows.length >= 100000) {
      console.warn("[GSC-KI] Hit 100k row safety cap");
      break;
    }
  }

  return allRows;
}

// ============= DUTCH DETECTION =============

const DUTCH_WORDS = new Set([
  "hond", "kat", "huisdier", "dieren", "beste", "kopen", "voor", "van",
  "het", "een", "met", "uit", "ook", "nog", "naar", "maar", "bij",
  "niet", "wel", "zijn", "hebben", "wordt", "deze", "meer", "alle",
  "hondenvoer", "kattenvoer", "speelgoed", "honden", "katten",
  "puppy", "kitten", "dierenwinkel", "voeding", "verzorging",
  "wandelen", "riem", "mand", "bench", "brokken",
]);

function isDutchQuery(query: string): boolean {
  const words = query.toLowerCase().split(/\s+/);
  const dutchCount = words.filter((w) => DUTCH_WORDS.has(w)).length;
  // If >40% of words are Dutch, flag it
  return words.length > 0 && dutchCount / words.length > 0.4;
}

// ============= PRODUCT SLUG PATTERN =============

function isProductSlugQuery(query: string): boolean {
  // Detect queries that look like product slugs rather than real search queries
  // e.g. "premium-orthopedic-dog-bed-xl" vs "best dog bed for large dogs"
  const slug = query.toLowerCase().trim();
  if (slug.split("-").length >= 5 && !slug.includes(" ")) return true;
  return false;
}

// ============= INTENT CLASSIFICATION =============

type Intent = "informational" | "commercial" | "transactional" | "navigational";

function classifyIntent(query: string): Intent {
  const q = query.toLowerCase();
  if (/\b(buy|order|price|cheap|discount|coupon|deal|sale|shop)\b/.test(q)) return "transactional";
  if (/\b(best|top|review|compare|vs|alternative|recommend)\b/.test(q)) return "commercial";
  if (/\b(getpawsy|pawsy)\b/.test(q)) return "navigational";
  return "informational";
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseServiceKey);

    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ============= ACTION: sync_keywords =============
    if (action === "sync_keywords") {
      const SITE_URL = "sc-domain:getpawsy.pet";
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 3); // GSC data delay
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 28); // 28-day window
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const startStr = fmt(startDate);
      const endStr = fmt(endDate);

      console.log(`[GSC-KI] Syncing real queries ${startStr} → ${endStr}`);

      const accessToken = await getAccessToken(serviceAccountJson);
      const rows = await fetchAllQueryRows(accessToken, SITE_URL, startStr, endStr);

      console.log(`[GSC-KI] Total raw rows from GSC: ${rows.length}`);

      if (rows.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            totalRawRows: 0,
            upserted: 0,
            message: "GSC returned 0 query rows",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Transform to gsc_keywords records
      const records = rows.map((r) => ({
        query: r.keys[0],
        page: r.keys[1],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 10000) / 10000,
        position: Math.round(r.position * 100) / 100,
        sync_date: endStr,
      }));

      // Batch upsert (chunks of 500)
      let upserted = 0;
      const CHUNK = 500;
      for (let i = 0; i < records.length; i += CHUNK) {
        const chunk = records.slice(i, i + CHUNK);
        const { error } = await db
          .from("gsc_keywords")
          .upsert(chunk, { onConflict: "query,page,sync_date" });

        if (error) {
          console.error(`[GSC-KI] Upsert error at chunk ${i}:`, error.message);
        } else {
          upserted += chunk.length;
        }
      }

      console.log(`[GSC-KI] Upserted ${upserted} keyword rows`);

      return new Response(
        JSON.stringify({
          ok: true,
          totalRawRows: rows.length,
          upserted,
          dateRange: { start: startStr, end: endStr },
          systemIntegrity: "REAL_QUERY_MODE_ACTIVE",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= ACTION: analyze =============
    if (action === "analyze") {
      // Read all synced keywords from gsc_keywords
      const { data: allKeywords, error: fetchErr } = await db
        .from("gsc_keywords")
        .select("query, page, clicks, impressions, ctr, position, sync_date")
        .order("sync_date", { ascending: false })
        .limit(10000);

      if (fetchErr) throw fetchErr;

      const keywords = allKeywords || [];
      const totalKeywordsTracked = keywords.length;

      if (totalKeywordsTracked === 0) {
        return new Response(
          JSON.stringify({
            totalKeywordsTracked: 0,
            realQueriesCaptured: 0,
            yellowZoneQualified_strict: 0,
            yellowZoneQualified_relaxed: 0,
            breakoutContentTargets: [],
            safePushActivated: false,
            projectedTop10Lift: 0,
            reason: "NO_DATA_SYNCED",
            systemIntegrity: "REAL_QUERY_MODE_ACTIVE",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduplicate: keep latest sync_date per query+page
      const latestMap = new Map<string, typeof keywords[0]>();
      for (const kw of keywords) {
        const key = `${kw.query}|||${kw.page}`;
        const existing = latestMap.get(key);
        if (!existing || kw.sync_date > existing.sync_date) {
          latestMap.set(key, kw);
        }
      }
      const latest = Array.from(latestMap.values());
      const realQueriesCaptured = latest.length;

      // ---- YELLOW ZONE FILTER ----

      // Strict: pos 11–20, impressions >= 20, English only, no product slugs
      const yellowStrict = latest.filter(
        (kw) =>
          kw.position >= 11 &&
          kw.position <= 20 &&
          kw.impressions >= 20 &&
          !isDutchQuery(kw.query) &&
          !isProductSlugQuery(kw.query)
      );

      // Relaxed: pos 11–30, impressions >= 10
      const yellowRelaxed = latest.filter(
        (kw) =>
          kw.position >= 11 &&
          kw.position <= 30 &&
          kw.impressions >= 10 &&
          !isDutchQuery(kw.query) &&
          !isProductSlugQuery(kw.query)
      );

      // Sort by impressions desc
      yellowStrict.sort((a, b) => b.impressions - a.impressions);
      yellowRelaxed.sort((a, b) => b.impressions - a.impressions);

      // ---- NEEDLE MOVER DETECTION (Phase 3) ----

      const needleMovers = latest.filter(
        (kw) =>
          kw.impressions >= 150 &&
          kw.position > 30 &&
          !isDutchQuery(kw.query) &&
          !isProductSlugQuery(kw.query) &&
          classifyIntent(kw.query) === "informational"
      );

      // Cluster by theme (simple word overlap)
      const themes: Record<string, { queries: string[]; totalImpressions: number }> = {};
      for (const kw of needleMovers) {
        const words = kw.query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        const themeKey = words.slice(0, 3).sort().join(" ") || kw.query;
        if (!themes[themeKey]) themes[themeKey] = { queries: [], totalImpressions: 0 };
        themes[themeKey].queries.push(kw.query);
        themes[themeKey].totalImpressions += kw.impressions;
      }

      const breakoutContentTargets = Object.entries(themes)
        .sort((a, b) => b[1].totalImpressions - a[1].totalImpressions)
        .slice(0, 10)
        .map(([theme, data]) => ({
          theme,
          queries: data.queries.slice(0, 5),
          totalImpressions: data.totalImpressions,
          intent: "informational" as const,
          recommendation: `Create comprehensive guide targeting "${data.queries[0]}" cluster`,
        }));

      // ---- SAFE PUSH DECISION ----

      const safePushActivated = yellowStrict.length >= 10;
      let projectedTop10Lift = 0;
      let estimatedCTRIncrease = 0;

      if (safePushActivated) {
        // Conservative estimate: 30% of strict targets could move to top 10
        projectedTop10Lift = Math.round(yellowStrict.length * 0.3);
        // Average CTR increase from pos 15→8 is roughly 3x
        const currentAvgCTR =
          yellowStrict.reduce((s, k) => s + k.ctr, 0) / yellowStrict.length;
        estimatedCTRIncrease = Math.round(currentAvgCTR * 2.5 * 10000) / 100; // percentage
      }

      const report = {
        totalKeywordsTracked,
        realQueriesCaptured,
        yellowZoneQualified_strict: yellowStrict.length,
        yellowZoneQualified_relaxed: yellowRelaxed.length,
        yellowZoneTargets_strict: yellowStrict.slice(0, 30).map((kw) => ({
          query: kw.query,
          page: kw.page,
          position: kw.position,
          impressions: kw.impressions,
          clicks: kw.clicks,
          ctr: kw.ctr,
          intent: classifyIntent(kw.query),
        })),
        yellowZoneTargets_relaxed: yellowRelaxed.slice(0, 30).map((kw) => ({
          query: kw.query,
          page: kw.page,
          position: kw.position,
          impressions: kw.impressions,
          clicks: kw.clicks,
          ctr: kw.ctr,
          intent: classifyIntent(kw.query),
        })),
        breakoutContentTargets,
        safePushActivated,
        projectedTop10Lift,
        estimatedCTRIncrease,
        reason: safePushActivated
          ? "SUFFICIENT_DATA_FOR_SAFE_PUSH"
          : "INSUFFICIENT_DATA_FOR_SAFE_PUSH",
        systemIntegrity: "REAL_QUERY_MODE_ACTIVE",
      };

      return new Response(JSON.stringify(report), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============= ACTION: get_keywords (raw data view) =============
    if (action === "get_keywords") {
      const limit = body.limit || 100;
      const minImpressions = body.min_impressions || 0;
      const positionMin = body.position_min || 0;
      const positionMax = body.position_max || 100;

      let query = db
        .from("gsc_keywords")
        .select("query, page, clicks, impressions, ctr, position, sync_date")
        .gte("impressions", minImpressions)
        .gte("position", positionMin)
        .lte("position", positionMax)
        .order("impressions", { ascending: false })
        .limit(limit);

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ keywords: data || [], count: data?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid action. Valid: sync_keywords, analyze, get_keywords",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[GSC-KI] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
