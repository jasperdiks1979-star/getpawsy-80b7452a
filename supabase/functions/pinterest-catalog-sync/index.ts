import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FEED_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-feed?format=xml";
const DEFAULT_NAME = "GetPawsy Product Catalog";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin auth (when called from UI)
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userSb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u } = await userSb.auth.getUser();
      if (!u?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const { data: role } = await userSb.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      if (!role) return json({ ok: false, traceId, message: "forbidden" }, 403);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action || new URL(req.url).searchParams.get("action") || "status").toString();

    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token, scopes, account_id")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn?.access_token) {
      return json({ ok: false, traceId, code: "no_connection", message: "Pinterest not connected" }, 200);
    }

    const scopes = (conn.scopes || "").split(/\s+/);
    const hasCatalog = scopes.includes("catalogs:read") || scopes.includes("catalogs:write");
    if (!hasCatalog) {
      await sb.from("pinterest_catalog_status").update({
        feed_status: "scope_missing",
        last_error: "Missing catalogs:read / catalogs:write scope. Reconnect Pinterest.",
        last_checked_at: new Date().toISOString(),
      }).eq("id", 1);
      return json({
        ok: false,
        traceId,
        code: "scope_missing",
        message: "Pinterest connection is missing catalogs:read / catalogs:write scopes. Reconnect to grant them.",
      }, 200);
    }

    const apiBase = await getPinterestApiBase(sb);
    const headers = {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    };

    // ---------- REGISTER ----------
    if (action === "register") {
      // Check if a feed already exists for this URL
      const list = await fetch(`${apiBase}/catalogs/feeds`, { headers });
      const listJson = await list.json().catch(() => ({}));
      const existing = (listJson.items || []).find(
        (f: any) => f.location === FEED_URL,
      );

      let feedId = existing?.id;
      if (!feedId) {
        const create = await fetch(`${apiBase}/catalogs/feeds`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: DEFAULT_NAME,
            format: "XML",
            location: FEED_URL,
            catalog_type: "RETAIL",
            default_currency: "USD",
            default_locale: "en_US",
            default_country: "US",
            default_availability: "IN_STOCK",
          }),
        });
        const createJson = await create.json();
        if (!create.ok) {
          await sb.from("pinterest_catalog_status").update({
            feed_status: "create_failed",
            last_error: JSON.stringify(createJson).slice(0, 1000),
            last_checked_at: new Date().toISOString(),
            raw: createJson,
          }).eq("id", 1);
          return json({ ok: false, traceId, code: "create_failed", status: create.status, body: createJson }, 200);
        }
        feedId = createJson.id;
      }

      await sb.from("pinterest_catalog_status").update({
        feed_id: feedId,
        feed_url: FEED_URL,
        feed_status: "registered",
        last_checked_at: new Date().toISOString(),
      }).eq("id", 1);

      return json({ ok: true, traceId, feed_id: feedId, status: "registered" });
    }

    // ---------- STATUS ----------
    // Get latest known feed_id
    const { data: state } = await sb
      .from("pinterest_catalog_status")
      .select("feed_id, accepted_at")
      .eq("id", 1)
      .maybeSingle();

    let feedId = state?.feed_id;
    if (!feedId) {
      const list = await fetch(`${apiBase}/catalogs/feeds`, { headers });
      const listJson = await list.json().catch(() => ({}));
      const match = (listJson.items || []).find((f: any) => f.location === FEED_URL);
      feedId = match?.id;
    }

    if (!feedId) {
      return json({ ok: true, traceId, feed_status: "not_registered" });
    }

    // Fetch feed + latest processing result
    const [feedRes, prRes] = await Promise.all([
      fetch(`${apiBase}/catalogs/feeds/${feedId}`, { headers }),
      fetch(`${apiBase}/catalogs/feeds/${feedId}/processing_results?page_size=1`, { headers }),
    ]);
    const feedJson = await feedRes.json().catch(() => ({}));
    const prJson = await prRes.json().catch(() => ({}));
    const latest = (prJson.items || [])[0] || {};
    const procStatus = latest.status || "UNKNOWN";
    const product = latest.product_counts || {};
    const total = (product.original ?? product.in_stock ?? null);
    const invalid =
      (latest.validation_details?.errors?.length ?? 0) +
      (product.disapproved ?? 0);

    const accepted = ["COMPLETED", "PROCESSING_COMPLETED", "SUCCESS"].includes(procStatus);
    const patch: Record<string, unknown> = {
      feed_id: feedId,
      feed_url: FEED_URL,
      feed_status: feedJson.status || "unknown",
      processing_status: procStatus,
      items_total: total,
      items_invalid: invalid,
      last_error: latest.validation_details?.errors?.[0]?.message ?? null,
      last_checked_at: new Date().toISOString(),
      raw: { feed: feedJson, latest_result: latest },
    };
    if (accepted && !state?.accepted_at) patch.accepted_at = new Date().toISOString();

    await sb.from("pinterest_catalog_status").update(patch).eq("id", 1);

    return json({
      ok: true,
      traceId,
      feed_id: feedId,
      feed_status: patch.feed_status,
      processing_status: procStatus,
      accepted,
      items_total: total,
      items_invalid: invalid,
    });
  } catch (e: any) {
    console.error("[pinterest-catalog-sync]", traceId, e?.message);
    return json({ ok: false, traceId, message: e?.message || "error" }, 200);
  }
});