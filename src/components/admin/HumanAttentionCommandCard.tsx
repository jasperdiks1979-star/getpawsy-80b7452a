import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Row = { dim: string; key: string; n: number; attention: number; scroll_stop: number; save_p: number; click_p: number; purchase_p: number; winners: number };
type Snapshot = {
  ok: boolean;
  human_attention_score: number | null;
  sample_24h: number;
  world_diversity: { total: number; used_24h: number; max_consecutive_run: number };
  top_emotions: Row[];
  top_worlds: Row[];
  top_stories: Row[];
  top_scroll_stop: Row[];
  top_save: Row[];
  top_click: Row[];
  top_purchase: Row[];
  winner_genes: Array<{ gene_type: string; gene_value: string; weight: number; wins: number; losses: number }>;
};

function List({ title, rows, metric }: { title: string; rows: Row[]; metric: keyof Row }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 6).map((r) => (
            <li key={`${r.dim}:${r.key}`} className="flex items-center justify-between text-sm">
              <span className="truncate">{r.key}</span>
              <span className="tabular-nums text-muted-foreground">{String(r[metric] ?? 0)} · n={r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HumanAttentionCommandCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.functions.invoke("gv41-attention-engine");
      if (!alive) return;
      if (error) { setErr(error.message); return; }
      setSnap(data as Snapshot);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-lg">Human Attention Engine (V4.1)</CardTitle>
        <div className="flex items-center gap-2">
          {snap?.human_attention_score != null && (
            <Badge variant="secondary">HAS {snap.human_attention_score}</Badge>
          )}
          {snap && (
            <Badge variant="outline">
              Worlds {snap.world_diversity.used_24h}/{snap.world_diversity.total} · run {snap.world_diversity.max_consecutive_run}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {err && <div className="col-span-3 text-sm text-destructive">{err}</div>}
        {!snap && !err && <div className="col-span-3 text-sm text-muted-foreground">Loading…</div>}
        {snap && (
          <>
            <List title="Top Emotions (Attention)" rows={snap.top_emotions} metric="attention" />
            <List title="Top Worlds (Attention)" rows={snap.top_worlds} metric="attention" />
            <List title="Top Stories (Attention)" rows={snap.top_stories} metric="attention" />
            <List title="Scroll-Stop Drivers" rows={snap.top_scroll_stop} metric="scroll_stop" />
            <List title="Save Drivers" rows={snap.top_save} metric="save_p" />
            <List title="Click Drivers" rows={snap.top_click} metric="click_p" />
            <List title="Purchase Drivers" rows={snap.top_purchase} metric="purchase_p" />
            <div className="space-y-1 md:col-span-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Winner Genome (GCD)</div>
              {snap.winner_genes.length === 0 ? (
                <div className="text-xs text-muted-foreground">No gene weights yet.</div>
              ) : (
                <ul className="grid grid-cols-2 gap-1">
                  {snap.winner_genes.slice(0, 12).map((g, i) => (
                    <li key={i} className="flex justify-between text-xs">
                      <span className="truncate">{g.gene_type}:{g.gene_value}</span>
                      <span className="tabular-nums text-muted-foreground">w {Number(g.weight).toFixed(2)} · {g.wins}/{g.losses}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}