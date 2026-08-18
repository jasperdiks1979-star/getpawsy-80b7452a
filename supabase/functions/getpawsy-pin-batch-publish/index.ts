// Batch organic Pinterest publisher for GetPawsy high-potential pin waves.
// modes: "boards" (read-only list), "publish" (create pins from base64 images),
// "verify" (read back pins by id). Never edits or deletes existing pins.
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
    const mode = body.mode ?? "boards";
    const requiredUsername = body.required_username ?? "getpawsyshop";

    const { data: conn, error: connErr } = await sb
      .from("pinterest_connection")
      .select("account_name, access_token, scopes, status, token_expires_at")
      .in("status", ["connected", "auth_failed"])
      .order("token_expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connErr || !conn) return json({ ok: false, step: "load_connection", error: connErr?.message ?? "no_connection" }, 500);
    if (conn.account_name !== requiredUsername) {
      return json({ ok: false, step: "account_check", found: conn.account_name, expected: requiredUsername }, 400);
    }
    const auth = { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" };

    if (mode === "boards") {
      const res = await fetch(`${PIN_API}/boards?page_size=100`, { headers: auth });
      const j = await res.json().catch(() => ({}));
      return json({ ok: res.ok, status: res.status, scopes: conn.scopes, boards: (j?.items ?? []).map((b: any) => ({ id: b.id, name: b.name, privacy: b.privacy, pin_count: b.pin_count })) }, res.ok ? 200 : 500);
    }

    if (mode === "verify") {
      const ids: string[] = body.pin_ids ?? [];
      const out: any[] = [];
      for (const id of ids) {
        const r = await fetch(`${PIN_API}/pins/${id}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        out.push({ id, status: r.status, ok: r.ok, pin: r.ok ? { id: j.id, title: j.title, description: j.description, link: j.link, board_id: j.board_id, alt_text: j.alt_text, created_at: j.created_at, media: j.media?.images?.["600x"]?.url ?? null } : j });
      }
      return json({ ok: true, results: out });
    }

    // Read-only inventory listing used for duplicate-avoidance reference sets.
    if (mode === "list") {
      const pageSize = Math.min(Number(body.page_size ?? 100), 100);
      const maxPages = Math.min(Number(body.max_pages ?? 3), 10);
      const items: any[] = [];
      let bookmark: string | null = null;
      for (let i = 0; i < maxPages; i++) {
        const qs = new URLSearchParams({ page_size: String(pageSize) });
        if (bookmark) qs.set("bookmark", bookmark);
        const r = await fetch(`${PIN_API}/pins?${qs}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, step: "list", status: r.status, error: j }, 500);
        for (const p of j?.items ?? []) {
          items.push({ id: p.id, title: p.title, description: p.description, link: p.link, board_id: p.board_id, created_at: p.created_at, alt_text: p.alt_text });
        }
        bookmark = j?.bookmark ?? null;
        if (!bookmark) break;
      }
      const filter = typeof body.link_contains === "string" ? body.link_contains : null;
      const filtered = filter ? items.filter((p) => (p.link ?? "").includes(filter)) : items;
      return json({ ok: true, count: filtered.length, total_scanned: items.length, pins: filtered });
    }

    if (mode === "__verify_legacy") {
      const ids: string[] = body.pin_ids ?? [];
      const out: any[] = [];
      for (const id of ids) {
        const r = await fetch(`${PIN_API}/pins/${id}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        out.push({ id, status: r.status, ok: r.ok, pin: r.ok ? { id: j.id, title: j.title, description: j.description, link: j.link, board_id: j.board_id, alt_text: j.alt_text, created_at: j.created_at, media: j.media?.images?.["600x"]?.url ?? null } : j });
      }
      return json({ ok: true, results: out });
    }

    if (mode === "publish") {
      const pins: any[] = body.pins ?? [];
      if (!pins.length) return json({ ok: false, error: "no_pins" }, 400);
      const results: any[] = [];
      for (const p of pins) {
        if (!p.image_b64 || !p.title || !p.description || !p.link || !p.board_id) {
          results.push({ ref: p.ref, ok: false, error: "missing_fields" });
          continue;
        }
        const pinBody: Record<string, unknown> = {
          board_id: p.board_id,
          title: p.title,
          description: p.description,
          alt_text: p.alt_text ?? p.title,
          link: p.link,
          media_source: { source_type: "image_base64", content_type: "image/jpeg", data: p.image_b64 },
        };
        const r = await fetch(`${PIN_API}/pins`, { method: "POST", headers: auth, body: JSON.stringify(pinBody) });
        const t = await r.text();
        let j: any = null; try { j = JSON.parse(t); } catch { /* keep text */ }
        if (!r.ok) {
          results.push({ ref: p.ref, ok: false, status: r.status, error: j ?? t });
        } else {
          results.push({ ref: p.ref, ok: true, pin_id: j.id, board_id: j.board_id, url: `https://www.pinterest.com/pin/${j.id}/`, link: j.link });
        }
        await new Promise((res) => setTimeout(res, 1200));
      }
      return json({ ok: true, published: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
    }

    return json({ ok: false, error: "unknown_mode" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
