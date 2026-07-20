// Periodically checks GitHub for edit branches that are ahead of `main`
// and writes alerts into `github_sync_alerts`. Uses GITHUB_REPO secret
// (e.g. "owner/repo"); optional GITHUB_TOKEN raises rate limits / supports
// private repos. Designed to be invoked by pg_cron every 15 min.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

type Branch = { name: string; commit: { sha: string } };
type CompareResp = { ahead_by: number; behind_by: number; status: string };

const REPO = Deno.env.get("GITHUB_REPO") ?? "";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ghHeaders: HeadersInit = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
};

async function gh<T>(path: string): Promise<T> {
  const r = await fetch(`https://api.github.com${path}`, { headers: ghHeaders });
  if (!r.ok) throw new Error(`GitHub ${path} -> ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    if (!REPO) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "GITHUB_REPO secret not set" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const main = await gh<{ sha: string }>(`/repos/${REPO}/commits/main`);
    const branches = await gh<Branch[]>(`/repos/${REPO}/branches?per_page=100`);
    const editBranches = branches.filter((b) =>
      b.name.startsWith("lovable/") || b.name.startsWith("lovable-")
    );

    const inserted: string[] = [];
    const resolvedNow: string[] = [];

    for (const b of editBranches) {
      let cmp: CompareResp;
      try {
        cmp = await gh<CompareResp>(
          `/repos/${REPO}/compare/main...${encodeURIComponent(b.name)}`,
        );
      } catch {
        continue;
      }
      const drift = cmp.ahead_by > 0; // branch has commits not on main
      if (drift) {
        const { error } = await supabase
          .from("github_sync_alerts")
          .insert({
            branch: b.name,
            branch_sha: b.commit.sha,
            main_sha: main.sha,
            ahead_by: cmp.ahead_by,
            behind_by: cmp.behind_by,
            message: `${b.name} is ${cmp.ahead_by} commit(s) ahead of main`,
          });
        if (!error) inserted.push(b.name);
      } else {
        // branch caught up — auto-resolve any open alerts for it
        const { data } = await supabase
          .from("github_sync_alerts")
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq("branch", b.name)
          .eq("resolved", false)
          .select("id");
        if (data && data.length) resolvedNow.push(b.name);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: "checked",
        main_sha: main.sha,
        branches_checked: editBranches.length,
        alerts_created: inserted,
        alerts_resolved: resolvedNow,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});