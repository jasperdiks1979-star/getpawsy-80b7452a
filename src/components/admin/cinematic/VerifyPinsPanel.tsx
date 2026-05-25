import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Outcome = "verified" | "not_found" | "inaccessible" | "no_pin_id";
type Result = {
  id: string;
  outcome: Outcome;
  pin_url?: string;
  error?: string;
  current_status?: string;
  next_status?: string;
  would_correct?: boolean;
};
type Response = {
  ok: boolean;
  dryRun?: boolean;
  verified_at?: string;
  checked: number;
  corrections?: number;
  results: Result[];
  message?: string;
};

const OUTCOME_VARIANT: Record<Outcome, "secondary" | "destructive" | "outline" | "default"> = {
  verified: "secondary",
  not_found: "destructive",
  inaccessible: "outline",
  no_pin_id: "destructive",
};

export default function VerifyPinsPanel() {
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState<Response | null>(null);
  const [preview, setPreview] = useState<Response | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const counts = useMemo(() => {
    const c = { verified: 0, not_found: 0, inaccessible: 0, no_pin_id: 0, fixes: 0 };
    for (const r of data?.results ?? []) {
      c[r.outcome] += 1;
      // Status was corrected when remote was missing or pin id absent
      if (r.outcome === "not_found" || r.outcome === "no_pin_id") c.fixes += 1;
    }
    return c;
  }, [data]);

  // Step 1: dry run — count remote-state corrections without writing.
  const runPreview = async () => {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("cinematic-job-verify", {
        body: { limit, dryRun: true },
      });
      if (error) throw error;
      const r = res as Response;
      setPreview(r);
      setConfirmOpen(true);
    } catch (e) {
      toast.error((e as Error).message ?? "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  // Step 2: apply — only after confirmation.
  const applyCorrections = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("cinematic-job-verify", {
        body: { limit },
      });
      if (error) throw error;
      const r = res as Response;
      setData(r);
      if (r.ok) {
        const corrections = r.corrections ?? r.results.filter((x) => x.would_correct).length;
        toast.success(`Verified ${r.checked} · corrected ${corrections}`);
      } else toast.error(r.message ?? "Verification failed");
    } catch (e) {
      toast.error((e as Error).message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = () => {
    if (!data) return;
    const ts = (data.verified_at ?? new Date().toISOString()).replace(/[:.]/g, "-");
    const header = ["job_id", "outcome", "current_status", "next_status", "would_correct", "pin_url", "error"];
    const rows = data.results.map((r) =>
      [r.id, r.outcome, r.current_status ?? "", r.next_status ?? "", r.would_correct ? "yes" : "no", r.pin_url ?? "", (r.error ?? "").replace(/"/g, '""')]
        .map((v) => `"${v}"`)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pinterest-verification-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Verify Pinterest pins
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            className="h-9 w-20"
            aria-label="Limit"
          />
          <Button size="sm" variant="outline" onClick={runPreview} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Preview corrections
          </Button>
          <Button size="sm" variant="outline" onClick={downloadReport} disabled={!data?.results?.length}>
            <Download className="mr-2 h-4 w-4" /> Download report
          </Button>
        </div>
      </CardHeader>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        preview={preview}
        onConfirm={applyCorrections}
      />
      <CardContent className="space-y-3">
        {!data ? (
          <p className="text-xs text-muted-foreground">
            Verifies pins flagged as <code>pinterest_uploaded</code> against Pinterest. Corrects job status and saves a verification record per pin.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Checked" value={data.checked} />
              <Stat label="Verified" value={counts.verified} tone="ok" />
              <Stat label="Not found" value={counts.not_found} tone={counts.not_found ? "bad" : "neutral"} />
              <Stat label="Inaccessible" value={counts.inaccessible} />
              <Stat label="Fixes applied" value={counts.fixes} tone={counts.fixes ? "warn" : "neutral"} />
            </div>
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left">
                  <tr>
                    <th className="px-2 py-1.5">Job</th>
                    <th className="px-2 py-1.5">Outcome</th>
                    <th className="px-2 py-1.5">Pin URL</th>
                    <th className="px-2 py-1.5">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-2 py-1.5 font-mono text-[11px]">{r.id.slice(0, 8)}…</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={OUTCOME_VARIANT[r.outcome]}>{r.outcome}</Badge>
                        {r.would_correct ? (
                          <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                            {r.current_status} → {r.next_status}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.pin_url ? (
                          <a className="underline" href={r.pin_url} target="_blank" rel="noreferrer">
                            open
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-destructive">{r.error ?? ""}</td>
                    </tr>
                  ))}
                  {!data.results.length ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                        No jobs needed verification.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "ok" | "bad" | "warn" | "neutral" }) {
  const cls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}