import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export function OverviewTab({ counters }: { counters: { us_included: number } | null }) {
  const [revenue30d, setRevenue30d] = useState<number | null>(null);
  const [orders30d, setOrders30d] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("orders")
      .select("total_amount, status")
      .eq("status", "paid")
      .gte("created_at", since);
    if (data) {
      setOrders30d(data.length);
      setRevenue30d(data.reduce((s, o) => s + Number(o.total_amount || 0), 0));
    }
    setLoading(false);
  }

  const cvr = counters && counters.us_included > 0 && orders30d !== null
    ? ((orders30d / counters.us_included) * 100).toFixed(2)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="US Sessions (30d)" value={counters?.us_included?.toLocaleString() ?? "—"} loading={loading} />
        <StatCard label="Orders (30d, all)" value={orders30d?.toLocaleString() ?? "—"} loading={loading} />
        <StatCard label="Revenue (30d, all)" value={revenue30d !== null ? `€${revenue30d.toFixed(2)}` : "—"} loading={loading} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Phase 1 — Foundation active</CardTitle>
          <CardDescription>
            Data tables, US-only views, autopilot settings &amp; CSV import are live. Scoring, connectors, and creative queue arrive in subsequent phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-5">
            <li>Approximate US conversion rate (orders ÷ US sessions): <strong className="text-foreground">{cvr ? `${cvr}%` : "—"}</strong></li>
            <li>Default safety mode: <strong className="text-foreground">DRAFT_ONLY</strong> — nothing publishes automatically.</li>
            <li>All decisions read from <code className="text-xs">us_*_v</code> views (single source of truth).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}