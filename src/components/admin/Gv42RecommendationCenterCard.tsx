import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Play } from "lucide-react";

type Reason = { label: string; delta: number };
type Winner = {
  queue_id: string; product_name?: string; pin_title?: string; pin_image_url?: string;
  board_name?: string; category_key?: string; prs: number; discovery_index: number;
  reasons: Reason[]; projections: Record<string, number>;
};
type Snapshot = {
  ok: boolean; scored_n: number; fatigue_index: number; prioritised: number;
  winners: Winner[]; losing: Winner[]; generated_at: string;
};

export function Gv42RecommendationCenterCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (action: "score" | "cycle") => {
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke(`gv42-recommendation-os?action=${action}`, { body: {} });
      if (error) throw error;
      setSnap(data as Snapshot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  useEffect(() => { void run("score"); }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Genesis V4.2 — Pinterest Recommendation Center</CardTitle>
          {snap && (
            <Badge variant="secondary">
              Feed fatigue {snap.fatigue_index.toFixed(0)} · scored {snap.scored_n}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => run("score")} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-score"}
          </Button>
          <Button size="sm" onClick={() => run("cycle")} disabled={busy}>
            <Play className="h-4 w-4 mr-1" /> Run cycle
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && <div className="text-sm text-destructive">{err}</div>}
        {!snap && !err && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Scoring catalog…
          </div>
        )}
        {snap && (
          <>
            <div className="text-xs text-muted-foreground">
              Generated {new Date(snap.generated_at).toLocaleString()} ·
              prioritised {snap.prioritised} pin{snap.prioritised === 1 ? "" : "s"} this cycle
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Top recommendation winners</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {snap.winners.map((w) => (
                  <div key={w.queue_id} className="border rounded p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{w.pin_title || w.product_name || "(no title)"}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {w.board_name ?? "—"} · {w.category_key ?? "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{w.prs.toFixed(0)}</div>
                        <div className="text-[10px] text-muted-foreground">PRS</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {w.reasons.slice(0, 6).map((r, i) => (
                        <Badge key={i} variant={r.delta >= 0 ? "secondary" : "destructive"} className="text-[10px]">
                          {r.delta >= 0 ? "+" : ""}{r.delta} · {r.label}
                        </Badge>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                      <span>save {Math.round((w.projections.expected_save_rate || 0) * 10000) / 100}%</span>
                      <span>ctr {Math.round((w.projections.expected_outbound_ctr || 0) * 10000) / 100}%</span>
                      <span>discovery {w.discovery_index.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
                {snap.winners.length === 0 && (
                  <div className="text-sm text-muted-foreground">No publishable candidates in queue.</div>
                )}
              </div>
            </div>

            {snap.losing.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Losing momentum</div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {snap.losing.slice(0, 5).map(l => (
                    <li key={l.queue_id} className="truncate">
                      PRS {l.prs.toFixed(0)} · {l.pin_title || l.product_name || l.queue_id}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}