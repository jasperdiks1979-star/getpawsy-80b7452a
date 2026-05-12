import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

type Row = { date: string; channel: string; sessions_us: number; add_to_cart: number; purchases: number; revenue_cents: number };

export function ChannelTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("us_channel_performance_daily_v" as any)
      .select("date, channel, sessions_us, add_to_cart, purchases, revenue_cents")
      .order("date", { ascending: false })
      .limit(60);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }

  async function runRollup() {
    setRunning(true);
    try {
      await supabase.functions.invoke("gi-rollup-internal", { body: { days: 30 } });
      await load();
    } finally { setRunning(false); }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Channel Performance (US-only)</CardTitle>
          <CardDescription>Last 60 daily rollups from visitor_activity + orders.</CardDescription>
        </div>
        <Button onClick={runRollup} size="sm" variant="outline" disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run rollup now
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rollup data yet. Click "Run rollup now" to populate from existing visitor data.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">US Sessions</TableHead>
                <TableHead className="text-right">ATC</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{r.date}</TableCell>
                  <TableCell>{r.channel}</TableCell>
                  <TableCell className="text-right">{r.sessions_us}</TableCell>
                  <TableCell className="text-right">{r.add_to_cart}</TableCell>
                  <TableCell className="text-right">{r.purchases}</TableCell>
                  <TableCell className="text-right">€{(r.revenue_cents / 100).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}