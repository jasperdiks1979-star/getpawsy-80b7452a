// pinterest-diversity-replacement-worker
// Drains pinterest_overlay_replacement_jobs (status='pending_creative') ONE row per
// invocation, calls pinterest-creative-director with count=5 + force=true to render
// 5 diverse drafts for the legacy pin's product, and updates the job row with the
// returned draft queue ids. Replacements remain `draft` until human approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: service-role bearer OR admin
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  let allowed = token === SERVICE_KEY;
  if (!allowed && token) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: r } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      allowed = !!r;
    }
  }
  if (!allowed) return json({ ok: false, message: "admin only" }, 403);

  // Claim one pending job
  const { data: job } = await sb
    .from("pinterest_overlay_replacement_jobs")
    .select("*")
    .eq("status", "pending_creative")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!job) return json({ ok: true, message: "no pending jobs" });

  await sb.from("pinterest_overlay_replacement_jobs")
    .update({ status: "claimed", last_checked_at: new Date().toISOString() })
    .eq("id", job.id);

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        action: "run_full",
        productSlug: job.product_slug,
        count: 5,
        force: true,
      }),
    });
    const j = await resp.json().catch(() => ({}));
    const arr = j?.drafts || j?.data?.drafts || [];
    const draftIds = (Array.isArray(arr) ? arr : [])
      .map((d: any) => (typeof d === "string" ? d : d?.queueId || d?.id))
      .filter(Boolean);

    await sb.from("pinterest_overlay_replacement_jobs").update({
      replacement_count: draftIds.length,
      replacement_draft_ids: draftIds,
      status: draftIds.length > 0 ? "pending_indexing" : "draft_generation_failed",
      notes: { creative_director_response_keys: Object.keys(j || {}), rejected_count: j?.rejected?.length || 0 },
    }).eq("id", job.id);

    return json({ ok: true, jobId: job.id, productSlug: job.product_slug, drafts: draftIds.length });
  } catch (e) {
    await sb.from("pinterest_overlay_replacement_jobs").update({
      status: "draft_generation_failed",
      notes: { error: (e as Error).message },
    }).eq("id", job.id);
    return json({ ok: false, jobId: job.id, error: (e as Error).message }, 500);
  }
});