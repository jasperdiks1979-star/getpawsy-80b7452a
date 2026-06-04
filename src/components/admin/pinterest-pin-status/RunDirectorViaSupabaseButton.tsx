import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket } from "lucide-react";

type EdgeCallDiag = {
  fn: string;
  ok: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  traceId: string | null;
  errorMessage: string | null;
  missingAuthHeader?: string | null;
};

type ConceptResult = {
  index: number;
  archetype: string;
  jobId: string | null;
  prepare: EdgeCallDiag;
  queue: EdgeCallDiag | null;
};

const ARCHETYPES = [
  "problem_solution",
  "emotional",
  "premium_lifestyle",
  "viral_pattern_interrupt",
  "ugc_authentic",
  "hero_demo",
  "before_after",
  "narrative_story",
];

async function invokeWithDiag(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ data: any; diag: EdgeCallDiag }> {
  const { data: sess } = await supabase.auth.getSession();
  const hasAuth = !!sess?.session?.access_token;
  const { data, error } = await supabase.functions.invoke(fn, { body });
  const ctx: Response | undefined = (error as any)?.context;
  const httpStatus: number | null = ctx?.status ?? (data ? 200 : null);
  let responseBody: string | null = null;
  let traceId: string | null = (data as any)?.traceId ?? null;
  if (ctx) {
    try { responseBody = await ctx.clone().text(); } catch { /* noop */ }
    try {
      const parsed = responseBody ? JSON.parse(responseBody) : null;
      if (parsed?.traceId) traceId = parsed.traceId;
    } catch { /* not JSON */ }
  }
  const okFlag = !error && (data as any)?.ok !== false;
  const errorMessage = okFlag
    ? null
    : ((data as any)?.message || error?.message || `non-2xx (${httpStatus ?? "?"})`);
  let missingAuthHeader: string | null = null;
  if (httpStatus === 401 || httpStatus === 403) {
    missingAuthHeader = hasAuth
      ? "Authorization header was sent (admin JWT) but function rejected it — likely role/policy denial. Verify admin role for current user."
      : "Authorization: Bearer <admin JWT> — you are not logged in. Re-login as admin and retry.";
  }
  return {
    data,
    diag: { fn, ok: okFlag, httpStatus, responseBody, traceId, errorMessage, missingAuthHeader },
  };
}

export default function RunDirectorViaSupabaseButton() {
  const [slug, setSlug] = useState("");
  const [count, setCount] = useState(4);
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ConceptResult[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);

  const run = async () => {
    if (!slug.trim()) return;
    setRunning(true);
    setResults([]);
    setRunStartedAt(new Date().toISOString());
    const runId = `pps-director-${Date.now()}`;
    const archetypes = ARCHETYPES.slice(0, Math.max(1, Math.min(8, count)));
    const acc: ConceptResult[] = [];
    for (let i = 0; i < archetypes.length; i++) {
      const archetype = archetypes[i];
      const prep = await invokeWithDiag("cinematic-ad-prepare", {
        product_slug: slug.trim(),
        hook_variant: archetype,
        voice_style: "natural",
        force_new: true,
        director_archetype: archetype,
        director_run_id: runId,
        concept_type: archetype,
      });
      const jobId =
        ((prep.data as any)?.job_id ?? (prep.data as any)?.job?.id) as string | undefined;
      let queueDiag: EdgeCallDiag | null = null;
      if (jobId && prep.diag.ok) {
        const q = await invokeWithDiag("cinematic-ad-queue-render", {
          job_id: jobId,
          preset: "cinematic_premium",
          auto_approve: true,
          dry_run: dryRun,
        });
        queueDiag = q.diag;
      }
      acc.push({
        index: i,
        archetype,
        jobId: jobId ?? null,
        prepare: prep.diag,
        queue: queueDiag,
      });
      setResults([...acc]);
    }
    setRunning(false);
  };

  return (
    <div className="rounded border p-3 space-y-3 bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-sky-950/20 dark:to-emerald-950/20">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Rocket className="h-4 w-4 text-sky-600" />
        Run Director via Supabase endpoint (Ad-Studio parity)
        <Badge variant="outline" className="ml-2">prepare → queue-render</Badge>
        {dryRun ? <Badge variant="secondary">DRY-RUN</Badge> : <Badge variant="destructive">PRODUCTION</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        Uses the exact same Supabase Edge Function flow as Pinterest Ad Studio:&nbsp;
        <code>cinematic-ad-prepare</code> → <code>cinematic-ad-queue-render</code>.
        Drafts land in <code>cinematic_ad_jobs</code> and become visible here once validation passes.
        Does NOT call the legacy <code>pinterest-creative-director</code> endpoint.
      </p>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1 min-w-[260px] flex-1">
          <label className="text-xs font-medium">Product slug</label>
          <Input
            placeholder="e.g. automatic-self-cleaning-cat-litter-box"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 w-24">
          <label className="text-xs font-medium">Count</label>
          <Input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 4)))}
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry-run (no GitHub Actions render)
        </label>
        <Button
          size="sm"
          onClick={run}
          disabled={running || !slug.trim()}
          className="bg-sky-600 hover:bg-sky-700 text-white"
        >
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
          {dryRun ? "Run Dry-run Director" : "Run Production Director"}
        </Button>
      </div>

      {(results.length > 0 || running) && (
        <div className="rounded border bg-background p-3 space-y-2 text-xs">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">started: {runStartedAt}</Badge>
            <Badge variant="outline">concepts: {results.length}/{count}</Badge>
            <Badge variant="outline" className="border-emerald-500 text-emerald-700">
              ok: {results.filter((r) => r.prepare.ok && (!r.queue || r.queue.ok)).length}
            </Badge>
            <Badge variant="outline" className="border-red-500 text-red-700">
              failed: {results.filter((r) => !r.prepare.ok || (r.queue && !r.queue.ok)).length}
            </Badge>
          </div>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.index} className="rounded border p-2 space-y-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge>{r.archetype}</Badge>
                  {r.jobId && (
                    <span className="font-mono text-[10px] text-muted-foreground">job: {r.jobId}</span>
                  )}
                </div>
                {(["prepare", "queue"] as const).map((step) => {
                  const d = r[step];
                  if (!d) return null;
                  return (
                    <div key={step} className="grid grid-cols-[80px_1fr] gap-2 text-[11px]">
                      <div className="font-medium">{step}</div>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">endpoint: {d.fn}</Badge>
                          <Badge variant={d.ok ? "secondary" : "destructive"}>HTTP {d.httpStatus ?? "?"}</Badge>
                          {d.traceId && <Badge variant="outline">trace: {d.traceId}</Badge>}
                          <Badge variant={d.ok ? "secondary" : "destructive"}>{d.ok ? "OK" : "FAIL"}</Badge>
                        </div>
                        {d.errorMessage && (
                          <div className="text-destructive">error: {d.errorMessage}</div>
                        )}
                        {d.missingAuthHeader && (
                          <div className="text-amber-700 dark:text-amber-400">
                            auth: {d.missingAuthHeader}
                          </div>
                        )}
                        {!d.ok && d.responseBody && (
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">response body</summary>
                            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]">
                              {d.responseBody}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}