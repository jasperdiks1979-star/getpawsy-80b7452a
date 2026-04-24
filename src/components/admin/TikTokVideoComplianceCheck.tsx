import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  validateFile,
  type ComplianceIssue,
  type ComplianceReport,
} from "@/lib/tiktok/video-compliance";

/**
 * Renders a TikTok-spec compliance report for a chosen video file.
 *
 * Behaviour:
 *   • Re-runs validation whenever `file` changes.
 *   • Calls `onResult` so the parent can disable the upload button when
 *     `passes === false` (errors block uploads, warnings only inform).
 *   • Renders nothing when no file is selected — the parent owns the
 *     "choose a file" UI.
 */
export function TikTokVideoComplianceCheck({
  file,
  onResult,
}: {
  file: File | null;
  onResult?: (report: ComplianceReport | null) => void;
}) {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setReport(null);
      onResult?.(null);
      return;
    }
    setLoading(true);
    validateFile(file)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        onResult?.(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We deliberately omit onResult from deps — callers usually pass an
    // inline arrow which would otherwise re-trigger validation forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!file) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking TikTok compatibility…
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <ComplianceHeader report={report} />
      <ComplianceMetadata report={report} />
      {report.issues.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {report.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ComplianceHeader({ report }: { report: ComplianceReport }) {
  const { passes, summary } = report;
  const Icon = passes ? ShieldCheck : XCircle;
  const color = passes ? "text-primary" : "text-destructive";
  const label = passes
    ? summary.warningCount === 0
      ? "Ready for TikTok"
      : `Ready (${summary.warningCount} warning${
          summary.warningCount === 1 ? "" : "s"
        })`
    : `Blocked: ${summary.errorCount} error${
        summary.errorCount === 1 ? "" : "s"
      }`;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      {passes && (
        <Badge variant="outline" className="text-[10px] uppercase">
          TikTok Content Posting API
        </Badge>
      )}
    </div>
  );
}

function ComplianceMetadata({ report }: { report: ComplianceReport }) {
  const { metadata, file } = report;
  if (!metadata) return null;
  const aspect = metadata.height
    ? (metadata.width / metadata.height).toFixed(2)
    : "?";
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
      <Stat label="Resolution" value={`${metadata.width}×${metadata.height}`} />
      <Stat label="Aspect" value={`${aspect}:1`} />
      <Stat
        label="Duration"
        value={
          metadata.durationSeconds < 60
            ? `${metadata.durationSeconds.toFixed(1)}s`
            : `${Math.floor(metadata.durationSeconds / 60)}m${Math.round(
                metadata.durationSeconds % 60,
              )
                .toString()
                .padStart(2, "0")}s`
        }
      />
      <Stat label="Size" value={fmtBytes(file.sizeBytes)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div className="font-mono text-foreground">{value}</div>
    </div>
  );
}

function IssueRow({ issue }: { issue: ComplianceIssue }) {
  const Icon =
    issue.severity === "error"
      ? XCircle
      : issue.severity === "warning"
        ? AlertTriangle
        : Info;
  const color =
    issue.severity === "error"
      ? "text-destructive"
      : issue.severity === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  const bg =
    issue.severity === "error"
      ? "bg-destructive/10"
      : issue.severity === "warning"
        ? "bg-muted/40"
        : "bg-muted/20";

  return (
    <li className={`flex items-start gap-2 rounded-md ${bg} px-2.5 py-2 text-xs`}>
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
      <div>
        <div className="font-medium text-foreground">{issue.title}</div>
        <div className="text-muted-foreground">{issue.detail}</div>
      </div>
    </li>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}