// VerificationHistoryPanel — lists the most recent Pinterest verification
// runs (date, checked, fixes) and lets an admin drill into a single run to
// review its per-pin results. Data is realtime-subscribed so the table
// reflects new runs as they finish.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, History, Eye, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  checked: number;
  corrections: number;
  dry_run: boolean;
  notes: string | null;
};

type RunResult = {
  id: string;
  job_id: string;
  pin_id: string | null;
  pin_url: string | null;
  remote_exists: boolean;
  error: string | null;
  checked_at: string;
};

export default function VerificationHistoryPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [openRun, setOpenRun] = useState<Run | null>(null);
  const [details, setDetails] = useState<RunResult[] | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pinterest_verification_runs")
      .select("id, started_at, finished_at, checked, corrections, dry_run, notes")
      .order("started_at", { ascending: false })
      .limit(25);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRuns((data ?? []) as Run[]);
  };

  useEffect(() => {
    fetchRuns();
    // Refresh when a new run is inserted or one finishes (finished_at update).
    const ch = supabase
      .channel("verification-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pinterest_verification_runs" },
        () => fetchRuns(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const openDetails = async (run: Run) => {
    setOpenRun(run);
    setDetails(null);
    setDetailsLoading(true);
    const { data, error } = await supabase
      .from("pinterest_publish_verifications")
      .select("id, job_id, pin_id, pin_url, remote_exists, error, checked_at")
      .eq("run_id", run.id)
      .order("checked_at", { ascending: true });
    setDetailsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDetails((data ?? []) as RunResult[]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Verification history
        </CardTitle>
        <Button size="sm" variant="outline" onClick={fetchRuns} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-left">
              <tr>
                <th className="px-2 py-1.5">When</th>
                <th className="px-2 py-1.5">Checked</th>
                <th className="px-2 py-1.5">Fixes</th>
                <th className="px-2 py-1.5">Scope</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1.5">
                    <div title={new Date(r.started_at).toLocaleString()}>
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                    </div>
                    {!r.finished_at ? (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">running…</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.checked}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={r.corrections > 0 ? "destructive" : "secondary"}>{r.corrections}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.notes ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openDetails(r)}>
                      <Eye className="mr-1 h-3 w-3" /> View
                    </Button>
                  </td>
                </tr>
              ))}
              {!runs.length && !loading ? (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                    No verification runs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!openRun} onOpenChange={(v) => !v && setOpenRun(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Run results</DialogTitle>
            <DialogDescription>
              {openRun ? (
                <>
                  Started {new Date(openRun.started_at).toLocaleString()} · checked {openRun.checked} · {openRun.corrections} correction{openRun.corrections === 1 ? "" : "s"}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <RunDetails loading={detailsLoading} rows={details} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RunDetails({ loading, rows }: { loading: boolean; rows: RunResult[] | null }) {
  const summary = useMemo(() => {
    const s = { verified: 0, missing: 0, no_pin_id: 0, inaccessible: 0 };
    for (const r of rows ?? []) {
      if (!r.pin_id) s.no_pin_id += 1;
      else if (r.remote_exists) s.verified += 1;
      else if (r.error && r.error.toLowerCase().includes("not")) s.missing += 1;
      else if (r.remote_exists === false) s.missing += 1;
      else s.inaccessible += 1;
    }
    return s;
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!rows?.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No per-pin results saved for this run.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <Stat label="Verified" value={summary.verified} tone="ok" />
        <Stat label="Missing" value={summary.missing} tone={summary.missing ? "bad" : "neutral"} />
        <Stat label="No pin id" value={summary.no_pin_id} tone={summary.no_pin_id ? "bad" : "neutral"} />
        <Stat label="Inaccessible" value={summary.inaccessible} />
      </div>
      <div className="mt-3 max-h-80 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-left">
            <tr>
              <th className="px-2 py-1.5">Job</th>
              <th className="px-2 py-1.5">Pin</th>
              <th className="px-2 py-1.5">Exists</th>
              <th className="px-2 py-1.5">Error</th>
              <th className="px-2 py-1.5">Checked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1.5 font-mono text-[11px]">{r.job_id.slice(0, 8)}…</td>
                <td className="px-2 py-1.5">
                  {r.pin_url ? (
                    <a className="underline" href={r.pin_url} target="_blank" rel="noreferrer">
                      {r.pin_id ?? "open"}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{r.pin_id ?? "—"}</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Badge variant={r.remote_exists ? "secondary" : "destructive"}>
                    {r.remote_exists ? "yes" : "no"}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-destructive">{r.error ?? ""}</td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {new Date(r.checked_at).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "ok" | "bad" | "neutral" }) {
  const cls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded border p-2 text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}