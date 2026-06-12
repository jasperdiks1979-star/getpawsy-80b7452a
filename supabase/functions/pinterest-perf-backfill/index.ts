import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

type PinRow = { pin_id: string; product_id: string | null; product_slug: string | null };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Shared global pacing — when Pinterest signals 429, all workers pause until this timestamp.
let globalPauseUntil = 0;
let retry429 = 0, retry5xx = 0, retryNet = 0;

async function fetchWithBackoff(url: string, token: string, maxAttempts = 5): Promise<Response | null> {
  let attempt = 0;
  let lastStatus = 0;
  while (attempt < maxAttempts) {
    const now = Date.now();
    if (globalPauseUntil > now) await sleep(globalPauseUntil - now);
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      lastStatus = r.status;
      if (r.status === 429) {
        retry429++;
        const ra = Number(r.headers.get("retry-after") ?? "0");
        const waitMs = (ra > 0 ? ra * 1000 : Math.min(2000 * Math.pow(2, attempt), 30000))
                       + Math.floor(Math.random() * 500);
        globalPauseUntil = Math.max(globalPauseUntil, Date.now() + waitMs);
        // Drain body to free the connection
        try { await r.body?.cancel(); } catch { /* ignore */ }
        attempt++;
        continue;
      }
      if (r.status >= 500 && r.status <= 599) {
        retry5xx++;
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 15000) + Math.floor(Math.random() * 400);
        try { await r.body?.cancel(); } catch { /* ignore */ }
        await sleep(waitMs);
        attempt++;
        continue;
      }
      return r;
    } catch {
      retryNet++;
      const waitMs = Math.min(800 * Math.pow(2, attempt), 10000) + Math.floor(Math.random() * 300);
      await sleep(waitMs);
      attempt++;
    }
  }
  // Exhausted — return a synthetic non-ok response so caller treats as error
  return new Response(null, { status: lastStatus || 599 });
}

async function fetchAnalytics(base: string, token: string, pinId: string, startDay: string, endDay: string) {
  const url = `${base}/v5/pins/${pinId}/analytics?start_date=${startDay}&end_date=${endDay}&metric_types=IMPRESSION,OUTBOUND_CLICK,SAVE,PIN_CLICK`;
  const r = await fetchWithBackoff(url, token);
  if (!r) return { gone: false, m: null as null, error: "no_response" };
  if (r.status === 404 || r.status === 410) return { gone: true, m: null as null };
  if (!r.ok) return { gone: false, m: null as null, error: `${r.status}` };
  const json = await r.json() as { all?: { daily_metrics?: Array<{ metrics?: Record<string, number> }>; lifetime_metrics?: Record<string, number> } };
  let imp = 0, out = 0, sav = 0, clk = 0;
  const lt = json?.all?.lifetime_metrics;
  if (lt) {
    imp = Number(lt.IMPRESSION ?? 0);
    out = Number(lt.OUTBOUND_CLICK ?? 0);
    sav = Number(lt.SAVE ?? 0);
    clk = Number(lt.PIN_CLICK ?? 0);
  } else {
    for (const d of json?.all?.daily_metrics ?? []) {
      const m = d.metrics ?? {};
      imp += Number(m.IMPRESSION ?? 0);
      out += Number(m.OUTBOUND_CLICK ?? 0);
      sav += Number(m.SAVE ?? 0);
      clk += Number(m.PIN_CLICK ?? 0);
    }
  }
  return { gone: false, m: { impressions: imp, clicks: clk + out, outbound_clicks: out, saves: sav } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    // Reset per-invocation retry counters
    retry429 = 0; retry5xx = 0; retryNet = 0; globalPauseUntil = 0;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "400"), 1000);
    const minSlugRepeat = Number(url.searchParams.get("min_slug_repeat") ?? "10");
    const lookbackDays = Number(url.searchParams.get("lookback_days") ?? "90");
    const dryRun = url.searchParams.get("dry_run") === "1";
    const concurrency = Math.max(1, Math.min(Number(url.searchParams.get("concurrency") ?? "2"), 6));
    const baseDelay = Math.max(0, Number(url.searchParams.get("delay_ms") ?? "250"));

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: conn } = await sb.from("pinterest_connection").select("access_token").limit(1).maybeSingle();
    const token = (conn as { access_token?: string } | null)?.access_token;
    if (!token) return new Response(JSON.stringify({ ok: false, traceId, message: "no pinterest token" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: rt } = await sb.from("pinterest_runtime_settings").select("api_mode").limit(1).maybeSingle();
    const base = ((rt as { api_mode?: string } | null)?.api_mode ?? "production") === "sandbox"
      ? "https://api-sandbox.pinterest.com" : "https://api.pinterest.com";

    // Eligible pins: posted with slug_repeat >= N, no row in pinterest_pin_performance
    const { data: candidates, error: cErr } = await sb.rpc("exec_sql_readonly", {}).then(() => ({ data: null, error: null })).catch(() => ({ data: null, error: null }));
    // Fallback: do it client-side via two queries (rpc not guaranteed).
    void cErr; void candidates;

    // Paginated fetch — PostgREST caps responses at 1000 rows by default.
    const pageSize = 1000;
    const maxPages = 20; // safety cap → 20k pins
    const rows: Array<{ pin_external_id: string; product_id: string | null; product_slug: string | null }> = [];
    let pages = 0;
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data: chunkRows, error: pErr } = await sb
        .from("pinterest_pin_queue")
        .select("pin_external_id,product_id,product_slug")
        .eq("status", "posted")
        .not("pin_external_id", "is", null)
        .order("pin_external_id", { ascending: true })
        .range(from, to);
      if (pErr) break;
      const batch = (chunkRows ?? []) as typeof rows;
      rows.push(...batch);
      pages++;
      if (batch.length < pageSize) break;
    }
    const slugCounts = new Map<string, number>();
    for (const r of rows) if (r.product_slug) slugCounts.set(r.product_slug, (slugCounts.get(r.product_slug) ?? 0) + 1);

    const dupeRows = rows.filter(r => r.product_slug && (slugCounts.get(r.product_slug) ?? 0) >= minSlugRepeat);
    const pinIds = dupeRows.map(r => r.pin_external_id);

    // Find which pin_ids already have performance rows
    const have = new Set<string>();
    const chunk = 500;
    for (let i = 0; i < pinIds.length; i += chunk) {
      const slice = pinIds.slice(i, i + chunk);
      const { data: existing } = await sb.from("pinterest_pin_performance").select("pin_id").in("pin_id", slice);
      for (const e of (existing ?? []) as { pin_id: string }[]) have.add(e.pin_id);
    }
    const missing: PinRow[] = dupeRows
      .filter(r => !have.has(r.pin_external_id))
      .map(r => ({ pin_id: r.pin_external_id, product_id: r.product_id, product_slug: r.product_slug }));

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, traceId, dry_run: true, eligible: pinIds.length, missing: missing.length, will_process: Math.min(missing.length, limit) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = missing.slice(0, limit);
    const startDay = isoDay(new Date(Date.now() - lookbackDays * 86400000));
    const endDay = isoDay(new Date());

    let synced = 0, zero = 0, gone = 0, errors = 0;
    let idx = 0;
    async function worker() {
      while (idx < target.length) {
        const my = idx++;
        const row = target[my];
        try {
          const res = await fetchAnalytics(base, token, row.pin_id, startDay, endDay);
          if (res.gone) {
            gone++;
            await sb.from("pinterest_pin_performance").upsert({
              pin_id: row.pin_id,
              product_id: row.product_id ?? row.product_slug ?? "unknown",
              impressions: 0, clicks: 0, saves: 0, ctr: 0,
              status: "gone_on_pinterest",
            }, { onConflict: "pin_id" });
            continue;
          }
          if (!res.m) { errors++; continue; }
          const m = res.m;
          const ctr = m.impressions > 0 ? Math.min(m.clicks / m.impressions, 9.9999) : 0;
          await sb.from("pinterest_pin_performance").upsert({
            pin_id: row.pin_id,
            product_id: row.product_id ?? row.product_slug ?? "unknown",
            impressions: m.impressions,
            clicks: m.clicks,
            saves: m.saves,
            ctr,
            status: "active",
          }, { onConflict: "pin_id" });
          synced++;
          if (m.impressions === 0 && m.saves === 0 && m.outbound_clicks === 0) zero++;
        } catch {
          errors++;
        }
        // Per-request pacing + small jitter to avoid lock-step
        await sleep(baseDelay + Math.floor(Math.random() * 120));
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));

    return new Response(JSON.stringify({
      ok: true, traceId,
      pages_scanned: pages,
      total_posted_scanned: rows.length,
      eligible_dupes: pinIds.length,
      missing_before: missing.length,
      processed: target.length,
      synced, zero_engagement: zero, gone_on_pinterest: gone, errors,
      retries: { rate_limit_429: retry429, server_5xx: retry5xx, network: retryNet },
      concurrency, delay_ms: baseDelay,
      remaining_missing: Math.max(missing.length - target.length, 0),
      window: { start: startDay, end: endDay, days: lookbackDays },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});