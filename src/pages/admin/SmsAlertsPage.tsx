import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  RotateCcw,
  ShieldCheck,
  Save,
  MessageSquare,
  BarChart3,
  Wallet,
  Activity,
  CalendarClock,
} from "lucide-react";

const FIELDS = [
  { key: "TWILIO_ACCOUNT_SID", label: "Twilio Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token", placeholder: "••••••••••••••••" },
  { key: "TWILIO_FROM_NUMBER", label: "Twilio From Number", placeholder: "+15558675310" },
  { key: "OWNER_ALERT_PHONE", label: "Owner Alert Phone", placeholder: "+15558675310" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

function Metric({ label, value, tone = "muted" }: { label: string; value: string; tone?: "ok" | "warn" | "muted" }) {
  const cls =
    tone === "ok" ? "text-green-600" :
    tone === "warn" ? "text-amber-600" :
    "text-foreground";
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

interface StatusEntry {
  configured: boolean;
  preview: string | null;
  updated_at: string | null;
}
interface LogRow {
  id: string;
  created_at: string;
  alert_type: string;
  status: string;
  twilio_message_sid: string | null;
  error_reason: string | null;
  recipient: string | null;
}
interface StatusResp {
  ok: boolean;
  status: Record<FieldKey, StatusEntry>;
  recent: LogRow[];
  lastTest?: LogRow;
  lastOrder?: LogRow;
  sms_mode?: "sales_only" | "sales_plus_critical" | "all";
}

interface StatsResp {
  ok: boolean;
  totals: {
    total_sent: number;
    sent_today: number;
    failed: number;
    attempts: number;
    success_rate_pct: number | null;
  };
  last_success: { created_at: string; alert_type: string; twilio_message_sid: string | null } | null;
  last_failed: { created_at: string; alert_type: string; error_reason: string | null } | null;
  balance: { amount: string; currency: string } | null;
  balance_error: string | null;
}

interface ProdCheckResp {
  ok: boolean;
  ready: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
}

export default function SmsAlertsPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [prodCheck, setProdCheck] = useState<ProdCheckResp | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM_NUMBER: "",
    OWNER_ALERT_PHONE: "",
  });
  const [validationReport, setValidationReport] =
    useState<{ pass: boolean; checks: { field: string; pass: boolean; reason: string }[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, st] = await Promise.all([
      supabase.functions.invoke("sms-alerts-admin", { body: { action: "status" } }),
      supabase.functions.invoke("sms-alerts-admin", { body: { action: "stats" } }),
    ]);
    if (s.error) {
      toast({ title: "Failed to load status", description: s.error.message, variant: "destructive" });
    } else {
      setStatus(s.data as StatusResp);
    }
    if (!st.error) setStats(st.data as StatsResp);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Access denied</h1>
      </div>
    );
  }

  const run = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("sms-alerts-admin", {
        body: { action, ...extra },
      });
      if (error) throw error;
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: `${action} failed`, description: msg, variant: "destructive" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    const submitted: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) {
      if (values[f.key]) submitted[f.key] = values[f.key];
    }
    if (Object.keys(submitted).length === 0) {
      toast({ title: "Nothing to save", description: "Fill at least one field." });
      return;
    }
    const res = await run("save", { values: submitted });
    if (res?.ok) {
      toast({ title: "Saved", description: `Updated: ${(res.saved as string[]).join(", ")}` });
      setValues({ TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "", OWNER_ALERT_PHONE: "" });
      await refresh();
    }
  };

  const handleTest = async () => {
    const res = await run("test");
    if (res?.ok) toast({ title: "Test SMS sent", description: `Twilio SID: ${res.sid}` });
    else if (res) toast({ title: "Test SMS failed", description: res.error ?? res.message, variant: "destructive" });
    await refresh();
  };

  const handleReplay = async () => {
    const res = await run("replay");
    if (res?.duplicate) toast({ title: "Already sent", description: res.message });
    else if (res?.ok) toast({ title: "Replay SMS sent", description: `Order ${res.order_id?.slice(0, 8)} · SID ${res.sid}` });
    else if (res) toast({ title: "Replay failed", description: res.error ?? res.message, variant: "destructive" });
    await refresh();
  };

  const handleValidate = async () => {
    const res = await run("validate");
    if (res) setValidationReport({ pass: !!res.pass, checks: res.checks ?? [] });
  };

  const handleProdCheck = async () => {
    const res = (await run("production_check")) as ProdCheckResp | null;
    if (res) setProdCheck(res);
  };

  const handleDailySummary = async () => {
    const res = await run("trigger_daily_summary");
    if (res?.ok) toast({ title: "Daily summary triggered", description: "SMS dispatched if Twilio configured." });
    else if (res) toast({ title: "Daily summary failed", description: JSON.stringify(res.result ?? res), variant: "destructive" });
    await refresh();
  };

  const handleSetMode = async (mode: "sales_only" | "sales_plus_critical" | "all") => {
    const res = await run("set_mode", { mode });
    if (res?.ok) toast({ title: "SMS mode updated", description: `Now: ${mode}` });
    await refresh();
  };

  return (
    <>
      <Helmet>
        <title>SMS Alerts — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="mx-auto w-full max-w-2xl p-4 space-y-4 sm:p-6 sm:space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> SMS Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner SMS notifications for paid orders. Secrets stored encrypted; values are never returned.
          </p>
        </header>

        {/* Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide">SMS mode</div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  current: {status?.sms_mode ?? "—"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { v: "sales_only", label: "Sales only", hint: "Default. Real paid orders only." },
                  { v: "sales_plus_critical", label: "Sales + critical", hint: "Adds Stripe/webhook outages." },
                  { v: "all", label: "All alerts / debug", hint: "Pinterest, cron, daily summary, failures." },
                ] as const).map((opt) => {
                  const active = status?.sms_mode === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => handleSetMode(opt.v)}
                      disabled={busy === "set_mode"}
                      className={`text-left rounded-md border p-2 text-xs transition ${
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-accent"
                      }`}
                    >
                      <div className="font-semibold flex items-center gap-1.5">
                        {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                        {opt.label}
                      </div>
                      <div className="text-muted-foreground mt-0.5">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Manual “Send Test SMS” and “Replay Last Order SMS” always send regardless of mode.
              </p>
            </div>
            {loading && !status ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                {FIELDS.map((f) => {
                  const s = status?.status?.[f.key];
                  const ok = s?.configured;
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{f.label}</span>
                      <span className={`flex items-center gap-1.5 font-mono text-xs ${ok ? "text-green-600" : "text-destructive"}`}>
                        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {ok ? s?.preview ?? "set" : "missing"}
                      </span>
                    </div>
                  );
                })}
                <div className="border-t pt-2 mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                  <div>
                    Last test:{" "}
                    <span className="font-mono">
                      {status?.lastTest ? `${status.lastTest.status} · ${new Date(status.lastTest.created_at).toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <div>
                    Last order SMS:{" "}
                    <span className="font-mono">
                      {status?.lastOrder ? `${status.lastOrder.status} · ${new Date(status.lastOrder.created_at).toLocaleString()}` : "—"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Delivery metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!stats ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading metrics…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Total sent" value={String(stats.totals.total_sent)} />
                  <Metric label="Sent today" value={String(stats.totals.sent_today)} />
                  <Metric label="Failed" value={String(stats.totals.failed)} tone={stats.totals.failed > 0 ? "warn" : "ok"} />
                  <Metric
                    label="Success rate"
                    value={stats.totals.success_rate_pct == null ? "—" : `${stats.totals.success_rate_pct}%`}
                    tone={stats.totals.success_rate_pct == null ? "muted" : stats.totals.success_rate_pct >= 95 ? "ok" : "warn"}
                  />
                </div>
                <div className="text-xs space-y-1 border-t pt-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Twilio balance</span>
                    <span className="font-mono">
                      {stats.balance ? `${stats.balance.currency} ${Number(stats.balance.amount).toFixed(2)}` : stats.balance_error ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Last success</span>
                    <span className="font-mono text-muted-foreground">
                      {stats.last_success ? `${stats.last_success.alert_type} · ${new Date(stats.last_success.created_at).toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-destructive"><XCircle className="h-3.5 w-3.5" /> Last failed</span>
                    <span className="font-mono text-muted-foreground truncate max-w-[60%]" title={stats.last_failed?.error_reason ?? ""}>
                      {stats.last_failed ? `${stats.last_failed.alert_type} · ${new Date(stats.last_failed.created_at).toLocaleString()}` : "—"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Config form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configure secrets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key} className="text-sm">{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.key === "TWILIO_AUTH_TOKEN" ? "password" : "text"}
                  inputMode={f.key.includes("NUMBER") || f.key.includes("PHONE") ? "tel" : "text"}
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            ))}
            <Button onClick={handleSave} disabled={busy === "save"} className="w-full">
              {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save secrets
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Leave a field blank to keep its existing value. Values are encrypted at rest and never returned to the browser.
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2">
            <Button onClick={handleTest} disabled={busy === "test"} variant="default">
              {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Test SMS
            </Button>
            <Button onClick={handleReplay} disabled={busy === "replay"} variant="secondary">
              {busy === "replay" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Replay Last Order SMS
            </Button>
            <Button onClick={handleValidate} disabled={busy === "validate"} variant="outline">
              {busy === "validate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Validate Twilio Configuration
            </Button>
            <Button onClick={handleDailySummary} disabled={busy === "trigger_daily_summary"} variant="outline">
              {busy === "trigger_daily_summary" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
              Send Daily Summary Now
            </Button>
            <Button onClick={handleProdCheck} disabled={busy === "production_check"} variant="outline">
              {busy === "production_check" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Production Readiness Check
            </Button>

            {validationReport && (
              <Alert variant={validationReport.pass ? "default" : "destructive"} className="mt-2">
                <AlertDescription className="space-y-1.5">
                  <div className="font-semibold">
                    {validationReport.pass ? "PASS — configuration looks valid" : "FAIL — fix the issues below"}
                  </div>
                  <ul className="text-xs space-y-1">
                    {validationReport.checks.map((c) => (
                      <li key={c.field} className="flex items-start gap-1.5">
                        {c.pass ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                        )}
                        <span><span className="font-mono">{c.field}</span> — {c.reason}</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {prodCheck && (
              <Alert variant={prodCheck.ready ? "default" : "destructive"} className="mt-2">
                <AlertDescription className="space-y-1.5">
                  <div className="font-semibold">
                    {prodCheck.ready ? "🟢 PRODUCTION READY" : "🔴 NOT READY — fix the issues below"}
                  </div>
                  <ul className="text-xs space-y-1">
                    {prodCheck.checks.map((c) => (
                      <li key={c.name} className="flex items-start gap-1.5">
                        {c.pass ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                        )}
                        <span><span className="font-medium">{c.name}</span> — <span className="text-muted-foreground">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Recent logs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent SMS activity</CardTitle>
          </CardHeader>
          <CardContent>
            {!status?.recent?.length ? (
              <p className="text-sm text-muted-foreground">No SMS activity yet.</p>
            ) : (
              <ul className="divide-y">
                {status.recent.map((r) => (
                  <li key={r.id} className="py-2 text-xs flex items-start gap-2">
                    {r.status === "sent" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono">{r.alert_type} · {r.status}</span>
                        <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      {r.twilio_message_sid && (
                        <div className="font-mono text-muted-foreground truncate">SID: {r.twilio_message_sid}</div>
                      )}
                      {r.error_reason && (
                        <div className="text-destructive truncate">{r.error_reason}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}