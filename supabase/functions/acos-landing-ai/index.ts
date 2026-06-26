import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("landing_ai"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: products } = await sb.from("products").select("id, slug, name, seo_title, seo_description, hero_image_url").limit(100);
  const rows = (products ?? []).map((p)=>{
    const issues: string[] = [];
    if (!p.seo_title) issues.push("missing_seo_title");
    if (!p.seo_description) issues.push("missing_seo_description");
    if (!p.hero_image_url) issues.push("missing_hero_image");
    return {
      product_id: p.id,
      url: `/products/${p.slug}`,
      scores: { headline: p.seo_title ? 80 : 30, images: p.hero_image_url ? 80 : 30, cta: 70, trust: 70, speed: 75 },
      issues,
      auto_applied: [],
      pending_approval: issues,
    };
  });
  if (rows.length) { const { error } = await sb.from("acos_landing_audits").insert(rows); if (error) return err(error.message); }
  return ok({ audited: rows.length });
});