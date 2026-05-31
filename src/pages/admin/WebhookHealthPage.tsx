import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Health = {
  ok: boolean;
  healthy: boolean;
  message: string;
  endpoint: string;
  ping: { reachable: boolean; status: number; signature_validation_active: boolean; ms: number };
  orders_30d: {
    total: number;
    paid: number;
    pending: number;
    last_paid_at: string | null;
    last_paid_id: string | null;
    last_paid_amount: number | null;
    last_paid_currency: string | null;
  };
  stripe_events: Array<{ id: string; type: string; created: number; pending_webhooks: number }>;
  stripe_error: string | null;
  recent_orders: Array<{
    id: string;
    status: string;
    total_amount: number;
    currency: string;
    created_at: string;
    stripe_session_id: string | null;
    stripe_payment_intent_id: string | null;
  }>;
};

export default function WebhookHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("webhook-health", { body: {} });
    if (err) setError(err.message);
    else setData(res as Health);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Helmet>
        <title>Stripe Webhook Health — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="container max-w-5xl py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Stripe Webhook Health</h1>
            <p className="text-muted-foreground mt-1">
              Live status of <code className="text-xs">stripe-webhook</code> + recent payment activity.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer">
                Stripe Dashboard <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
            <Button size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !data && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </div>
        )}

        {data && (
          <>
            <Card className={data.healthy ? "border-emerald-500/40" : "border-amber-500/40"}>
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {data.healthy ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  )}
                  {data.healthy ? "All systems operational" : "Needs attention"}
                </CardTitle>
                <Badge variant={data.healthy ? "default" : "destructive"}>
                  {data.healthy ? "Healthy" : "Degraded"}
                </Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="Endpoint reachable" value={data.ping.reachable ? "Yes" : "No"} ok={data.ping.reachable} />
                <Stat label="Signature validation" value={data.ping.signature_validation_active ? "Active" : "Off"} ok={data.ping.signature_validation_active} />
                <Stat label="Ping latency" value={`${data.ping.ms} ms`} ok={data.ping.ms < 2000} />
                <Stat label="Response code" value={String(data.ping.status)} ok={data.ping.status === 400} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Orders — last 30 days</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-3 text-sm">
                  <Stat label="Total" value={String(data.orders_30d.total)} />
                  <Stat label="Paid" value={String(data.orders_30d.paid)} ok={data.orders_30d.paid > 0} />
                  <Stat label="Pending" value={String(data.orders_30d.pending)} />
                  <div className="col-span-3 pt-2 text-xs text-muted-foreground">
                    Last paid:{" "}
                    {data.orders_30d.last_paid_at
                      ? `${new Date(data.orders_30d.last_paid_at).toLocaleString()} — ${data.orders_30d.last_paid_amount} ${data.orders_30d.last_paid_currency?.toUpperCase()}`
                      : "—"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Recent Stripe events</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm max-h-60 overflow-auto">
                  {data.stripe_error && (
                    <div className="text-xs text-destructive">{data.stripe_error}</div>
                  )}
                  {data.stripe_events.length === 0 && !data.stripe_error && (
                    <div className="text-muted-foreground text-xs">No recent events.</div>
                  )}
                  {data.stripe_events.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 border-b last:border-0 py-1">
                      <div className="min-w-0 truncate">
                        <span className="font-mono text-xs">{e.type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{new Date(e.created * 1000).toLocaleString()}</span>
                        {e.pending_webhooks > 0 ? (
                          <Badge variant="destructive">{e.pending_webhooks} pending</Badge>
                        ) : (
                          <Badge variant="outline">delivered</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent orders</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left border-b">
                        <th className="py-2 pr-3">When</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Amount</th>
                        <th className="py-2 pr-3">Session</th>
                        <th className="py-2 pr-3">PI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_orders.map((o) => (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={o.status === "paid" ? "default" : "outline"}>{o.status}</Badge>
                          </td>
                          <td className="py-2 pr-3">{o.total_amount} {o.currency?.toUpperCase()}</td>
                          <td className="py-2 pr-3">{o.stripe_session_id ? "✓" : "—"}</td>
                          <td className="py-2 pr-3">{o.stripe_payment_intent_id ? "✓" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Alert>
              <AlertDescription className="text-xs">
                <strong>Manual replay:</strong> To resend failed deliveries, open{" "}
                <a className="underline" target="_blank" rel="noopener noreferrer" href="https://dashboard.stripe.com/webhooks">
                  Stripe Dashboard → Webhooks
                </a>{" "}
                → select the endpoint → filter <em>Failed</em> → click the event → <em>Resend</em>.
                Then refresh this page to verify processing.
              </AlertDescription>
            </Alert>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold ${ok === false ? "text-destructive" : ok === true ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}