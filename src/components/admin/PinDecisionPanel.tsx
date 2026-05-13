import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, SkipForward, Copy } from "lucide-react";
import { toast } from "sonner";

type Phase = {
  key: string;
  label: string;
  status: "ok" | "fail" | "skip";
  rootCause: string;
  detail?: unknown;
};

function copyText(text: string, label = "Copied") {
  try {
    navigator.clipboard.writeText(text);
    toast.success(`${label}: ${text.slice(0, 40)}${text.length > 40 ? "…" : ""}`);
  } catch {
    toast.error("Clipboard unavailable");
  }
}

function buildTraceId(diagnostic: any): string {
  const product = diagnostic?.first_eligible_product?.id || "no-product";
  const board = diagnostic?.board_status?.selected_board?.id || "no-board";
  const ts = Date.now().toString(36);
  return `pin-trace-${String(product).slice(0, 8)}-${String(board).slice(-6)}-${ts}`;
}

function buildPhasesFromDiagnostic(d: any): Phase[] {
  if (!d) return [];
  const phases: Phase[] = [];
  const reasonHit = (cond: boolean, ok: string, fail: string): Phase["status"] => (cond ? "ok" : "fail");

  // 1. Token
  const tokenOk = !!d.token_status?.present;
  phases.push({
    key: "token",
    label: "1 · Pinterest token",
    status: tokenOk ? "ok" : "fail",
    rootCause: tokenOk
      ? `Token present (refreshed=${d.token_status?.refreshed ? "yes" : "no"}, prefix=${d.token_status?.prefix || "—"})`
      : "No Pinterest access token stored — reconnect Pinterest in Connectors",
    detail: d.token_status,
  });

  // 2. Auth
  const authOk = !!d.auth_status?.valid;
  phases.push({
    key: "auth",
    label: "2 · Auth validation",
    status: !tokenOk ? "skip" : authOk ? "ok" : "fail",
    rootCause: !tokenOk
      ? "Skipped — no token to validate"
      : authOk
        ? "Pinterest /v5/user_account responded OK"
        : "Pinterest rejected the access token (expired, revoked, or scope mismatch)",
    detail: d.auth_status,
  });

  // 3. Boards
  const boardOk = !!d.board_status?.ok;
  phases.push({
    key: "board",
    label: "3 · Production board",
    status: !authOk ? "skip" : boardOk ? "ok" : "fail",
    rootCause: !authOk
      ? "Skipped — auth failed upstream"
      : boardOk
        ? `Selected board "${d.board_status?.selected_board?.name || d.board_status?.selected_board?.id}" (${d.board_status?.board_count} eligible)`
        : "No production-eligible Pinterest board (sandbox-only, blacklisted, or none with US scope)",
    detail: d.board_status,
  });

  // 4. Product picker
  const productOk = !!d.first_eligible_product;
  phases.push({
    key: "product",
    label: "4 · Cold-start product",
    status: productOk ? "ok" : "fail",
    rootCause: productOk
      ? `Picked "${d.first_eligible_product?.name}" (score ${d.first_eligible_product?.score})`
      : "No active in-stock product with valid slug + image_url",
    detail: d.first_eligible_product,
  });

  // 5. Media
  const mediaOk = !!d.media_status?.ok;
  phases.push({
    key: "media",
    label: "5 · Media reachability",
    status: !productOk ? "skip" : mediaOk ? "ok" : "fail",
    rootCause: !productOk
      ? "Skipped — no product"
      : mediaOk
        ? `Image reachable (HTTP ${d.media_status?.status_code || 200}, type ${d.media_status?.content_type || "image/*"})`
        : `Image blocked: ${d.media_status?.reason || "unknown"}`,
    detail: d.media_status,
  });

  // 6. Caps
  const caps = d.cap_status;
  const capOk = !!caps?.ok;
  phases.push({
    key: "caps",
    label: "6 · Cold-start caps",
    status: capOk ? "ok" : "fail",
    rootCause: caps
      ? capOk
        ? `Within budget — daily ${caps.daily}/${caps.daily_limit}, weekly ${caps.weekly}/${caps.weekly_limit}`
        : `Cap reached — daily ${caps.daily}/${caps.daily_limit}, weekly ${caps.weekly}/${caps.weekly_limit}`
      : "No cap data",
    detail: caps,
  });

  // 7. Payload
  const payload = d.payload_validation_status;
  const payloadOk = !!payload?.ok;
  phases.push({
    key: "payload",
    label: "7 · Payload sanitization",
    status: !productOk || !boardOk ? "skip" : payloadOk ? "ok" : "fail",
    rootCause: !productOk || !boardOk
      ? "Skipped — product/board not resolved"
      : payloadOk
        ? `Payload valid (coerced ${payload?.coerced_fields?.length || 0} field(s))`
        : `Payload invalid: ${(payload?.rejected_fields || []).map((f: any) => f.path || f).join(", ") || payload?.reason || "unknown"}`,
    detail: payload,
  });

  // 8. Final verdict
  const finalReason = d.exact_reason_if_no_pin_can_be_published;
  phases.push({
    key: "verdict",
    label: "8 · Final verdict",
    status: !finalReason ? "ok" : "fail",
    rootCause: !finalReason ? "PUBLISHABLE — pin would post normally" : `SKIP — ${finalReason}`,
  });

  return phases;
}

function buildPhasesFromLog(log: any): Phase[] {
  if (!log?.log || !Array.isArray(log.log)) return [];
  return log.log.map((entry: any, i: number) => ({
    key: `${entry.step}_${i}`,
    label: `${i + 1} · ${entry.step}`,
    status: entry.ok ? "ok" : "fail",
    rootCause: entry.ok
      ? "OK"
      : (entry.detail && typeof entry.detail === "object"
          ? (entry.detail as any).reason || (entry.detail as any).error || JSON.stringify(entry.detail).slice(0, 140)
          : String(entry.detail || log.error || "Failed")),
    detail: entry.detail,
  }));
}

function PhaseRow({ phase, traceId }: { phase: Phase; traceId: string }) {
  const Icon = phase.status === "ok" ? CheckCircle2 : phase.status === "skip" ? SkipForward : XCircle;
  const color = phase.status === "ok" ? "text-green-600" : phase.status === "skip" ? "text-muted-foreground" : "text-destructive";
  const phaseTrace = `${traceId}::${phase.key}`;
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm">{phase.label}</div>
          <Badge
            variant={phase.status === "ok" ? "default" : phase.status === "skip" ? "secondary" : "destructive"}
            className="text-[10px]"
          >
            {phase.status.toUpperCase()}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground break-words">{phase.rootCause}</div>
        <div className="flex items-center gap-2 pt-1">
          <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono break-all">
            {phaseTrace}
          </code>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyText(phaseTrace, "Phase traceId")}>
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PinDecisionPanel({ diagnostic, testPublishLog }: { diagnostic: any; testPublishLog: any }) {
  const traceId = buildTraceId(diagnostic);
  const diagnosticPhases = buildPhasesFromDiagnostic(diagnostic);
  const logPhases = buildPhasesFromLog(testPublishLog);
  const verdict = diagnostic?.exact_reason_if_no_pin_can_be_published;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Pin-level decision panel</CardTitle>
            <CardDescription>
              Chronological phase breakdown for the next pin candidate — every phase shows OK / SKIP / FAIL with the exact root cause and a copy-able traceId.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={verdict ? "destructive" : "default"}>
              {verdict ? "WOULD SKIP" : "WOULD PUBLISH"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => copyText(traceId, "Run traceId")}>
              <Copy className="h-3 w-3 mr-1" />
              {traceId}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!diagnostic ? (
          <div className="text-sm text-muted-foreground">Run a full diagnostic to populate phase breakdown.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Diagnostic phases (current pin candidate)
            </div>
            {diagnosticPhases.map((p) => (
              <PhaseRow key={p.key} phase={p} traceId={traceId} />
            ))}
          </div>
        )}

        {logPhases.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Last test publish run (chronological)
            </div>
            {logPhases.map((p) => (
              <PhaseRow key={p.key} phase={p} traceId={`${traceId}-test`} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}