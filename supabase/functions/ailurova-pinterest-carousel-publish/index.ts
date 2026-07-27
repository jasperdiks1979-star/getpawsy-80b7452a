// One-off manual Pinterest CAROUSEL publisher for the Ailurova XL Litter Box.
// Publishes a single organic multi-image Pin (2-5 slides) to the connected
// GetPawsy Pinterest business account and reads it back.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as any));
    const {
      items,               // [{ image_b64, title?, description?, link? }] length 2..5
      title, description, link, alt_text,
      board_name_preferred, board_id_hint,
      required_username = "getpawsyshop",
      dry_run = false,
    } = body ?? {};
    if (!Array.isArray(items) || items.length < 2 || items.length > 5)
      return json({ ok: false, error: "items_must_be_2_to_5" }, 400);
    if (!title || !description || !link || !alt_text)
      return json({ ok: false, error: "missing_fields" }, 400);
    if (items.some((it: any) => !it?.image_b64))
      return json({ ok: false, error: "item_missing_image_b64" }, 400);

    const { data: conn, error: connErr } = await sb
      .from("pinterest_connection")
      .select("id, account_name, access_token, scopes, status")
      .eq("status", "connected").maybeSingle();
    if (connErr || !conn) return json({ ok: false, step: "load_connection", error: connErr?.message ?? "no_connection" }, 500);
    if (conn.account_name !== required_username)
      return json({ ok: false, step: "account_check", error: "account_mismatch", found: conn.account_name }, 400);
    const scopes = String(conn.scopes ?? "");
    const missing = ["boards:read","boards:write","pins:read","pins:write"].filter(s => !scopes.includes(s));
    if (missing.length) return json({ ok: false, step: "scopes", missing }, 400);
    const auth = { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" };

    const acctRes = await fetch(`${PIN_API}/user_account`, { headers: auth });
    const acct = await acctRes.json().catch(() => ({}));
    if (!acctRes.ok || acct?.username !== required_username)
      return json({ ok: false, step: "user_account", status: acctRes.status, acct }, 400);

    const boardsRes = await fetch(`${PIN_API}/boards?page_size=100`, { headers: auth });
    const boardsJson = await boardsRes.json().catch(() => ({}));
    if (!boardsRes.ok) return json({ ok: false, step: "boards_list", status: boardsRes.status, boardsJson }, 500);
    const boards: Array<{ id: string; name: string }> = boardsJson?.items ?? [];
    let chosen: { id: string; name: string } | null = null;
    if (board_id_hint) chosen = boards.find(b => b.id === board_id_hint) ?? null;
    if (!chosen && board_name_preferred)
      chosen = boards.find(b => b.name.toLowerCase() === String(board_name_preferred).toLowerCase()) ?? null;
    let created_board = false;
    if (!chosen && board_name_preferred) {
      const cbRes = await fetch(`${PIN_API}/boards`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ name: board_name_preferred, privacy: "PUBLIC" }),
      });
      const cbJson = await cbRes.json().catch(() => ({}));
      if (!cbRes.ok) return json({ ok: false, step: "board_create", status: cbRes.status, cbJson }, 500);
      chosen = { id: cbJson.id, name: cbJson.name }; created_board = true;
    }
    if (!chosen) return json({ ok: false, step: "board_select", error: "no_board" }, 400);

    if (dry_run) return json({ ok: true, dry_run: true, board: chosen, created_board, item_count: items.length });

    const carouselItems = items.map((it: any) => ({
      title: it.title, description: it.description, link: it.link,
      content_type: "image/jpeg", data: it.image_b64,
    }));
    const pinBody = {
      board_id: chosen.id, title, description, alt_text, link,
      media_source: { source_type: "multiple_image_base64", items: carouselItems },
      note: "AI-composed 4-slide carousel highlighting the Ailurova XL Stainless Steel Enclosed Cat Litter Box.",
    };
    const pinRes = await fetch(`${PIN_API}/pins`, { method: "POST", headers: auth, body: JSON.stringify(pinBody) });
    const pinText = await pinRes.text();
    let pin: any = null; try { pin = JSON.parse(pinText); } catch {}
    if (!pinRes.ok) return json({ ok: false, step: "pin_create", status: pinRes.status, body: pin ?? pinText }, 500);

    const readRes = await fetch(`${PIN_API}/pins/${pin.id}`, { headers: auth });
    const read = await readRes.json().catch(() => ({}));

    return json({
      ok: true, board: chosen, created_board,
      pin: { id: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/`, title: pin.title, link: pin.link, board_id: pin.board_id, created_at: pin.created_at },
      readback: { status: readRes.status, id: read?.id, title: read?.title, link: read?.link, board_id: read?.board_id, alt_text: read?.alt_text, media: read?.media, is_owner: read?.is_owner },
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});