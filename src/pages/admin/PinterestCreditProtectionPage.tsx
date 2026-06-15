import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";

interface CreditStatus {
  ok: boolean;
  credit_state: "green" | "orange" | "red";
  paused: boolean;
  estimated_credits_pct: number;
  last_success_at: string | null;
  last_402_at: string | null;
  consecutive_402_count: number;
  recent_success_count_1h: number;
  recent_402_count_1h: number;
  open_regen_jobs: number;
  draft_count: number;
  queue_count: number;
  pins_published_last_hour: number;
  pins_published_last_24h: number;
  last_published: { updated_at: string; pinterest_pin_id: string; board_name: string; product_slug: string } | null;
  recent_events: Array<{
    id: string;
    event_type: string;
    status_code: number | null;
    function_name: string | null;
    message: string | null;
    created_at: string;
  }>;
}

const STATE_COLOR: Record<CreditStatus["credit_state"], string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-rose-600",
};
const STATE_LABEL: Record<CreditStatus["credit_state"], string> = {
  green: "Healthy",
  orange: "Degraded",
  red: "Exhausted",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PinterestCreditProtectionPage() {
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);

  const fetchStatus = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("pinterest-credit-status", {});
    if (!error && data) setStatus(data as CreditStatus);
    setLoading(false);
  }, []);

  const runProbe = useCallback(async () => {
    setProbing(true);
    await supabase.functions.invoke("pinterest-credit-probe", {});
    await fetchStatus();
    setProbing(false);
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!status) {
    return <div className="p-8 text-muted-foreground">Failed to load credit status.</div>;
  }

  const stateColor = STATE_COLOR[status.credit_state];
  const stateLabel = STATE_LABEL[status.credit_state];

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pinterest Credit Protection</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitors Lovable AI Gateway capacity. Auto-pauses creative generation on credit exhaustion.
            Publish pipeline (drafts → queued → posted) is never paused.
          </p>
        </div>
        <Button onClick={runProbe} variant="outline" size="sm" disabled={probing}>
          {probing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run probe
        </Button>
      </header>

      {/* Hero status card */}
      <Card className="overflow-hidden">
        <div className={`h-2 ${stateColor}`} />
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status.credit_state === "green" && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
              {status.credit_state === "orange" && <AlertTriangle className="h-6 w-6 text-amber-600" />}
              {status.credit_state === "red" && <PauseCircle className="h-6 w-6 text-rose-600" />}
              <CardTitle>{stateLabel}</CardTitle>
            </div>
            {status.paused && <Badge variant="destructive">Generation paused</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Estimated capacity" value={`${status.estimated_credits_pct}%`} />
            <Metric label="Successes (1h)" value={status.recent_success_count_1h} />
            <Metric label="402s (1h)" value={status.recent_402_count_1h} accent={status.recent_402_count_1h > 0 ? "warn" : undefined} />
            <Metric label="Consecutive 402s" value={status.consecutive_402_count} accent={status.consecutive_402_count > 0 ? "warn" : undefined} />
            <Metric label="Last success" value={timeAgo(status.last_success_at)} />
            <Metric label="Last 402" value={timeAgo(status.last_402_at)} />
          </div>
          {status.credit_state === "red" && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <strong>Credits exhausted.</strong> Generation is paused. Top up Lovable AI credits;
              the cron probe will detect recovery within 10 minutes and resume automatically.
            </div>
          )}
          {status.credit_state === "orange" && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Capacity degraded.</strong> Recent 402 detected but generation is currently flowing.
              Consider topping up credits soon.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline metrics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PipelineCard label="Open regen jobs" value={status.open_regen_jobs} />
        <PipelineCard label="Drafts" value={status.draft_count} />
        <PipelineCard label="Queued" value={status.queue_count} />
        <PipelineCard label="Posted (24h)" value={status.pins_published_last_24h} sub={`${status.pins_published_last_hour} in last hour`} />
      </div>

      {/* Last publish */}
      <Card>
        <CardHeader><CardTitle className="text-base">Last successful publish</CardTitle></CardHeader>
        <CardContent>
          {status.last_published ? (
            <div className="space-y-1 text-sm">
              <div><span className="text-muted-foreground">When:</span> {timeAgo(status.last_published.updated_at)}</div>
              <div><span className="text-muted-foreground">Pin ID:</span>{" "}
                <a className="underline" href={`https://www.pinterest.com/pin/${status.last_published.pinterest_pin_id}/`} target="_blank" rel="noreferrer">
                  {status.last_published.pinterest_pin_id}
                </a>
              </div>
              <div><span className="text-muted-foreground">Board:</span> {status.last_published.board_name}</div>
              <div><span className="text-muted-foreground">Product:</span> {status.last_published.product_slug}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No published pins yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent credit events</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs font-mono max-h-80 overflow-auto">
            {status.recent_events.length === 0 && (
              <div className="text-muted-foreground">No events recorded.</div>
            )}
            {status.recent_events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-1 border-b last:border-0">
                <span className="text-muted-foreground w-20 shrink-0">{timeAgo(e.created_at)}</span>
                <EventBadge type={e.event_type} />
                <span className="text-muted-foreground truncate">{e.function_name ?? "—"}</span>
                <span className="truncate">{e.message ?? ""}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: "warn" }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent === "warn" ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}

function PipelineCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EventBadge({ type }: { type: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    success: { variant: "secondary", label: "OK" },
    probe_success: { variant: "secondary", label: "Probe OK" },
    payment_required: { variant: "destructive", label: "402" },
    probe_failed: { variant: "destructive", label: "Probe ✗" },
    rate_limited: { variant: "outline", label: "429" },
    error: { variant: "destructive", label: "Err" },
    paused: { variant: "destructive", label: "Paused" },
    resumed: { variant: "default", label: "Resumed" },
    warning: { variant: "destructive", label: "Warn" },
  };
  const m = map[type] ?? { variant: "outline" as const, label: type };
  return <Badge variant={m.variant} className="w-20 justify-center shrink-0">{m.label}</Badge>;
}