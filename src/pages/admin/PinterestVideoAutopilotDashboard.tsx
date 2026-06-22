import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Stats = {
  publishedToday: number;
  queueSize: number;
  failedToday: number;
  avgQa: number | null;
  avgCtr: number | null;
  activeVoice: string | null;
  activeScene: string | null;
  dailyCap: number;
  enabled: boolean;
  mode: string;
};

export default function PinterestVideoAutopilotDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    const dayStart = new Date(); dayStart.setUTCHours(0,0,0,0);
    const iso = dayStart.toISOString();

    const [settings, pubToday, queueDraft, failedToday, qaLog, lastVoice, lastScene] = await Promise.all([
      supabase.from("pinterest_video_autopilot_settings").select("*").maybeSingle(),
      supabase.from("pinterest_video_queue").select("quality_score", { count: "exact" }).eq("status","published").gte("updated_at", iso),
      supabase.from("pinterest_video_queue").select("*", { count: "exact", head: true }).eq("status","draft").eq("archived", false),
      supabase.from("pinterest_video_queue").select("*", { count: "exact", head: true }).in("status",["failed","publish_blocked","creative_rejected"]).gte("updated_at", iso),
      supabase.from("cinematic_product_match_qa_log").select("script_match_score, voiceover_match_score, scene_match_score, caption_match_score").gte("created_at", iso).limit(200),
      supabase.from("pinterest_voice_assignments").select("voice_name").order("assigned_at",{ ascending: false }).limit(1).maybeSingle(),
      supabase.from("cinematic_scene_environments").select("display_name").order("last_used_at",{ ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    ]);

    const qaRows = qaLog.data || [];
    const avgQa = qaRows.length
      ? Math.round(qaRows.reduce((a, r: any) => a + ((r.script_match_score||0)+(r.voiceover_match_score||0)+(r.scene_match_score||0)+(r.caption_match_score||0))/4, 0) / qaRows.length)
      : null;

    // CTR: avg over last 30 days of video metrics
    const { data: ctrRows } = await supabase
      .from("pinterest_video_metrics").select("impressions, outbound_clicks")
      .gte("day", new Date(Date.now() - 30*86400_000).toISOString().slice(0,10));
    const totals = (ctrRows||[]).reduce((a:any,r:any)=>({i:a.i+(r.impressions||0),c:a.c+(r.outbound_clicks||0)}),{i:0,c:0});
    const avgCtr = totals.i > 0 ? Number((totals.c / totals.i * 100).toFixed(2)) : null;

    setStats({
      publishedToday: pubToday.count ?? 0,
      queueSize: queueDraft.count ?? 0,
      failedToday: failedToday.count ?? 0,
      avgQa,
      avgCtr,
      activeVoice: (lastVoice.data as any)?.voice_name ?? null,
      activeScene: (lastScene.data as any)?.display_name ?? null,
      dailyCap: Number((settings.data as any)?.max_per_day ?? 30),
      enabled: !!(settings.data as any)?.enabled,
      mode: (settings.data as any)?.mode || "unknown",
    });
    setLoading(false);
  }

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  async function runTick() {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("pinterest-video-autopilot-tick");
    setRunning(false);
    if (error) toast.error(error.message);
    else toast.success(`Tick: ${(data as any)?.published ? "published" : ((data as any)?.skipped || "ok")}`);
    load();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pinterest Video Autopilot</h1>
          <p className="text-sm text-muted-foreground">V5 — autonomous loop, every 10 min. Daily cap {stats?.dailyCap ?? "—"}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={stats?.enabled ? "default" : "destructive"}>{stats?.enabled ? "ENABLED" : "DISABLED"}</Badge>
          <Badge variant="secondary">{stats?.mode}</Badge>
          <Button onClick={runTick} disabled={running}>{running ? "Running…" : "Run tick now"}</Button>
        </div>
      </header>

      {loading && !stats ? <div className="text-muted-foreground">Loading…</div> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Published today" value={stats?.publishedToday ?? 0} max={stats?.dailyCap} />
          <Stat label="Queue size (draft)" value={stats?.queueSize ?? 0} />
          <Stat label="Failed today" value={stats?.failedToday ?? 0} tone={stats?.failedToday ? "warn" : "ok"} />
          <Stat label="Avg QA score (today)" value={stats?.avgQa ?? "—"} suffix="/100" />
          <Stat label="Avg CTR (30d)" value={stats?.avgCtr ?? "—"} suffix="%" />
          <Stat label="Active voice" value={stats?.activeVoice ?? "—"} />
          <Stat label="Active scene" value={stats?.activeScene ?? "—"} />
          <Stat label="Daily cap" value={stats?.dailyCap ?? 30} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, suffix, max, tone }: { label: string; value: any; suffix?: string; max?: number; tone?: "ok"|"warn" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone==="warn" ? "text-destructive" : ""}`}>
        {value}{suffix ? <span className="text-base font-normal text-muted-foreground">{suffix}</span> : null}
        {max !== undefined ? <span className="text-base font-normal text-muted-foreground"> / {max}</span> : null}
      </div>
    </Card>
  );
}