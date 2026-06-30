import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, ExternalLink, Loader2, Unlock } from "lucide-react";

type LogRow = {
  id: string;
  timestamp: string;
  created_at: string;
  proposal: any;
  confidence: number | null;
  outcome: string | null;
};

export function FirstSaleUnlockStatus() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: settings }, { data: entry }] = await Promise.all([
      supabase.from("gi_settings").select("autopilot_mode").limit(1).maybeSingle(),
      supabase
        .from("governance_decision_log")
        .select("id,timestamp,created_at,proposal,confidence,outcome")
        .eq("dedupe_key", "first_verified_purchase_unlock")
        .maybeSingle(),
    ]);
    setMode((settings as any)?.autopilot_mode ?? null);
    setLog((entry as any) ?? null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const flipped = !!log;
  const ts = log?.timestamp || log?.created_at;
  const proposal = log?.proposal || {};

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Unlock className="h-4 w-4" />
            First-Sale Autopilot Unlock
          </CardTitle>
          <CardDescription>
            Fires once when the first verified <code>paid</code> order arrives:
            flips <code>AUTO_PUBLISH_CONSERVATIVE</code> → <code>AUTO_PUBLISH_BALANCED</code>
            and raises Pinterest/TikTok daily caps.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current mode:</span>
          <Badge variant={mode === "AUTO_PUBLISH_BALANCED" ? "default" : "secondary"}>
            {mode ?? "…"}
          </Badge>
        </div>

        {flipped ? (
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Unlocked {ts ? new Date(ts).toLocaleString() : ""}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div><span className="font-medium text-foreground">Order:</span> {proposal.order_id ?? "—"}</div>
              <div><span className="font-medium text-foreground">Stripe session:</span> {proposal.stripe_session_id ?? "—"}</div>
              <div><span className="font-medium text-foreground">Amount:</span> {proposal.total_amount ?? "—"} {proposal.currency ?? ""}</div>
              <div><span className="font-medium text-foreground">Confidence:</span> {log?.confidence ?? "—"}</div>
              <div className="col-span-2">
                <span className="font-medium text-foreground">Transition:</span>{" "}
                {proposal.from} → {proposal.to}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button asChild size="sm" variant="outline">
                <a href={`/admin/governance-ledger?id=${log!.id}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> View governance entry
                </a>
              </Button>
              {proposal.order_id && (
                <Button asChild size="sm" variant="ghost">
                  <a href={`/admin/orders?id=${proposal.order_id}`} target="_blank" rel="noreferrer">
                    Open order
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 mt-0.5" />
            <div>
              Not yet triggered. The trigger <code>trg_orders_first_sale_autopilot</code> will
              flip mode and log a <code>first_verified_purchase_unlock</code> entry on the next
              new <code>paid</code> order.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FirstSaleUnlockStatus;