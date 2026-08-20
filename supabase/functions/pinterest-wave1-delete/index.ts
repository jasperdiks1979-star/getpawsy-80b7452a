// pinterest-wave1-delete — Wave 1 REMOVE_CANDIDATE permanent delete.
// Hard allowlist of exactly 11 pin IDs. No PATCH, no create, no board mutation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Wave 1 allowlist — resolved from GETPAWSY_PINTEREST_RECOVERY_AUDIT_CURRENT.csv
const ALLOWLIST = new Set([
  "1117103882601918543",
  "1117103882600965344",
  "1117103882600961744",
  "1117103882600961741",
  "1117103882600184105",
  "1117103882598772135",
  "1117103882598769655",
  "1117103882598238272",
  "1117103882598237555",
  "1117103882598234172",
  "1117103882597964250",
]);

async function conn() {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await sb
    .from("pinterest_connection")
    .select("account_name, access_token, scopes, status, token_expires_at")
    .in("status", ["connected", "auth_failed"])
    .order("token_expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const c = await conn();
    if (!c?.access_token) return json({ ok: false, error: "no_connection" }, 500);
    const auth = { Authorization: `Bearer ${c.access_token}` };
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "capability") {
      const r = await fetch(`${PIN_API}/user_account`, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({
        ok: r.ok,
        status: r.status,
        account: j,
        scopes: c.scopes,
        connection_status: c.status,
        token_expires_at: c.token_expires_at,
        allowlist_size: ALLOWLIST.size,
      });
    }

    if (action === "get_pin") {
      const r = await fetch(`${PIN_API}/pins/${body.pin_id}`, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, pin: j });
    }

    if (action === "pin_analytics") {
      const u = `${PIN_API}/pins/${body.pin_id}/analytics?start_date=${body.start_date}&end_date=${body.end_date}` +
        `&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE&app_types=ALL`;
      const r = await fetch(u, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, data: j });
    }

    if (action === "account_analytics") {
      const u = `${PIN_API}/user_account/analytics?start_date=${body.start_date}&end_date=${body.end_date}` +
        `&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE&granularity=DAY`;
      const r = await fetch(u, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, data: j });
    }

    // READ-ONLY: bulk multi-pin analytics (max 100 ids per call)
    if (action === "pins_analytics_bulk") {
      const ids = (body.pin_ids ?? []) as string[];
      const u = `${PIN_API}/pins/analytics?pin_ids=${ids.join(",")}` +
        `&start_date=${body.start_date}&end_date=${body.end_date}` +
        `&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE&app_types=ALL`;
      const r = await fetch(u, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, retry_after: r.headers.get("retry-after"), data: j });
    }

    if (action === "list_boards") {
      const items: unknown[] = [];
      let bm = "";
      for (let i = 0; i < 10; i++) {
        const r = await fetch(`${PIN_API}/boards?page_size=100${bm ? `&bookmark=${encodeURIComponent(bm)}` : ""}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, status: r.status, j });
        items.push(...(j.items ?? []));
        bm = j.bookmark ?? "";
        if (!bm) break;
      }
      return json({ ok: true, count: items.length, boards: items });
    }

    if (action === "count_pins") {
      let total = 0;
      const ids: string[] = [];
      let bm = "";
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`${PIN_API}/pins?page_size=100${bm ? `&bookmark=${encodeURIComponent(bm)}` : ""}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, status: r.status, j, total });
        const items = (j.items ?? []) as { id: string }[];
        total += items.length;
        ids.push(...items.map((p) => p.id));
        bm = j.bookmark ?? "";
        if (!bm) break;
      }
      return json({ ok: true, total, ids });
    }

    // READ-ONLY: full pin listing with metadata (id, created_at, link, board_id, title)
    if (action === "list_pins_full") {
      const items: Record<string, unknown>[] = [];
      let bm = "";
      for (let i = 0; i < 40; i++) {
        const r = await fetch(
          `${PIN_API}/pins?page_size=100&pin_metrics=false${bm ? `&bookmark=${encodeURIComponent(bm)}` : ""}`,
          { headers: auth },
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, status: r.status, j, count: items.length });
        for (const p of (j.items ?? []) as Record<string, unknown>[]) {
          items.push({
            id: p.id,
            created_at: p.created_at,
            link: p.link,
            board_id: p.board_id,
            title: p.title,
          });
        }
        bm = j.bookmark ?? "";
        if (!bm) break;
      }
      return json({ ok: true, count: items.length, pins: items });
    }

    if (action === "delete_pin") {
      const pinId = String(body.pin_id ?? "");
      if (!ALLOWLIST.has(pinId)) return json({ ok: false, error: "not_in_wave1_allowlist", pin_id: pinId }, 403);
      const r = await fetch(`${PIN_API}/pins/${pinId}`, { method: "DELETE", headers: auth });
      const text = await r.text().catch(() => "");
      return json({
        ok: r.status === 204 || r.status === 200,
        status: r.status,
        retry_after: r.headers.get("retry-after"),
        body: text.slice(0, 500),
        pin_id: pinId,
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
