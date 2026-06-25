import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { claimJobs, finishJob, sha256Hex, isInternalAuthed } from "../_shared/cpe-helpers.ts";

async function hashRemote(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const dig = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  const jobs = await claimJobs(sb, "delta_check", "cpe-cj-delta", 10);
  let updated = 0, replaced = 0;
  for (const j of jobs) {
    try {
      const { asset_id, product_id, url } = j.payload as any;
      const sha = await hashRemote(String(url));
      if (!sha) { await finishJob(sb, j.id, false, "fetch_failed"); continue; }
      const { data: existing } = await sb
        .from("cpe_asset_versions")
        .select("id,sha256,is_current")
        .eq("asset_id", asset_id)
        .eq("is_current", true)
        .maybeSingle();
      if (!existing) {
        await sb.from("cpe_asset_versions").insert({ asset_id, product_id, source_url: url, sha256: sha, is_current: true });
      } else if (existing.sha256 !== sha) {
        await sb.from("cpe_asset_versions").update({ is_current: false }).eq("id", existing.id);
        await sb.from("cpe_asset_versions").insert({ asset_id, product_id, source_url: url, sha256: sha, is_current: true, supersedes_id: existing.id });
        replaced++;
      }
      await sb.from("cj_media_asset_registry").update({ last_delta_check_at: new Date().toISOString() }).eq("id", asset_id);
      updated++;
      await finishJob(sb, j.id, true);
    } catch (e) {
      await finishJob(sb, j.id, false, String((e as Error)?.message ?? e));
    }
  }
  return jsonResp({ ok: true, processed: jobs.length, updated, replaced });
});