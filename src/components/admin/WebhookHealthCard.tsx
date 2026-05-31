import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type MiniHealth = {
  healthy: boolean;
  ping: { reachable: boolean; status: number; signature_validation_active: boolean };
  orders_30d: { paid: number; pending: number; last_paid_at: string | null };
  stripe_events: Array<{ pending_webhooks: number }>;
};

export function WebhookHealthCard() {
  const [data, setData] = useState<MiniHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: res } = await supabase.functions.invoke("webhook-health", { body: {} });
      if (alive && res) setData(res as MiniHealth);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const pendingDeliveries = data?.stripe_events.reduce((s, e) => s + e.pending_webhooks, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> :
            data?.healthy ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
            <AlertTriangle className="h-4 w-4 text-amber-500" />}
          Stripe Webhook
        </CardTitle>
        {!loading && data && (
          <Badge variant={data.healthy ? "default" : "destructive"}>
            {data.healthy ? "Healthy" : "Degraded"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        {loading ? (
          <div className="text-muted-foreground">Checking…</div>
        ) : !data ? (
          <div className="text-muted-foreground">Unable to load.</div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Endpoint</span>
              <span>{data.ping.reachable ? `${data.ping.status} OK` : "unreachable"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signature check</span>
              <span>{data.ping.signature_validation_active ? "Active" : "Off"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid (30d)</span>
              <span>{data.orders_30d.paid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending deliveries</span>
              <span className={pendingDeliveries > 0 ? "text-destructive" : ""}>{pendingDeliveries}</span>
            </div>
            <Link to="/admin/webhook-health" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
              Open dashboard <ExternalLink className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}