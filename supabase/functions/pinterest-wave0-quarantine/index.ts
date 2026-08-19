// Wave 0 quarantine helper. Allowed mutations: create ONE secret board and
// move pins between boards (PATCH board_id only). No deletes, no link/title/
// description edits, no new pins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function token() {
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
    const conn = await token();
    if (!conn?.access_token) return json({ ok: false, error: "no_connection" }, 500);
    const auth = { Authorization: `Bearer ${conn.access_token}` };
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "create_secret_board") {
      const name = String(body.name ?? "");
      if (!name) return json({ ok: false, error: "name_required" }, 400);
      const r = await fetch(`${PIN_API}/boards`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: body.description ?? "", privacy: body.privacy ?? "PROTECTED" }),
      });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, board: j });
    }

    if (action === "get_board") {
      const r = await fetch(`${PIN_API}/boards/${body.board_id}`, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, board: j });
    }

    if (action === "get_pin") {
      const r = await fetch(`${PIN_API}/pins/${body.pin_id}`, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, pin: j });
    }

    if (action === "list_board_pins") {
      const items: unknown[] = [];
      let bm = "";
      for (let i = 0; i < 20; i++) {
        const r = await fetch(
          `${PIN_API}/boards/${body.board_id}/pins?page_size=100${bm ? `&bookmark=${encodeURIComponent(bm)}` : ""}`,
          { headers: auth },
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, status: r.status, j, items });
        items.push(...(j.items ?? []));
        bm = j.bookmark ?? "";
        if (!bm) break;
      }
      return json({ ok: true, count: items.length, ids: (items as { id: string }[]).map((p) => p.id) });
    }

    if (action === "account_analytics") {
      const u = `${PIN_API}/user_account/analytics?start_date=${body.start_date}&end_date=${body.end_date}&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE&granularity=DAY`;
      const r = await fetch(u, { headers: auth });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, data: j });
    }

    if (action === "move_pin") {
      const pinId = String(body.pin_id ?? "");
      const target = String(body.board_id ?? "");
      if (!pinId || !target) return json({ ok: false, error: "pin_and_board_required" }, 400);
      // Only board_id is sent: no link, title or description mutation.
      const r = await fetch(`${PIN_API}/pins/${pinId}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ board_id: target }),
      });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, status: r.status, pin: j });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
