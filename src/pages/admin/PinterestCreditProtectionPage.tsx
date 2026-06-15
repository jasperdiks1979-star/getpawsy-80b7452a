import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, PauseCircle, Play, Pause, Save, Mail, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface CreditStatus {
  ok: boolean;
  credit_state: "green" | "orange" | "red";
  paused: boolean;
  ai_generation_paused?: boolean;
  publishing_paused?: boolean;
  publishing_status?: "RUNNING" | "IDLE" | "BLOCKED";
  publishing_message?: string;
  manual_pause: boolean;
  emergency_mode: boolean;
  estimated_credits_pct: number;
  credits_balance_initial: number | null;
  credits_remaining: number | null;
  credits_used_since_set: number;
  avg_credits_per_creative: number | null;
  daily_burn_rate: number | null;
  estimated_creatives_remaining: number | null;
  estimated_hours_remaining: number | null;
  estimated_days_remaining: number | null;
  estimated_depletion_at: string | null;
  emergency_creative_threshold: number;
  alert_recipient_email: string | null;
  forecast_updated_at: string | null;
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
  const [busy, setBusy] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [emailInput, setEmailInput] = useState("");

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

  const control = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("pinterest-credit-control", {
      body: { action, ...payload },
    });
    setBusy(null);
    if (error || !(data as any)?.ok) {
      toast.error(`${action} failed: ${(data as any)?.message ?? error?.message ?? "unknown"}`);
    } else {
      toast.success(`${action} ok`);
    }
    await fetchStatus();
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
  const fmtNum = (n: number | null | undefined, d = 0) =>
    n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "—";

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
        <div className="flex gap-2">
          {status.manual_pause || status.paused ? (
            <Button onClick={() => control("resume")} size="sm" disabled={busy !== null}>
              {busy === "resume" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Resume generation
            </Button>
          ) : (
            <Button onClick={() => control("pause", { reason: "operator" })} variant="destructive" size="sm" disabled={busy !== null}>
              {busy === "pause" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pause className="h-4 w-4 mr-2" />}
              Pause generation
            </Button>
          )}
          <Button onClick={runProbe} variant="outline" size="sm" disabled={probing}>
            {probing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run probe
          </Button>
        </div>
      </header>

      {status.emergency_mode && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <Zap className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Emergency mode active.</strong> Estimated &lt; {status.emergency_creative_threshold} creatives remaining.
            Generation throttled to high-priority categories only
            (Smart Litter, Cat Trees, Interactive Cat Toys, Dog Puzzle Toys, Cat Furniture).
          </div>
        </div>
      )}

      {/* Lane split: AI generation vs publishing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">AI Generation Lane</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge
              variant={status.credit_state === "green" ? "secondary" : "destructive"}
              className={
                status.credit_state === "green" ? "bg-emerald-100 text-emerald-900" :
                status.credit_state === "orange" ? "bg-amber-100 text-amber-900" :
                "bg-rose-100 text-rose-900"
              }
            >
              {status.credit_state.toUpperCase()}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {status.ai_generation_paused ?? status.paused ? "Paused — creative/regen calls skipped" : "Creative generation active"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pinterest Publishing Lane</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge
                className={
                  status.publishing_status === "RUNNING" ? "bg-emerald-100 text-emerald-900" :
                  status.publishing_status === "IDLE" ? "bg-slate-100 text-slate-900" :
                  "bg-rose-100 text-rose-900"
                }
              >
                {status.publishing_status ?? "RUNNING"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {status.pins_published_last_hour} pins / last hour · {status.queue_count} queued
              </span>
            </div>
            {status.publishing_message && (
              <p className="text-xs text-muted-foreground">{status.publishing_message}</p>
            )}
          </CardContent>
        </Card>
      </div>

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
              {status.estimated_days_remaining != null && (
                <Badge variant="outline">
                  ~{status.estimated_days_remaining.toFixed(1)}d remaining
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              {status.manual_pause && <Badge variant="destructive">Manual pause</Badge>}
              {status.paused && !status.manual_pause && <Badge variant="destructive">Auto-paused</Badge>}
              {status.emergency_mode && <Badge variant="outline" className="border-amber-500 text-amber-700">Emergency</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Credits remaining" value={fmtNum(status.credits_remaining)} />
            <Metric label="Creatives remaining" value={fmtNum(status.estimated_creatives_remaining)} accent={status.emergency_mode ? "warn" : undefined} />
            <Metric label="Daily burn" value={fmtNum(status.daily_burn_rate, 1)} />
            <Metric label="Avg / creative" value={fmtNum(status.avg_credits_per_creative, 2)} />
            <Metric label="Hours left" value={status.estimated_hours_remaining == null ? "—" : `${status.estimated_hours_remaining.toFixed(1)}h`} />
            <Metric label="Days left" value={status.estimated_days_remaining == null ? "—" : `${status.estimated_days_remaining.toFixed(1)}d`} />
            <Metric label="Depletes" value={fmtDate(status.estimated_depletion_at)} />
            <Metric label="Open regen jobs" value={status.open_regen_jobs} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
            <Metric label="Successes (1h)" value={status.recent_success_count_1h} />
            <Metric label="402s (1h)" value={status.recent_402_count_1h} accent={status.recent_402_count_1h > 0 ? "warn" : undefined} />
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
              <strong>1–7 days of credits remaining.</strong> Consider topping up before depletion.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration card */}
      <Card>
        <CardHeader><CardTitle className="text-base">Forecast configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Set credit balance</label>
              <Input
                type="number"
                placeholder={status.credits_balance_initial ? String(status.credits_balance_initial) : "e.g. 5000"}
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
              />
            </div>
            <Button
              onClick={() => { void control("set_balance", { amount: Number(balanceInput) }); setBalanceInput(""); }}
              disabled={busy !== null || !balanceInput}
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" /> Save balance
            </Button>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Alert recipient email</label>
              <Input
                type="email"
                placeholder={status.alert_recipient_email ?? "ops@example.com"}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>
            <Button
              onClick={() => { void control("set_recipient", { email: emailInput }); setEmailInput(""); }}
              disabled={busy !== null || !emailInput}
              size="sm"
              variant="outline"
            >
              <Mail className="h-4 w-4 mr-2" /> Save recipient
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Last forecast: {fmtDate(status.forecast_updated_at)} · Emergency threshold: &lt; {status.emergency_creative_threshold} creatives
            {status.credits_balance_initial == null && (
              <span className="block mt-1 text-amber-700">
                Set a credit balance to enable depletion forecasting.
              </span>
            )}
          </div>
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