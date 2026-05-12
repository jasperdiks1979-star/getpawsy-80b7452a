import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, Shuffle, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Arm = { hook: string; trials: number; successes: number; expected_ctr: number; priority: string };

export function CrossChannelTab() {
  const [ingestBusy, setIngestBusy] = useState(false);
  const [banditBusy, setBanditBusy] = useState(false);
  const [arms, setArms] = useState<Arm[]>([]);
  const [stats, setStats] = useState({ pinterest: 0, tiktok: 0, hooks: 0 });

  useEffect(() => { void loadArms(); }, []);

  async function loadArms() {
    const { data } = await supabase
      .from("mi_tuning_state")
      .select("key, value, metadata, updated_at")
      .eq("scope", "bandit_arm")
      .order("value", { ascending: false });
    const a: Arm[] = (data ?? []).map((r: any) => ({
      hook: r.key,
      trials: r.metadata?.trials ?? 0,
      successes: r.metadata?.successes ?? 0,
      expected_ctr: Number(r.value ?? 0),
      priority: r.metadata?.priority ?? "medium",
    }));
    setArms(a);

    const [{ count: p }, { count: t }] = await Promise.all([
      supabase.from("mi_channel_metrics").select("id", { count: "exact", head: true }).eq("channel", "pinterest"),
      supabase.from("mi_channel_metrics").select("id", { count: "exact", head: true }).eq("channel", "tiktok"),
    ]);
    setStats({ pinterest: p ?? 0, tiktok: t ?? 0, hooks: a.length });
  }

  async function ingestTikTok() {
    setIngestBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-tiktok-ingest", { body: {} });
      if (error) throw error;
      toast.success(`TikTok: ${data?.updated ?? 0} videos updated`);
      await loadArms();
    } catch (e: any) { toast.error(`Ingest failed: ${e?.message ?? e}`); }
    finally { setIngestBusy(false); }
  }

  async function runBandit(dryRun: boolean) {
    setBanditBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-bandit-allocator", { body: { dry_run: dryRun } });
      if (error) throw error;
      toast.success(dryRun ? "Bandit preview ready" : `Reallocated ${data?.pinterest_updated ?? 0} pins, ${data?.tiktok_updated ?? 0} tiktoks`);
      if (data?.arms) {
        setArms(data.arms.map((a: any) => ({ ...a })));
      }
      if (!dryRun) await loadArms();
    } catch (e: any) { toast.error(`Bandit failed: ${e?.message ?? e}`); }
    finally { setBanditBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Cross-channel learning</CardTitle>
          <CardDescription>
            Unified hook-family performance across Pinterest (impressions/clicks) and TikTok (views/saves). Multi-armed bandit
            (Thompson sampling on Beta posteriors) reallocates queue priority in realtime across BOTH channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap items-center">
          <Button size="sm" variant="secondary" onClick={ingestTikTok} disabled={ingestBusy}>
            {ingestBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
            Ingest TikTok metrics
          </Button>
          <Button size="sm" variant="outline" onClick={() => runBandit(true)} disabled={banditBusy}>
            {banditBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview bandit
          </Button>
          <Button size="sm" onClick={() => runBandit(false)} disabled={banditBusy}>
            {banditBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Shuffle className="h-3 w-3 mr-1" />}
            Reallocate budget
          </Button>
          <div className="ml-auto flex gap-2 flex-wrap">
            <Badge variant="outline">Pinterest: {stats.pinterest}</Badge>
            <Badge variant="outline">TikTok: {stats.tiktok}</Badge>
            <Badge variant="secondary">{stats.hooks} hook arms</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bandit arms (ranked by expected CTR)</CardTitle>
          <CardDescription>Top tertile → high priority, middle → medium, bottom → low. Posteriors update on every run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {arms.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No arms yet. Ingest metrics, then run the bandit.</div>
          ) : arms.map((a) => (
            <div key={a.hook} className="flex items-center gap-3 text-sm border rounded-md p-2">
              <span className="font-medium flex-1 truncate">{a.hook}</span>
              <Badge variant="outline">{a.trials} trials</Badge>
              <Badge variant="outline">{a.successes} wins</Badge>
              <Badge variant="secondary">{(a.expected_ctr * 100).toFixed(2)}% E[CTR]</Badge>
              <Badge variant={a.priority === "high" ? "default" : a.priority === "low" ? "outline" : "secondary"}>
                {a.priority}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}