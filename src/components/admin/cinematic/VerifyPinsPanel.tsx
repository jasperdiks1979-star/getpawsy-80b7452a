import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, Download, RefreshCw, FileJson } from "lucide-react";
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

  // Build a normalized record per pin so CSV and JSON share the exact same
  // shape. Status-change columns are explicit (`job_status_before` →
  // `job_status_after`) and `status_changed` is true when the verifier
  // actually applied a transition (would_correct on the non-dryRun run).
  const buildRecords = () => {
    if (!data) return [];
    const verifiedAt = data.verified_at ?? new Date().toISOString();
    return data.results.map((r) => {
      const before = r.current_status ?? null;
      const after = r.next_status ?? before;
      return {
        job_id: r.id,
        outcome: r.outcome,
        job_status_before: before,
        job_status_after: after,
        status_changed: Boolean(r.would_correct),
        verified_at: verifiedAt,
        pin_url: r.pin_url ?? null,
        error: r.error ?? null,
      };
    });
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const records = buildRecords();
    if (!data || !records.length) return;
    const ts = (data.verified_at ?? new Date().toISOString()).replace(/[:.]/g, "-");
    const header = [
      "job_id",
      "outcome",
      "job_status_before",
      "job_status_after",
      "status_changed",
      "verified_at",
      "pin_url",
      "error",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = records.map((r) =>
      [
        r.job_id,
        r.outcome,
        r.job_status_before ?? "",
        r.job_status_after ?? "",
        r.status_changed ? "yes" : "no",
        r.verified_at,
        r.pin_url ?? "",
        r.error ?? "",
      ]
        .map(esc)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    triggerDownload(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
      `pinterest-verification-${ts}.csv`,
    );
  };

  const downloadJson = () => {
    const records = buildRecords();
    if (!data || !records.length) return;
    const verifiedAt = data.verified_at ?? new Date().toISOString();
    const ts = verifiedAt.replace(/[:.]/g, "-");
    const payload = {
      verified_at: verifiedAt,
      checked: data.checked,
      corrections: data.corrections ?? records.filter((r) => r.status_changed).length,
      pins: records,
    };
    triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `pinterest-verification-${ts}.json`,
    );
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
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!data?.results?.length}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={downloadJson} disabled={!data?.results?.length}>
            <FileJson className="mr-2 h-4 w-4" /> JSON
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

function ConfirmDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preview: Response | null;
  onConfirm: () => void;
}) {
  const counts = (() => {
    const c = { verified: 0, not_found: 0, inaccessible: 0, no_pin_id: 0, corrections: 0 };
    for (const r of preview?.results ?? []) {
      c[r.outcome] += 1;
      if (r.would_correct) c.corrections += 1;
    }
    return c;
  })();
  const transitions = (preview?.results ?? []).filter((r) => r.would_correct);
  const apiCorrections = preview?.corrections ?? counts.corrections;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply status corrections?</AlertDialogTitle>
          <AlertDialogDescription>
            Checked <strong>{preview?.checked ?? 0}</strong> pins against Pinterest.
            <br />
            <strong>{apiCorrections}</strong> job{apiCorrections === 1 ? "" : "s"} will have their status changed if you continue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded border p-2 text-center">
            <div className="text-muted-foreground">Verified</div>
            <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">{counts.verified}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-muted-foreground">Not found</div>
            <div className="text-base font-semibold text-destructive">{counts.not_found}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-muted-foreground">No pin id</div>
            <div className="text-base font-semibold text-destructive">{counts.no_pin_id}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-muted-foreground">Inaccessible</div>
            <div className="text-base font-semibold">{counts.inaccessible}</div>
          </div>
        </div>

        {transitions.length > 0 ? (
          <div className="max-h-60 overflow-auto rounded-md border text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/60 text-left">
                <tr>
                  <th className="px-2 py-1.5">Job</th>
                  <th className="px-2 py-1.5">From</th>
                  <th className="px-2 py-1.5">To</th>
                  <th className="px-2 py-1.5">Reason</th>
                </tr>
              </thead>
              <tbody>
                {transitions.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1 font-mono text-[11px]">{r.id.slice(0, 8)}…</td>
                    <td className="px-2 py-1">{r.current_status ?? "—"}</td>
                    <td className="px-2 py-1 text-amber-700 dark:text-amber-400">{r.next_status ?? "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transitions.length > 100 ? (
              <div className="border-t p-1 text-center text-[11px] text-muted-foreground">
                +{transitions.length - 100} more not shown
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No status changes needed — everything is already in the correct state.</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={apiCorrections === 0}>
            Apply {apiCorrections} correction{apiCorrections === 1 ? "" : "s"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}