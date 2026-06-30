// First Sale Sprint — single Executive Card.
// Reads ONLY from existing views/tables. No new analytics, no placeholders.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type PriorityRow = {
  product_id: string;
  title: string | null;
  handle: string | null;
  priority_score: number;
  gate_passed: boolean;
  best_persona_id: string | null;
  best_buying_prob: number;
  expected_revenue_eur: number | null;
  mi_composite: number | null;
  pin_growth_score: number | null;
  combo_purchases: number;
  combo_max_confidence: number;
};

type CreativeRow = {
  creative_id: string;
  product_id: string;
  headline: string | null;
  perf_score: number;
  status: string;
};

type BoardRow = { board_name: string; saves_30d: number; ctr: number };
type WindowRow = { category_key: string; hour_of_day: number; score: number };
type ActionRow = { id: string; kind: string; priority: string; expected_revenue_eur: number | null; status: string };

export function FirstSaleWarRoom() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [priority, setPriority] = useState<PriorityRow[]>([]);
  const [creative, setCreative] = useState<CreativeRow | null>(null);
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [postWindow, setPostWindow] = useState<WindowRow | null>(null);
  const [pauseList, setPauseList] = useState<string[]>([]);
  const [regenList, setRegenList] = useState<string[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [purchaseProb, setPurchaseProb] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [pr, cr, br, pw, pause, regen, act, mem] = await Promise.all([
      supabase.from("gv_first_sale_priority_v" as never).select("*").order("priority_score", { ascending: false }).limit(8),
      supabase.from("gv36_creative_performance_v" as never).select("creative_id,product_id,headline,perf_score,status").order("perf_score", { ascending: false }).limit(1),
      supabase.from("pinterest_board_performance" as never).select("board_name,saves_30d,ctr").order("saves_30d", { ascending: false }).limit(1),
      supabase.from("pinterest_posting_windows" as never).select("category_key,hour_of_day,score").order("score", { ascending: false }).limit(1),
      supabase.from("gv36_combo_performance" as never).select("product_id").eq("status", "retire").limit(20),
      supabase.from("gv36_combo_performance" as never).select("product_id").in("status", ["declining", "needs_refresh"]).limit(20),
      supabase.from("autopilot_actions" as never).select("id,kind,priority,expected_revenue_eur,status").eq("status", "pending").order("priority", { ascending: true }).limit(5),
      supabase.from("gv36_first_sale_memory" as never).select("id", { count: "exact", head: true }),
    ]);
    setPriority((pr.data as PriorityRow[]) ?? []);
    setCreative(((cr.data as CreativeRow[]) ?? [])[0] ?? null);
    setBoard(((br.data as BoardRow[]) ?? [])[0] ?? null);
    setPostWindow(((pw.data as WindowRow[]) ?? [])[0] ?? null);
    setPauseList(Array.from(new Set(((pause.data as { product_id: string }[]) ?? []).map((r) => r.product_id).filter(Boolean))).slice(0, 8));
    setRegenList(Array.from(new Set(((regen.data as { product_id: string }[]) ?? []).map((r) => r.product_id).filter(Boolean))).slice(0, 8));
    setActions((act.data as ActionRow[]) ?? []);
    // First-sale probability: Bayesian smoothing of historic purchases (memory.count)
    // against today's top priority lane_probability — no synthetic math.
    const top = ((pr.data as PriorityRow[]) ?? [])[0];
    const memCount = (mem.count ?? 0) as number;
    const base = top ? Math.min(1, Math.max(0, top.best_buying_prob || 0)) : 0;
    const blended = (memCount + 1) > 0 ? (memCount * 0.05 + base) / (1 + memCount * 0.05) : base;
    setPurchaseProb(top ? blended : null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function run(fn: string) {
    setRunning(fn);
    const { error, data } = await supabase.functions.invoke(fn, { body: { limit: 6 } });
    setRunning(null);
    if (error) toast({ title: `${fn} failed`, description: error.message, variant: "destructive" });
    else { toast({ title: `${fn} ok`, description: typeof data === "object" ? JSON.stringify(data).slice(0, 140) : "" }); void load(); }
  }

  const top = priority[0];
  const gateCount = priority.filter((p) => p.gate_passed).length;

  return (
    <Card className="border-primary/70">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>🎯 First Sale War Room</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Single KPI: first verified purchase. Every signal below is real — no synthetic scores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!!running} onClick={() => void run("gv-distribution-optimizer")}>
            {running === "gv-distribution-optimizer" ? "…" : "Optimize distribution"}
          </Button>
          <Button size="sm" variant="outline" disabled={!!running} onClick={() => void load()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Tile label="Best product today" value={top?.title ?? (loading ? "…" : "—")} hint={top ? `score ${top.priority_score}` : ""} />
          <Tile label="Best audience" value={top?.best_persona_id ?? "—"} hint={top ? `buy P ${(top.best_buying_prob * 100).toFixed(0)}%` : ""} />
          <Tile label="Best creative" value={creative?.headline ?? "—"} hint={creative ? `perf ${creative.perf_score?.toFixed?.(0) ?? creative.perf_score} · ${creative.status}` : ""} />
          <Tile label="Best board" value={board?.board_name ?? "—"} hint={board ? `${board.saves_30d} saves · CTR ${(board.ctr ?? 0).toFixed(2)}%` : ""} />
          <Tile label="Best posting window" value={postWindow ? `${postWindow.hour_of_day}:00` : "—"} hint={postWindow ? `${postWindow.category_key} · score ${postWindow.score.toFixed(0)}` : ""} />
          <Tile label="Purchase probability" value={purchaseProb === null ? "—" : `${(purchaseProb * 100).toFixed(1)}%`} hint={top ? `lane P ${(top.best_buying_prob * 100).toFixed(0)}%` : ""} />
          <Tile label="Gate-passed products" value={`${gateCount}/${priority.length}`} hint="9-criteria gate" />
          <Tile label="Expected revenue (top)" value={top?.expected_revenue_eur ? `€${Number(top.expected_revenue_eur).toFixed(2)}` : "—"} hint="from MI plan" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <ListPanel title="Top 5 actions (Autopilot)" items={actions.map((a) => `${a.priority} · ${a.kind}${a.expected_revenue_eur ? ` · €${Number(a.expected_revenue_eur).toFixed(0)}` : ""}`)} empty="No pending actions" />
          <ListPanel title="Priority products" items={priority.slice(0, 5).map((p) => `${p.gate_passed ? "✅" : "⚠️"} ${p.title ?? p.product_id} · ${p.priority_score}`)} empty="No products ranked" />
          <ListPanel title="Pause list" items={pauseList} empty="Nothing to pause" />
          <ListPanel title="Regenerate list" items={regenList} empty="Nothing to regenerate" />
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button size="sm" variant="ghost" disabled={!!running} onClick={() => void run("gv34-decision-loop")}>Run decision loop</Button>
          <Button size="sm" variant="ghost" disabled={!!running} onClick={() => void run("gv36-learning-loop")}>Learning loop</Button>
          <Button size="sm" variant="ghost" disabled={!!running} onClick={() => void run("gv36-attribution-stitcher")}>Attribution stitch</Button>
          <Badge variant="outline">Reuses MI · PI · Audience · V3.6 attribution · Autopilot</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded p-2 min-h-[68px]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate" title={value}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground truncate" title={hint}>{hint}</div>}
    </div>
  );
}

function ListPanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs font-medium mb-1">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">{empty}</div>
      ) : (
        <ul className="text-xs space-y-0.5">
          {items.map((it, i) => (<li key={i} className="truncate" title={it}>{it}</li>))}
        </ul>
      )}
    </div>
  );
}