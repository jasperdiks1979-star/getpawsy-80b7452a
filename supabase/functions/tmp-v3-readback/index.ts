// TEMPORARY diagnostic proxy — created for the strict-v3 closeout canary.
// It forwards a read-only analytics-canonical request using the internal
// secret so the operator can capture identical-window KPI projections before
// and after the gate switch. MUST be deleted at the end of the closeout.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN = "v3ro-2026-08-31-7f2a9c";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (url.searchParams.get("mode") === "pins") {
    const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean);
    const tok = Deno.env.get("PINTEREST_ACCESS_TOKEN") ?? "";
    const out: unknown[] = [];
    for (const id of ids) {
      const pr = await fetch(`https://api.pinterest.com/v5/pins/${id}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const pj: any = await pr.json().catch(() => ({}));
      out.push({ id, status: pr.status, link: pj?.link ?? null, created_at: pj?.created_at ?? null, board_id: pj?.board_id ?? null });
    }
    return new Response(JSON.stringify({ ok: true, pins: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const hours = Number(url.searchParams.get("hours") || 720);
  const geo = url.searchParams.get("geo") || "all";
  const base = Deno.env.get("SUPABASE_URL")!;
  const r = await fetch(`${base}/functions/v1/analytics-canonical?nocache=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({ hours, geo, refresh: url.searchParams.get("refresh") === "true" }),
  });
  const j = await r.json().catch(() => ({}));
  const out = {
    ok: r.ok,
    status: r.status,
    window: (j as any).window ?? null,
    deploy_marker: (j as any).deploy_marker ?? null,
    totals: (j as any).totals ?? null,
    eligibility_gate: (j as any).eligibility_gate ?? null,
    kpi_projection: (j as any).kpi_projection ?? null,
    diagnostics: (j as any).diagnostics ?? null,
    error: (j as any).error ?? null,
  };
  return new Response(JSON.stringify(out), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
