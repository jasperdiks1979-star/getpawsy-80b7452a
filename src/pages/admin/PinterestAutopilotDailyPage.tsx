import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Play, RefreshCw, Power } from "lucide-react";

type Schedule = {
  id: string;
  scheduled_at: string;
  scheduled_date: string;
  product_slug: string;
  product_name: string | null;
  product_image: string | null;
  product_url: string | null;
  status: string;
  cinematic_ad_job_id: string | null;
  creative_angle: string | null;
  pinterest_pin_url: string | null;
  pinterest_pin_id: string | null;
  published_at: string | null;
  skip_reason: string | null;
  attempt_count: number;
  notes: string | null;
  log: any;
  validation_report: any;
};

type Config = {
  id: number;
  enabled: boolean;
  daily_post_target: number;
  min_gap_minutes: number;
  quality_threshold: number;
  last_schedule_generated_for: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-slate-200 text-slate-800",
  preparing: "bg-amber-200 text-amber-900",
  rendering: "bg-amber-200 text-amber-900",
  awaiting_publish: "bg-blue-200 text-blue-900",
  published: "bg-emerald-200 text-emerald-900",
  skipped: "bg-zinc-300 text-zinc-800",
  failed: "bg-red-200 text-red-900",
};

export default function PinterestAutopilotDailyPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [rows, setRows] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyGlobal, setBusyGlobal] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from("pinterest_autopilot_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("pinterest_autopilot_schedule").select("*")
        .gte("scheduled_at", new Date(Date.now() - 36 * 3600_000).toISOString())
        .order("scheduled_at"),
    ]);
    setCfg((c as any) ?? null);
    setRows((r as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleEnabled(v: boolean) {
    const { error } = await supabase.from("pinterest_autopilot_config").update({ enabled: v }).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success(`Autopilot ${v ? "ON" : "OFF"}`);
    setCfg((c) => c ? { ...c, enabled: v } : c);
  }

  async function callFn(name: string, body: any = {}) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw new Error(error.message);
    if ((data as any)?.ok === false) throw new Error((data as any)?.message ?? `${name} failed`);
    return data;
  }

  async function generateToday() {
    setBusyGlobal("generate");
    try {
      const data: any = await callFn("pinterest-autopilot-generate-schedule", { force: true });
      toast.success(data?.message ?? "schedule generated");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "failed"); }
    finally { setBusyGlobal(null); }
  }

  async function runOne(scheduleId?: string) {
    setBusyGlobal(scheduleId ? null : "run-one");
    setBusyId(scheduleId ?? null);
    try {
      const data: any = await callFn("pinterest-autopilot-run-one", scheduleId ? { schedule_id: scheduleId } : {});
      toast.success(data?.message ?? "dispatched");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "failed"); }
    finally { setBusyGlobal(null); setBusyId(null); }
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    toast.success("Full UUID copied");
  }

  const today = new Date().toISOString().slice(0, 10);
  const todays = rows.filter((r) => r.scheduled_date === today);
  const publishedToday = todays.filter((r) => r.status === "published").length;
  const next = todays.find((r) => r.status === "planned");

  return (
    <div className="container mx-auto py-6 space-y-6">
      <h1 className="text-3xl font-bold">Pinterest Autopilot — Daily</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Status</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm">{cfg?.enabled ? "ON" : "OFF"}</span>
            <Switch checked={!!cfg?.enabled} onCheckedChange={toggleEnabled} />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Target / day" value={String(cfg?.daily_post_target ?? "—")} />
          <Stat label="Published today" value={`${publishedToday} / ${cfg?.daily_post_target ?? 5}`} />
          <Stat label="Min gap (min)" value={String(cfg?.min_gap_minutes ?? "—")} />
          <Stat label="Next slot" value={next ? new Date(next.scheduled_at).toLocaleTimeString() : "—"} />
        </CardContent>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={generateToday} disabled={!!busyGlobal} size="sm" variant="outline">
            {busyGlobal === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Generate Today's Schedule</span>
          </Button>
          <Button onClick={() => runOne()} disabled={!!busyGlobal} size="sm">
            {busyGlobal === "run-one" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-2">Run One Autopilot Pin Now</span>
          </Button>
          <Button onClick={() => toggleEnabled(!cfg?.enabled)} size="sm" variant={cfg?.enabled ? "destructive" : "default"}>
            <Power className="h-4 w-4" />
            <span className="ml-2">{cfg?.enabled ? "Turn Autopilot OFF" : "Turn Autopilot ON"}</span>
          </Button>
          <Button onClick={load} size="sm" variant="ghost">Refresh</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Today's planned posts</CardTitle></CardHeader>
        <CardContent>
          {loading && <div>Loading…</div>}
          {!loading && todays.length === 0 && (
            <div className="text-sm text-muted-foreground">No schedule for today yet. Click "Generate Today's Schedule".</div>
          )}
          <div className="space-y-3">
            {todays.map((r) => (
              <div key={r.id} className="flex items-start gap-3 border rounded-md p-3">
                {r.product_image && (
                  <img src={r.product_image} alt={r.product_name ?? r.product_slug} className="w-20 h-20 object-cover rounded" loading="lazy" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{new Date(r.scheduled_at).toLocaleTimeString()}</span>
                    <Badge className={STATUS_COLOR[r.status] ?? ""}>{r.status}</Badge>
                    {r.creative_angle && <Badge variant="outline">{r.creative_angle}</Badge>}
                    {r.attempt_count > 0 && <span className="text-xs text-muted-foreground">attempt {r.attempt_count}</span>}
                  </div>
                  <div className="font-semibold truncate">{r.product_name ?? r.product_slug}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.product_url}</div>
                  {r.cinematic_ad_job_id && (
                    <div className="text-xs flex items-center gap-1 mt-1">
                      <span>Job:</span>
                      <code className="font-mono">{r.cinematic_ad_job_id.slice(0, 8)}…</code>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyId(r.cinematic_ad_job_id!)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {r.pinterest_pin_url && (
                    <a href={r.pinterest_pin_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                      <ExternalLink className="h-3 w-3" /> View pin
                    </a>
                  )}
                  {r.skip_reason && <div className="text-xs text-red-700 mt-1">⚠ {r.skip_reason}</div>}
                </div>
                <div className="flex flex-col gap-1">
                  {(r.status === "planned" || r.status === "failed" || r.status === "skipped") && (
                    <Button size="sm" variant="outline" onClick={() => runOne(r.id)} disabled={busyId === r.id}>
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      <span className="ml-1">Run</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent autopilot log (last 36h)</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap max-h-96 overflow-auto">
            {rows.flatMap((r) => Array.isArray(r.log) ? r.log.map((l: any) => ({ slot: r.scheduled_at, ...l })) : []).map((e, i) => (
              `${e.at}  ${e.step}  slot=${new Date(e.slot).toLocaleTimeString()}  ${e.meta ? JSON.stringify(e.meta) : ""}\n`
            )).join("")}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}