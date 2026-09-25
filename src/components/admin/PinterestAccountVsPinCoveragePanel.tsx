import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Totals = { impressions: number; outbound: number; pinClicks: number; saves: number; days: number; pending: number };
type Row = Record<string, unknown>;

export function summarize(rows: Row[], since: string, statusKey?: string): Totals {
  const r = rows.filter((x) => String(x.day) >= since);
  const n = (k: string) => r.reduce((s, x) => s + (Number(x[k] ?? 0) || 0), 0);
  return {
    impressions: n("impressions"),
    outbound: n("outbound_clicks"),
    pinClicks: n("pin_clicks"),
    saves: n("saves"),
    days: new Set(r.map((x) => x.day)).size,
    pending: statusKey ? r.filter((x) => x[statusKey] && x[statusKey] !== "READY").length : 0,
  };
}

const iso = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);

export default function PinterestAccountVsPinCoveragePanel() {
  const [acct, setAcct] = useState<Row[] | null>(null);
  const [pins, setPins] = useState<Row[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const since = iso(30);
      const [a, p] = await Promise.all([
        supabase.from("pinterest_account_analytics_daily").select("day, impressions, outbound_clicks, pin_clicks, saves, data_status, fetched_at").gte("day", since).order("day"),
        supabase.from("pinterest_analytics_daily").select("day, impressions, outbound_clicks, pin_clicks, saves").gte("day", since).limit(20000),
      ]);
      setAcct((a.data as Row[]) ?? []);
      setPins((p.data as Row[]) ?? []);
      const last = (a.data as Row[] | null)?.map((r) => String(r.fetched_at)).sort().pop();
      setFetchedAt(last ?? null);
    })();
  }, []);

  if (!acct || !pins) return null;

  const block = (label: string, days: number) => {
    const a = summarize(acct, iso(days), "data_status");
    const p = summarize(pins, iso(days));
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Account-wide (authoritative)</div>
            <div>{a.impressions.toLocaleString()} impressions</div>
            <div>{a.outbound} outbound clicks · {a.pinClicks} pin clicks · {a.saves} saves</div>
            {a.pending > 0 && <Badge variant="secondary" className="mt-1">{a.pending} recent day(s) not final yet</Badge>}
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Per-pin tracked subset</div>
            <div>{p.impressions.toLocaleString()} impressions</div>
            <div>{p.outbound} outbound clicks · {p.pinClicks} pin clicks · {p.saves} saves</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pinterest totals: whole account vs tracked pins</CardTitle>
        <p className="text-xs text-muted-foreground">
          Account-wide figures come straight from Pinterest and are the real totals. Per-pin figures cover only pins the shop tracks
          individually and are a subset — do not compare them as equals. Pinterest usually finalises the last 1–3 days late.
          {fetchedAt ? ` Last fetched ${new Date(fetchedAt).toLocaleString()}.` : " Not fetched yet."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {acct.length === 0 ? <p className="text-sm text-muted-foreground">No account-wide data yet.</p> : null}
        {block("Last 14 days", 14)}
        {block("Last 30 days", 30)}
      </CardContent>
    </Card>
  );
}
