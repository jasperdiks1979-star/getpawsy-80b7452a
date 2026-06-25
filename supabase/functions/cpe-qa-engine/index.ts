import { admin, jsonResp, cors, BANNED_PHRASES } from "../_shared/creative-helpers.ts";
import { isInternalAuthed } from "../_shared/cpe-helpers.ts";

function runChecks(asset: any): { pass: boolean; reasons: string[]; checks: Record<string, boolean>; score: number } {
  const checks: Record<string, boolean> = {};
  const reasons: string[] = [];
  const text = JSON.stringify(asset.copy_payload ?? asset.headline ?? asset.hook ?? "").toLowerCase();

  checks.banned_phrase = !BANNED_PHRASES.some((p) => text.includes(p));
  if (!checks.banned_phrase) reasons.push("banned_phrase");

  checks.has_source = Boolean(asset.source_url ?? asset.enhanced_image_id ?? asset.lifestyle_scene_id ?? asset.creative_type === "copy");
  if (!checks.has_source) reasons.push("missing_source");

  checks.product_linked = Boolean(asset.product_id);
  if (!checks.product_linked) reasons.push("no_product");

  const pass = reasons.length === 0;
  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.values(checks).length) * 100);
  return { pass, reasons, checks, score };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  let body: any = {}; try { body = await req.json(); } catch {}
  const limit = Math.min(Number(body?.limit ?? 50), 200);

  const { data: pending } = await sb
    .from("creative_assets")
    .select("id,product_id,creative_type,copy_payload,source_url,enhanced_image_id,lifestyle_scene_id,headline,hook")
    .eq("qa_status", "pending")
    .limit(limit);

  let passed = 0, failed = 0;
  for (const a of pending ?? []) {
    const r = runChecks(a);
    await sb.from("cpe_qa_results").insert({
      target_kind: "creative_asset", target_id: a.id, product_id: a.product_id,
      checks: r.checks, pass: r.pass, reasons: r.reasons, score: r.score,
    });
    await sb.from("creative_assets").update({
      qa_status: r.pass ? "approved" : "qa_failed",
      quality_score: r.score,
    }).eq("id", a.id);
    if (r.pass) passed++; else failed++;
  }
  return jsonResp({ ok: true, evaluated: (pending ?? []).length, passed, failed });
});