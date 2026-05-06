import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw } from "lucide-react";

type Row = {
  id: string;
  source: string;
  reasons: string[] | null;
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  user_agent: string | null;
  created_at: string;
};

type Counts = { source: string; reason: string; n: number };

export default function RejectedSpamEventsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts[]>([]);
  const [loading, setLoading] = useState(false);
  const [windowHours, setWindowHours] = useState(24);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: r }, { data: c }] = await Promise.all([
        supabase
          .from("analytics_quarantine")
          .select("id, source, reasons, page_path, referrer, utm_source, user_agent, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.rpc("count_rejected_events", { window_hours: windowHours }),
      ]);
      setRows((r as Row[]) || []);
      setCounts((c as Counts[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHours]);

  const total = counts.reduce((acc, c) => acc + Number(c.n || 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Rejected spam events</h1>
            <p className="text-sm text-muted-foreground">
              Malformed URLs, bot traffic, and corrupted UTMs diverted from analytics.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
          >
            <option value={1}>Last 1h</option>
            <option value={24}>Last 24h</option>
            <option value={168}>Last 7d</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rejected events ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {counts.length === 0 && (
              <p className="text-sm text-muted-foreground">No rejected events in this window.</p>
            )}
            {counts.map((c) => (
              <div key={`${c.source}:${c.reason}`} className="flex items-center justify-between border rounded px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{c.reason}</div>
                  <div className="text-xs text-muted-foreground">{c.source}</div>
                </div>
                <Badge variant="destructive">{c.n}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent rejected events (latest 200)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Reasons</th>
                  <th className="py-2 pr-3">Path</th>
                  <th className="py-2 pr-3">Referrer</th>
                  <th className="py-2 pr-3">UTM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{r.source}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.reasons || []).map((rs) => (
                          <Badge key={rs} variant="outline" className="text-xs">{rs}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 max-w-[240px] truncate">{r.page_path || "—"}</td>
                    <td className="py-2 pr-3 max-w-[240px] truncate">{r.referrer || "—"}</td>
                    <td className="py-2 pr-3">{r.utm_source || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No rejected events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Quarantined events are stored in <code>analytics_quarantine</code>. They never reach
        <code> visitor_activity</code>, <code>lp_funnel_events</code>, <code>checkout_funnel_events</code>,
        or <code>pinterest_pin_queue</code>.
        Back to <Link className="underline" to="/admin">admin home</Link>.
      </p>
    </div>
  );
}