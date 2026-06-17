import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Imbalance = {
  category_key: string;
  display_name: string;
  target_pct: number;
  actual_posts: number;
  total_posts: number;
  actual_pct: number;
  gap_pct: number;
};

type Row = { key: string; count: number; pct?: number };

export default function ProductDiversityPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [imbalance, setImbalance] = useState<Imbalance[]>([]);
  const [topProducts, setTopProducts] = useState<Row[]>([]);
  const [coldProducts, setColdProducts] = useState<Row[]>([]);
  const [topBoards, setTopBoards] = useState<Row[]>([]);
  const [scenes, setScenes] = useState<Row[]>([]);
  const [headlines, setHeadlines] = useState<Row[]>([]);
  const [counts, setCounts] = useState<{ posted: number; queued: number; rejected: number; unique_products: number }>({
    posted: 0, queued: 0, rejected: 0, unique_products: 0,
  });

  async function load() {
    setLoading(true);
    try {
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
      const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();

      const [imbRes, postedRes, queuedRes, rejectedRes, boardRes, sceneRes, headRes, coldRes] = await Promise.all([
        supabase.rpc("pinterest_category_imbalance", { _days: 7 }),
        supabase.from("pinterest_pin_queue")
          .select("product_slug,board_name,pin_variant,pin_title")
          .eq("source_type", "lifestyle_ai")
          .eq("status", "posted")
          .gte("posted_at", since30),
        supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
          .eq("source_type", "lifestyle_ai").eq("status", "queued"),
        supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
          .eq("source_type", "lifestyle_ai").eq("status", "rejected").gte("created_at", since7),
        supabase.from("pinterest_pin_queue")
          .select("board_name")
          .eq("source_type", "lifestyle_ai").eq("status", "posted").gte("posted_at", since7),
        supabase.from("pinterest_pin_queue")
          .select("pin_variant")
          .eq("source_type", "lifestyle_ai").eq("status", "posted").gte("posted_at", since7),
        supabase.from("pinterest_pin_queue")
          .select("pin_title")
          .eq("source_type", "lifestyle_ai").eq("status", "posted").gte("posted_at", since7),
        supabase.from("products").select("slug,name,is_active").eq("is_active", true).limit(500),
      ]);

      if (imbRes.error) throw imbRes.error;
      setImbalance((imbRes.data ?? []) as Imbalance[]);

      const postedRows = postedRes.data ?? [];
      const slugCounts = new Map<string, number>();
      for (const r of postedRows) slugCounts.set(r.product_slug, (slugCounts.get(r.product_slug) ?? 0) + 1);
      const top = [...slugCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([key, count]) => ({ key, count }));
      setTopProducts(top);

      const promotedSet = new Set(slugCounts.keys());
      const cold = (coldRes.data ?? [])
        .filter((p: any) => !promotedSet.has(p.slug))
        .slice(0, 15)
        .map((p: any) => ({ key: p.slug, count: 0 }));
      setColdProducts(cold);

      const boardCounts = new Map<string, number>();
      for (const r of (boardRes.data ?? []) as any[]) boardCounts.set(r.board_name, (boardCounts.get(r.board_name) ?? 0) + 1);
      const totalBoards = [...boardCounts.values()].reduce((a, b) => a + b, 0) || 1;
      setTopBoards([...boardCounts.entries()].sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count, pct: Math.round(100 * count / totalBoards) })));

      const sceneCounts = new Map<string, number>();
      for (const r of (sceneRes.data ?? []) as any[]) sceneCounts.set(r.pin_variant || "(none)", (sceneCounts.get(r.pin_variant || "(none)") ?? 0) + 1);
      setScenes([...sceneCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count })));

      const headCounts = new Map<string, number>();
      for (const r of (headRes.data ?? []) as any[]) headCounts.set(r.pin_title || "(none)", (headCounts.get(r.pin_title || "(none)") ?? 0) + 1);
      setHeadlines([...headCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count })));

      setCounts({
        posted: postedRows.length,
        queued: queuedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
        unique_products: slugCounts.size,
      });
    } catch (e) {
      toast({ title: "Failed to load", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function runOrchestrator() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-diversity-orchestrator", {
        body: { maxPicks: 3, count: 3 },
      });
      if (error) throw error;
      toast({ title: "Orchestrator triggered", description: `Picked ${data?.picked?.length ?? 0} products` });
      await load();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { load(); }, []);

  const uniquePct = counts.posted > 0 ? Math.round(100 * counts.unique_products / counts.posted) : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Diversity</h1>
          <p className="text-sm text-muted-foreground">Read-only view of existing diversity systems (cooldowns, governors, DiversityGuard) + category target rebalancing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button onClick={runOrchestrator} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-2">Run rebalancer now</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Posted (30d)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.posted}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Queued</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.queued}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Rejected (7d)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.rejected}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Unique products (30d)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{counts.unique_products} <Badge variant={uniquePct >= 80 ? "default" : "destructive"} className="ml-2">{uniquePct}%</Badge></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Category target vs actual (7d posted)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Target %</TableHead><TableHead className="text-right">Actual %</TableHead><TableHead className="text-right">Posts</TableHead><TableHead className="text-right">Gap</TableHead></TableRow></TableHeader>
            <TableBody>
              {imbalance.map((row) => (
                <TableRow key={row.category_key}>
                  <TableCell className="font-medium">{row.display_name}</TableCell>
                  <TableCell className="text-right">{row.target_pct}%</TableCell>
                  <TableCell className="text-right">{row.actual_pct}%</TableCell>
                  <TableCell className="text-right">{row.actual_posts}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.gap_pct > 5 ? "destructive" : row.gap_pct > 0 ? "secondary" : "default"}>
                      {row.gap_pct > 0 ? `+${row.gap_pct}` : row.gap_pct}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Most-posted products (30d)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Slug</TableHead><TableHead className="text-right">Posts</TableHead></TableRow></TableHeader>
              <TableBody>{topProducts.map((r) => (<TableRow key={r.key}><TableCell className="font-mono text-xs truncate max-w-[280px]">{r.key}</TableCell><TableCell className="text-right">{r.count}</TableCell></TableRow>))}</TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Under-used active products (never posted in 30d)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Slug</TableHead></TableRow></TableHeader>
              <TableBody>{coldProducts.map((r) => (<TableRow key={r.key}><TableCell className="font-mono text-xs truncate max-w-[420px]">{r.key}</TableCell></TableRow>))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Top boards (7d posted)</CardTitle></CardHeader>
          <CardContent>
            <Table><TableBody>{topBoards.map((r) => (<TableRow key={r.key}><TableCell>{r.key}</TableCell><TableCell className="text-right">{r.count} <Badge variant={(r.pct ?? 0) > 20 ? "destructive" : "secondary"} className="ml-1">{r.pct}%</Badge></TableCell></TableRow>))}</TableBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top scenes / variants (7d)</CardTitle></CardHeader>
          <CardContent>
            <Table><TableBody>{scenes.map((r) => (<TableRow key={r.key}><TableCell className="text-xs">{r.key}</TableCell><TableCell className="text-right">{r.count}</TableCell></TableRow>))}</TableBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top headlines (7d)</CardTitle></CardHeader>
          <CardContent>
            <Table><TableBody>{headlines.map((r) => (<TableRow key={r.key}><TableCell className="text-xs truncate max-w-[200px]">{r.key}</TableCell><TableCell className="text-right">{r.count}</TableCell></TableRow>))}</TableBody></Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}