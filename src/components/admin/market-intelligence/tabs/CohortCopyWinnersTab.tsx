import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Trophy, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Winner = {
  id: number;
  placement: string;
  mode: string;
  hook_family: string;
  winning_label: string;
  ctr_pct: number | null;
  confidence_score: number | null;
  impressions: number;
  clicks: number;
  window_hours: number;
  evaluated_at: string;
  notes: string | null;
  pinned: boolean;
  pinned_at: string | null;
  pinned_by: string | null;
};

export function CohortCopyWinnersTab() {
  const [rows, setRows] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cta_copy_winners_by_hook")
      .select("*")
      .order("placement", { ascending: true })
      .order("mode", { ascending: true })
      .order("hook_family", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Winner[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function togglePin(row: Winner) {
    const key = `${row.placement}/${row.mode}/${row.hook_family}`;
    setBusyKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("cohort-copy-winner-pin", {
        body: {
          action: row.pinned ? "unpin" : "pin",
          placement: row.placement,
          mode: row.mode,
          hook_family: row.hook_family,
          winning_label: row.pinned ? undefined : row.winning_label,
        },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.message);
      toast.success(row.pinned ? "Unpinned" : "Pinned · auto-elector will skip this cohort");
      await load();
    } catch (e: any) {
      toast.error(`Pin failed: ${e?.message ?? e}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function runElector() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cta-copy-winner-elector-by-hook", { body: {} });
      if (error) throw error;
      toast.success(`Elector ran · ${data?.upserts ?? 0} winners updated`);
      await load();
    } catch (e: any) {
      toast.error(`Elector failed: ${e?.message ?? e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Cohort Copy Winners
          </CardTitle>
          <CardDescription>
            Per-cohort winning CTA copy by (placement, mode, hook_family). Auto-learned from /go funnel events.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" onClick={runElector} disabled={running} className="gap-1">
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trophy className="h-3 w-3" />}
            {running ? "Running…" : "Run elector"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No cohort winners yet. Need ≥30 impressions per (placement, mode, hook_family, label).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placement</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Hook family</TableHead>
                  <TableHead>Winning label</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead>Evaluated</TableHead>
                  <TableHead className="text-right">Pin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.pinned ? "bg-primary/5" : undefined}>
                    <TableCell className="font-mono text-xs">{r.placement}</TableCell>
                    <TableCell><Badge variant="outline">{r.mode}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{r.hook_family}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.winning_label}
                      {r.pinned && (
                        <Badge variant="default" className="ml-2 gap-1 align-middle">
                          <Pin className="h-3 w-3" /> pinned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.ctr_pct != null ? `${Number(r.ctr_pct).toFixed(2)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.confidence_score != null ? (
                        <span title="Wilson 95% lower bound — higher = more confident">
                          {(Number(r.confidence_score) * 100).toFixed(2)}%
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.evaluated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.pinned ? "secondary" : "outline"}
                        disabled={busyKey === `${r.placement}/${r.mode}/${r.hook_family}`}
                        onClick={() => togglePin(r)}
                        className="gap-1 h-7"
                      >
                        {busyKey === `${r.placement}/${r.mode}/${r.hook_family}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : r.pinned ? (
                          <PinOff className="h-3 w-3" />
                        ) : (
                          <Pin className="h-3 w-3" />
                        )}
                        {r.pinned ? "Unpin" : "Pin"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}