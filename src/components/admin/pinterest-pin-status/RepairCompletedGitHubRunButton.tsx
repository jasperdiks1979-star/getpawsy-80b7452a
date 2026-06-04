import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin-only panel: "Repair completed GitHub run".
 *
 * For cinematic_ad_jobs rows where GitHub Actions exited 0 but the row
 * is still in render_queued / needs_admin_review / failed and
 * output_mp4_url is null, this button calls cinematic-ad-repair-job.
 *
 * The function probes Supabase Storage for the rendered MP4 and, if
 * found, replays the canonical render webhook so the job transitions
 * to render_complete naturally (and triggers validate/autopublish).
 * If no MP4 is in storage the function reports back with the candidate
 * paths it checked so the operator knows a fresh render is required.
 */
export default function RepairCompletedGitHubRunButton() {
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function runRepair() {
    const id = jobId.trim();
    if (!id) { toast.error("Enter a cinematic_ad_jobs.id (full UUID)"); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-repair-job", {
        body: { job_id: id },
      });
      if (error) {
        toast.error(`Repair failed: ${error.message}`);
        setResult({ ok: false, error: error.message });
      } else {
        setResult(data);
        if ((data as any)?.ok) toast.success("Repair applied — row should transition to render_complete");
        else toast.message((data as any)?.message ?? "Repair attempted");
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
      setResult({ ok: false, error: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border p-3 space-y-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Wrench className="h-4 w-4 text-amber-600" />
        Repair completed GitHub run
      </div>
      <p className="text-xs text-muted-foreground">
        Probes storage for the MP4 of a stuck cinematic ad job. If the file is there but
        <code className="mx-1">output_mp4_url</code>
        was never persisted (green GH run, silent webhook drop), this replays the canonical
        render webhook so the job transitions to <code>render_complete</code> and validation
        runs. No re-render. Admin-only.
      </p>
      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col gap-1 min-w-[320px] flex-1">
          <label className="text-xs font-medium">cinematic_ad_jobs.id</label>
          <Input
            placeholder="e.g. 3eb457b5-942a-4a45-b46a-fb8820649cd0"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            spellCheck={false}
          />
        </div>
        <Button onClick={runRepair} disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white">
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
          Repair
        </Button>
      </div>
      {result && (
        <pre className="text-[10px] bg-background/60 border rounded p-2 overflow-auto max-h-64">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}