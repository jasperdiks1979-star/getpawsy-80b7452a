import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wrench, KeyRound, RotateCw, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";

type Envelope = {
  success: boolean;
  status: string;
  message: string;
  details?: unknown;
  timestamp: string;
};

const ACTIONS: { id: string; label: string }[] = [
  { id: "debug_panel", label: "Debug panel" },
  { id: "validate_secrets", label: "Validate secrets" },
  { id: "test_supabase", label: "Test Supabase" },
  { id: "test_pinterest", label: "Test Pinterest" },
  { id: "health_proxy", label: "Worker health" },
  { id: "queue_test_job", label: "Queue test job" },
  { id: "process_once", label: "Process once" },
];

export default function OperatorPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<Envelope | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [exportFrom, setExportFrom] = useState<string>(weekAgo);
  const [exportTo, setExportTo] = useState<string>(today);

  const run = async (action: string) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-operator", {
        body: { action },
      });
      if (error) throw error;
      const env = data as Envelope;
      setLast(env);
      if (env.success) toast.success(env.message);
      else toast.error(env.message);
    } catch (e) {
      const msg = (e as Error).message ?? "Request failed";
      toast.error(msg);
      setLast({ success: false, status: "client_error", message: msg, timestamp: new Date().toISOString() });
    } finally {
      setBusy(null);
    }
  };

  const testElevenLabs = async () => {
    const id = "test_elevenlabs";
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("elevenlabs-key-test");
      if (error) throw error;
      const r = data as { ok: boolean; status: string; message: string; meta?: unknown; httpStatus?: number; elevenlabs?: unknown; timestamp: string };
      const env: Envelope = {
        success: !!r.ok,
        status: r.status,
        message: r.message,
        details: { meta: r.meta, httpStatus: r.httpStatus, elevenlabs: r.elevenlabs },
        timestamp: r.timestamp,
      };
      setLast(env);
      if (env.success) toast.success(env.message);
      else toast.error(env.message);
    } catch (e) {
      const msg = (e as Error).message ?? "Request failed";
      toast.error(msg);
      setLast({ success: false, status: "client_error", message: msg, timestamp: new Date().toISOString() });
    } finally {
      setBusy(null);
    }
  };

  const backfillVoiceovers = async (force = false) => {
    const id = force ? "backfill_vo_force" : "backfill_vo";
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-voiceover-backfill", {
        body: { limit: 25, force },
      });
      if (error) throw error;
      const r = data as {
        ok: boolean;
        state: string;
        message: string;
        processed?: number;
        succeeded?: number;
        failed?: number;
        skipped?: number;
        results?: unknown;
        key_fingerprint?: string;
      };
      const env: Envelope = {
        success: !!r.ok,
        status: r.state,
        message: r.message,
        details: {
          processed: r.processed,
          succeeded: r.succeeded,
          failed: r.failed,
          skipped: r.skipped,
          key_fingerprint: r.key_fingerprint,
          results: r.results,
        },
        timestamp: new Date().toISOString(),
      };
      setLast(env);
      if (env.success) toast.success(env.message);
      else if (r.state === "circuit_open") toast.error("Breaker open — rotate ElevenLabs key");
      else toast.error(env.message);
    } catch (e) {
      const msg = (e as Error).message ?? "Request failed";
      toast.error(msg);
      setLast({ success: false, status: "client_error", message: msg, timestamp: new Date().toISOString() });
    } finally {
      setBusy(null);
    }
  };

  const inspectVoErrors = async () => {
    const id = "inspect_vo_errors";
    setBusy(id);
    try {
      const { data, error } = await supabase
        .from("cinematic_ad_jobs")
        .select("id, product_slug, status, voiceover_url, voiceover_error, voiceover_last_attempt_at")
        .not("voiceover_error", "is", null)
        .order("voiceover_last_attempt_at", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        product_slug: string;
        voiceover_url: string | null;
        voiceover_error: Record<string, unknown> | null;
        voiceover_last_attempt_at: string | null;
      }>;
      const env: Envelope = {
        success: rows.length === 0,
        status: rows.length === 0 ? "clean" : `${rows.length} jobs with errors`,
        message: rows.length === 0
          ? "No voiceover errors logged"
          : `${rows.length} jobs have a voiceover_error logged`,
        details: rows.map((r) => ({
          job_id: r.id,
          slug: r.product_slug,
          has_vo: !!r.voiceover_url,
          last_attempt: r.voiceover_last_attempt_at,
          code: r.voiceover_error?.code,
          message: r.voiceover_error?.message,
          provider_status: r.voiceover_error?.provider_status,
          provider_body: r.voiceover_error?.provider_body,
          beat: r.voiceover_error?.beat,
          backfill_attempts: r.voiceover_error?.backfill_attempts,
        })),
        timestamp: new Date().toISOString(),
      };
      setLast(env);
      if (rows.length === 0) toast.success("No voiceover errors logged");
      else toast.message(env.message);
    } catch (e) {
      const msg = (e as Error).message ?? "Request failed";
      toast.error(msg);
      setLast({ success: false, status: "client_error", message: msg, timestamp: new Date().toISOString() });
    } finally {
      setBusy(null);
    }
  };

  const exportVoErrors = async (format: "csv" | "json") => {
    const id = `export_vo_${format}`;
    setBusy(id);
    try {
      const fromIso = new Date(`${exportFrom}T00:00:00.000Z`).toISOString();
      const toIso = new Date(`${exportTo}T23:59:59.999Z`).toISOString();
      const { data, error } = await supabase
        .from("cinematic_ad_jobs")
        .select("id, product_slug, status, voiceover_url, voiceover_error, voiceover_last_attempt_at, created_at, updated_at")
        .not("voiceover_error", "is", null)
        .gte("voiceover_last_attempt_at", fromIso)
        .lte("voiceover_last_attempt_at", toIso)
        .order("voiceover_last_attempt_at", { ascending: false, nullsFirst: false })
        .limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        product_slug: string;
        status: string;
        voiceover_url: string | null;
        voiceover_error: Record<string, unknown> | null;
        voiceover_last_attempt_at: string | null;
        created_at: string;
        updated_at: string;
      }>;

      const stamp = `${exportFrom}_to_${exportTo}`;
      let blob: Blob;
      let filename: string;

      if (format === "json") {
        blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
        filename = `vo-errors_${stamp}.json`;
      } else {
        const cols = [
          "job_id",
          "slug",
          "status",
          "has_voiceover",
          "last_attempt_at",
          "created_at",
          "updated_at",
          "error_code",
          "error_message",
          "provider_status",
          "http_status",
          "beat",
          "attempt",
          "backfill_attempts",
          "backfill_last_status",
          "key_fingerprint",
          "trace_id",
          "provider_body",
        ];
        const esc = (v: unknown) => {
          if (v == null) return "";
          const s = typeof v === "string" ? v : JSON.stringify(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [cols.join(",")];
        for (const r of rows) {
          const e = r.voiceover_error ?? {};
          lines.push([
            r.id,
            r.product_slug,
            r.status,
            r.voiceover_url ? "true" : "false",
            r.voiceover_last_attempt_at ?? "",
            r.created_at,
            r.updated_at,
            (e as any).code,
            (e as any).message,
            (e as any).provider_status,
            (e as any).http_status,
            (e as any).beat,
            (e as any).attempt,
            (e as any).backfill_attempts,
            (e as any).backfill_last_status,
            (e as any).key_fingerprint,
            (e as any).trace_id,
            (e as any).provider_body,
          ].map(esc).join(","));
        }
        blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        filename = `vo-errors_${stamp}.csv`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setLast({
        success: true,
        status: `exported_${format}`,
        message: `Exported ${rows.length} VO error rows (${format.toUpperCase()})`,
        details: { from: fromIso, to: toIso, count: rows.length, filename },
        timestamp: new Date().toISOString(),
      });
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      const msg = (e as Error).message ?? "Export failed";
      toast.error(msg);
      setLast({ success: false, status: "client_error", message: msg, timestamp: new Date().toISOString() });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" /> Operator panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant="outline"
              disabled={busy === a.id}
              onClick={() => run(a.id)}
            >
              {busy === a.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {a.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "test_elevenlabs"}
            onClick={testElevenLabs}
          >
            {busy === "test_elevenlabs" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            Test ElevenLabs key
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "backfill_vo"}
            onClick={() => backfillVoiceovers(false)}
          >
            {busy === "backfill_vo" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="mr-2 h-4 w-4" />
            )}
            Backfill voiceovers
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy === "backfill_vo_force"}
            onClick={() => backfillVoiceovers(true)}
            title="Bypass circuit breaker (re-validate key + retry even if previously invalid)"
          >
            {busy === "backfill_vo_force" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Force retry
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "inspect_vo_errors"}
            onClick={inspectVoErrors}
            title="Show the latest voiceover_error details for jobs where voiceover_url is null"
          >
            {busy === "inspect_vo_errors" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <AlertCircle className="mr-2 h-4 w-4" />
            )}
            Inspect VO errors
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">From</Label>
            <Input
              type="date"
              value={exportFrom}
              max={exportTo}
              onChange={(e) => setExportFrom(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">To</Label>
            <Input
              type="date"
              value={exportTo}
              min={exportFrom}
              max={today}
              onChange={(e) => setExportTo(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "export_vo_csv" || !exportFrom || !exportTo}
            onClick={() => exportVoErrors("csv")}
            title="Download CSV of voiceover_error + attempt history in the selected date range"
          >
            {busy === "export_vo_csv" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy === "export_vo_json" || !exportFrom || !exportTo}
            onClick={() => exportVoErrors("json")}
          >
            {busy === "export_vo_json" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export JSON
          </Button>
        </div>
        {last ? (
          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant={last.success ? "secondary" : "destructive"}>{last.status}</Badge>
              <span className="font-medium">{last.message}</span>
              <span className="ml-auto text-muted-foreground">{new Date(last.timestamp).toLocaleTimeString()}</span>
            </div>
            {last.details ? (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Details</summary>
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                  {JSON.stringify(last.details, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Run an action to see live JSON output. All endpoints return {"{ success, status, message, details, timestamp }"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}