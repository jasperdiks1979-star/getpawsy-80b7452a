// One-off publisher for the 3 preflighted Cat Wall Perch pins.
// Publishes exactly one organic Pin per request, checks for duplicates on the
// target board first, and reads the pin back. Never mutates existing pins/DB.
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
    const { image_b64, title, description, link, alt_text, board_id, dry_run = false } = await req.json();
    if (!board_id || !link || !title || !description || (!dry_run && !image_b64)) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }

    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("account_name, access_token, scopes, status, token_expires_at")
      .in("status", ["connected", "auth_failed"])
      .order("token_expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token) return json({ ok: false, step: "load_connection", error: "no_connection" }, 500);
    const auth = { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" };

    // board must exist and match
    const bRes = await fetch(`${PIN_API}/boards/${board_id}`, { headers: auth });
    const board = await bRes.json().catch(() => ({}));
    if (!bRes.ok) return json({ ok: false, step: "board", status: bRes.status, board }, 400);

    // duplicate scan on the board (same destination link)
    const dupHits: string[] = [];
    let bookmark = "";
    for (let i = 0; i < 10; i++) {
      const u = `${PIN_API}/boards/${board_id}/pins?page_size=100${bookmark ? `&bookmark=${bookmark}` : ""}`;
      const r = await fetch(u, { headers: auth });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) break;
      for (const p of j.items ?? []) if (p?.link && String(p.link) === link) dupHits.push(p.id);
      bookmark = j.bookmark ?? "";
      if (!bookmark) break;
    }
    if (dupHits.length) return json({ ok: false, step: "duplicate_guard", duplicates: dupHits }, 409);
    if (dry_run) return json({ ok: true, dry_run: true, board: { id: board.id, name: board.name }, duplicates: 0 });

    const pinRes = await fetch(`${PIN_API}/pins`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        board_id,
        title,
        description,
        alt_text: alt_text ?? title,
        link,
        media_source: { source_type: "image_base64", content_type: "image/jpeg", data: image_b64 },
      }),
    });
    const pinText = await pinRes.text();
    let pin: any = null; try { pin = JSON.parse(pinText); } catch { /* ignore */ }
    if (!pinRes.ok) return json({ ok: false, step: "pin_create", status: pinRes.status, body: pin ?? pinText }, 500);

    const readRes = await fetch(`${PIN_API}/pins/${pin.id}`, { headers: auth });
    const read = await readRes.json().catch(() => ({}));
    return json({
      ok: true,
      account: conn.account_name,
      board: { id: board.id, name: board.name },
      pin: { id: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/` },
      readback: {
        status: readRes.status,
        id: read?.id,
        board_id: read?.board_id,
        title: read?.title,
        description: read?.description,
        alt_text: read?.alt_text,
        link: read?.link,
        media: read?.media,
        created_at: read?.created_at,
      },
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
