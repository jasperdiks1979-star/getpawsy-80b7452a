// READ-ONLY Pinterest audit reader. Only performs GET requests against the
// Pinterest API (boards, pins, pin analytics). Never creates, edits or deletes
// pins/boards and never writes to the database.
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
    const action = body.action ?? "list";

    if (action === "boards") {
      const items: unknown[] = [];
      let bm = "";
      for (let i = 0; i < 10; i++) {
        const r = await fetch(`${PIN_API}/boards?page_size=250&privacy=ALL${bm ? `&bookmark=${bm}` : ""}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, step: "boards", status: r.status, j }, 200);
        items.push(...(j.items ?? []));
        bm = j.bookmark ?? "";
        if (!bm) break;
      }
      return json({ ok: true, account: conn.account_name, scopes: conn.scopes, count: items.length, items });
    }

    if (action === "list") {
      // paged pin listing; caller passes bookmark to continue
      let bm: string = body.bookmark ?? "";
      const items: unknown[] = [];
      const pages = Number(body.pages ?? 3);
      for (let i = 0; i < pages; i++) {
        const r = await fetch(`${PIN_API}/pins?page_size=100&pin_metrics=false${bm ? `&bookmark=${encodeURIComponent(bm)}` : ""}`, { headers: auth });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ ok: false, step: "pins", status: r.status, j, items, bookmark: bm }, 200);
        items.push(...(j.items ?? []));
        bm = j.bookmark ?? "";
        if (!bm) break;
      }
      return json({ ok: true, count: items.length, bookmark: bm, items });
    }

    if (action === "analytics") {
      const ids: string[] = body.pin_ids ?? [];
      const start: string = body.start_date;
      const end: string = body.end_date;
      const metrics = body.metric_types ??
        "IMPRESSION,OUTBOUND_CLICK,PIN_CLICK,SAVE,SAVE_RATE,TOTAL_COMMENTS,TOTAL_REACTIONS,VIDEO_MRC_VIEW,VIDEO_AVG_WATCH_TIME,VIDEO_V50_WATCH_TIME,QUARTILE_95_PERCENT_VIEW,VIDEO_10S_VIEW,VIDEO_START";
      const out: Record<string, unknown> = {};
      for (let i = 0; i < ids.length; i += 6) {
        const chunk = ids.slice(i, i + 6);
        await Promise.all(chunk.map(async (id) => {
          const u = `${PIN_API}/pins/${id}/analytics?start_date=${start}&end_date=${end}&metric_types=${metrics}`;
          const r = await fetch(u, { headers: auth });
          const j = await r.json().catch(() => ({}));
          out[id] = r.ok ? j : { __error: true, status: r.status, body: j };
        }));
      }
      return json({ ok: true, start, end, analytics: out });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
