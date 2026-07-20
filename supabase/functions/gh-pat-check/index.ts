import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

/**
 * gh-pat-check — HARDENED (Wave 1 security remediation).
 *
 * BEFORE: Publicly reachable, echoed x-oauth-scopes, dispatched a real GitHub
 * workflow on every call, and streamed arbitrary job logs to the caller.
 *
 * AFTER:
 *  - requireInternalOrAdmin gate on every non-OPTIONS request.
 *  - Workflow dispatch removed. If dispatch is ever needed, a separate
 *    admin-only function `gh-workflow-dispatch` should be created with a
 *    server-side allow-list of (repo, workflow, ref, inputs).
 *  - No PAT scopes, no raw log bodies, no repo metadata in response.
 *  - Optional run_id query param accepts integer only and returns status +
 *    conclusion only, scoped to the server-configured workflow.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireInternalOrAdmin(req);
  if (gate) return gate;

  const GH_PAT = Deno.env.get("GH_PAT") ?? "";
  const GH_REPO = Deno.env.get("GH_REPO") ?? "";
  const GH_REF = Deno.env.get("GH_REF") ?? "main";
  const WF = Deno.env.get("TRIM_WORKFLOW_FILE") ?? "trim-cinematic-ad.yml";

  const gh = (path: string) =>
    fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" },
    });

  try {
    const url = new URL(req.url);
    const rawRunId = url.searchParams.get("run_id");
    if (rawRunId) {
      if (!/^\d+$/.test(rawRunId)) {
        return new Response(JSON.stringify({ ok: false, error: "invalid_run_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const runRes = await gh(`/repos/${GH_REPO}/actions/runs/${rawRunId}`);
      if (!runRes.ok) {
        return new Response(JSON.stringify({ ok: false, error: "run_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const runJson = await runRes.json().catch(() => ({} as any));
      const runWf = String(runJson?.path ?? "").split("/").pop() ?? "";
      if (runWf !== WF) {
        return new Response(JSON.stringify({ ok: false, error: "run_not_in_allowed_workflow" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        run: { status: runJson.status ?? null, conclusion: runJson.conclusion ?? null },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Healthcheck: verify PAT works + workflow file is reachable on ref.
    // No dispatch. No scopes. No metadata leaks.
    const [who, fileCheck] = await Promise.all([
      gh("/user"),
      gh(`/repos/${GH_REPO}/contents/.github/workflows/${WF}?ref=${GH_REF}`),
    ]);
    // Consume bodies to avoid resource leaks.
    await who.text().catch(() => "");
    await fileCheck.text().catch(() => "");

    return new Response(JSON.stringify({
      ok: true,
      authenticated: who.status === 200,
      repository_accessible: who.status === 200,
      workflow_accessible: fileCheck.status === 200,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[gh-pat-check] error", (e as Error)?.message ?? e);
    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});