import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("pin_seo_ai"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: products } = await sb.from("products").select("id, slug, name, seo_title, seo_description").limit(50);
  const rows = (products ?? []).flatMap((p) => ([
    { product_id: p.id, variant_kind: "title", payload: { variants: [p.seo_title, `${p.name} for US Pet Parents`, `Best ${p.name} 2026`] }, score: 0, applied: false },
    { product_id: p.id, variant_kind: "description", payload: { variants: [p.seo_description, `Discover ${p.name}. Free US shipping.`] }, score: 0, applied: false },
    { product_id: p.id, variant_kind: "keywords", payload: { clusters: ["pet care", p.slug, "premium pet"] }, score: 0, applied: false },
  ]));
  if (rows.length) { const { error } = await sb.from("acos_pin_seo_variants").insert(rows); if (error) return err(error.message); }
  return ok({ drafts: rows.length });
});