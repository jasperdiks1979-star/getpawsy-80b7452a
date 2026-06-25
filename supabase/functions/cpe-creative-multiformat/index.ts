import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { claimJobs, finishJob, isInternalAuthed } from "../_shared/cpe-helpers.ts";

/**
 * Records multi-format Pinterest creative variants (2:3, 1000x1500, 1500x2250, OG) as `creative_assets` rows
 * pointing at the lifestyle/enhanced sources. Actual overlay rendering happens in the existing
 * pinterest premium creative pipeline; this function reserves slots and links sources.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  const jobs = await claimJobs(sb, "pinterest_variant", "cpe-multiformat", 10);
  let made = 0;
  for (const j of jobs) {
    try {
      const { product_id, source_kind, source_id, source_url, format } = j.payload as any;
      const cols: Record<string, any> = {
        product_id, status: "draft", qa_status: "pending",
        creative_type: "pinterest_static",
        image_url: source_url ?? null,
        meta: { format: format ?? "2:3", source_kind, source_id },
      };
      if (source_kind === "enhanced") cols.enhanced_image_id = source_id;
      if (source_kind === "lifestyle") cols.lifestyle_scene_id = source_id;
      await sb.from("creative_assets").insert(cols);
      made++;
      await finishJob(sb, j.id, true);
    } catch (e) {
      await finishJob(sb, j.id, false, String((e as Error)?.message ?? e));
    }
  }
  return jsonResp({ ok: true, made });
});