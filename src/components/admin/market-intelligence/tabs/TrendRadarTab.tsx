import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TrendingUp, Plus, RefreshCw } from "lucide-react";

type Trend = {
  id: string;
  trend_type: string;
  term: string;
  market: string;
  source: string;
  score: number;
  momentum: number;
  category: string | null;
  season: string | null;
  notes: string | null;
  last_seen: string;
};

const TREND_TYPES = [
  "rising_product","seasonal","viral_gadget","viral_cat","viral_dog",
  "search_term","pinterest_topic","tiktok_hook","engagement_format",
  "aesthetic_style","video_pacing","thumbnail_style","cta_pattern"
];

export function TrendRadarTab({ onChange }: { onChange?: () => void }) {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    term: "", trend_type: "rising_product", category: "", season: "",
    score: 50, momentum: 0, source: "manual", notes: ""
  });

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("mi_trends").select("*")
      .eq("market", "US").order("score", { ascending: false }).limit(200);
    setTrends((data ?? []) as Trend[]);
    setLoading(false);
  }

  async function add() {
    if (!form.term.trim()) return toast.error("Term is required");
    const { error } = await supabase.from("mi_trends").insert({
      term: form.term.trim(),
      trend_type: form.trend_type,
      market: "US",
      source: form.source || "manual",
      score: Number(form.score) || 0,
      momentum: Number(form.momentum) || 0,
      category: form.category || null,
      season: form.season || null,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Trend added");
    setForm({ ...form, term: "", notes: "" });
    void load(); onChange?.();
  }

  async function runSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-ingest-internal", { body: {} });
      if (error) throw error;
      const stats = (data as { stats?: Record<string, number>; message?: string })?.stats;
      toast.success((data as { message?: string })?.message ?? "Synced");
      if (stats) console.log("[mi-ingest-internal]", stats);
      void load(); onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Ingest internal US signals</CardTitle>
          <CardDescription>Pulls last 30 days of US-only visitor activity &amp; orders, updates trend scores + momentum.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Run sync now"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add US trend</CardTitle>
          <CardDescription>Manually log a US-market trend signal. Phase 2 will auto-ingest.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div><Label>Term / topic</Label><Input value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} placeholder="e.g. automatic litter box" /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.trend_type} onValueChange={v => setForm({ ...form, trend_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TREND_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="cat / dog / gadget" /></div>
          <div><Label>Season</Label><Input value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} placeholder="winter / Q4 / always" /></div>
          <div><Label>Score (0–100)</Label><Input type="number" value={form.score} onChange={e => setForm({ ...form, score: Number(e.target.value) })} /></div>
          <div><Label>Momentum</Label><Input type="number" value={form.momentum} onChange={e => setForm({ ...form, momentum: Number(e.target.value) })} /></div>
          <div className="md:col-span-3"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div className="md:col-span-3"><Button onClick={add}>Add trend</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> US Trend Radar</CardTitle>
          <CardDescription>Top 200 US trends by score. Higher momentum = faster growing.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            trends.length === 0 ? <p className="text-sm text-muted-foreground">No trends yet. Add one above.</p> :
            <div className="space-y-2">
              {trends.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <div className="font-medium">{t.term}</div>
                    <div className="text-xs text-muted-foreground">
                      <Badge variant="secondary" className="mr-1">{t.trend_type}</Badge>
                      {t.category && <Badge variant="outline" className="mr-1">{t.category}</Badge>}
                      {t.season && <Badge variant="outline" className="mr-1">{t.season}</Badge>}
                      <span className="ml-2">{t.source}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{Number(t.score).toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">momentum {Number(t.momentum).toFixed(1)}</div>
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}