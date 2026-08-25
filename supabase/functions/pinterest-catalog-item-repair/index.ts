import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Narrow, feed-only Pinterest catalog utility.
 *
 * action=audit   → read-only: reports whether a given item_id exists in the
 *                  Pinterest catalog and the current feed processing state.
 * action=repair  → upserts ONLY the given item_id into the catalog via the
 *                  Catalogs Items API and sets a daily feed processing
 *                  schedule so the feed no longer goes stale.
 *
 * Does not create/edit pins, campaigns, prices, inventory or the storefront.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const API = "https://api.pinterest.com/v5";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const action = String(body.action ?? url.searchParams.get("action") ?? "audit");
    const itemId = String(body.item_id ?? url.searchParams.get("item_id") ?? "");
    if (!itemId) return json({ ok: false, message: "item_id required" }, 400);

    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token) return json({ ok: false, code: "no_connection" }, 200);

    const headers = {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    };

    const { data: status } = await sb
      .from("pinterest_catalog_status")
      .select("feed_id, feed_url")
      .eq("id", 1)
      .maybeSingle();
    const feedId = status?.feed_id;

    // --- current catalog state for this item ---
    const itemRes = await fetch(
      `${API}/catalogs/items?country=US&language=en&item_ids=${encodeURIComponent(itemId)}`,
      { headers },
    );
    const itemJson = await itemRes.json().catch(() => ({}));

    const feedRes = feedId
      ? await fetch(`${API}/catalogs/feeds/${feedId}`, { headers })
      : null;
    const feedJson = feedRes ? await feedRes.json().catch(() => ({})) : null;

    if (action === "audit") {
      return json({
        ok: true,
        action,
        item_id: itemId,
        item_lookup_status: itemRes.status,
        item_lookup: itemJson,
        feed_id: feedId,
        feed: feedJson,
      });
    }

    if (action !== "repair") return json({ ok: false, message: "unknown action" }, 400);

    // --- source of truth: the live product row (no mutation) ---
    const { data: p } = await sb
      .from("products")
      .select("id, name, slug, description, price, category, image_url, stock, is_active")
      .eq("id", itemId)
      .maybeSingle();
    if (!p || !p.is_active || !(p.stock ?? 0) > 0) {
      return json({ ok: false, message: "product not eligible in source", product: p }, 200);
    }

    const upsertBody = {
      country: "US",
      language: "en",
      operation: "UPSERT",
      items: [
        {
          item_id: p.id,
          attributes: {
            title: p.name,
            description: (p.description || p.name || "").slice(0, 500),
            link: `https://getpawsy.pet/products/${p.slug}`,
            image_link: [p.image_url],
            availability: "IN_STOCK",
            price: `${Number(p.price).toFixed(2)} USD`,
            condition: "NEW",
            brand: "GetPawsy",
            google_product_category: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture",
            product_type: p.category || "Pet Products",
          },
        },
      ],
    };

    const upsertRes = await fetch(`${API}/catalogs/items`, {
      method: "POST",
      headers,
      body: JSON.stringify(upsertBody),
    });
    const upsertJson = await upsertRes.json().catch(() => ({}));

    // --- keep the feed fresh: daily processing schedule ---
    let schedulePatch: unknown = null;
    if (feedId) {
      const patchRes = await fetch(`${API}/catalogs/feeds/${feedId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          preferred_processing_schedule: { time: "03:00", timezone: "America/Los_Angeles" },
        }),
      });
      schedulePatch = { status: patchRes.status, body: await patchRes.json().catch(() => ({})) };
    }

    // --- verify ---
    const verifyRes = await fetch(
      `${API}/catalogs/items?country=US&language=en&item_ids=${encodeURIComponent(itemId)}`,
      { headers },
    );
    const verifyJson = await verifyRes.json().catch(() => ({}));

    return json({
      ok: upsertRes.ok,
      action,
      item_id: itemId,
      upsert_status: upsertRes.status,
      upsert: upsertJson,
      schedule_patch: schedulePatch,
      verify_status: verifyRes.status,
      verify: verifyJson,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
