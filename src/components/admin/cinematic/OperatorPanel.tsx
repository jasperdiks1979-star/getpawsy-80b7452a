import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, KeyRound, RotateCw, AlertCircle } from "lucide-react";
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