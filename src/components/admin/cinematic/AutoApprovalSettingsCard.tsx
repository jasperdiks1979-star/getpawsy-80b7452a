import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Play } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  auto_approve_enabled: boolean;
  approval_confidence_threshold: number;
  max_duplicate_threshold: number;
  max_retry_threshold: number;
  min_unique_media_assets: number;
};

type Metrics = {
  auto_approved_24h: number;
  manual_review_open: number;
  approval_deadlocks: number;
  completed_from_auto: number;
};

export default function AutoApprovalSettingsCard() {
  const [s, setS] = useState<Settings | null>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const [{ data: settings }, autoCount, openCount, deadlocks, completedAuto] = await Promise.all([
      supabase.from("cinematic_ad_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("cinematic_ad_jobs").select("id", { count: "exact", head: true })
        .gte("auto_approved_at", new Date(Date.now() - 86400000).toISOString()),
      supabase.from("cinematic_ad_jobs").select("id", { count: "exact", head: true })
        .in("status", ["awaiting_approval", "needs_admin_review"]),
      supabase.from("cinematic_ad_jobs").select("id", { count: "exact", head: true })
        .in("status", ["awaiting_approval", "needs_admin_review"])
        .lt("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
      supabase.from("cinematic_ad_jobs").select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .not("auto_approved_at", "is", null),
    ]);
    if (settings) setS(settings as Settings);
    setM({
      auto_approved_24h: autoCount.count ?? 0,
      manual_review_open: openCount.count ?? 0,
      approval_deadlocks: deadlocks.count ?? 0,
      completed_from_auto: completedAuto.count ?? 0,
    });
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cinematic_ad_settings")
        .update({ ...s, updated_at: new Date().toISOString(), updated_by: u?.user?.id ?? null })
        .eq("id", true);
      if (error) throw error;
      toast.success("Auto-approval settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-auto-approve", { body: { limit: 50 } });
      if (error) throw error;
      toast.success(`Auto-approved ${data?.auto_approved ?? 0} • manual review ${data?.manual_review ?? 0}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  };

  if (!s) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Auto-approval engine
          {m && (
            <span className="ml-auto flex items-center gap-2">
              <Badge variant="secondary">{m.auto_approved_24h} auto / 24h</Badge>
              <Badge variant={m.manual_review_open > 0 ? "destructive" : "outline"}>{m.manual_review_open} manual</Badge>
              {m.approval_deadlocks > 0 && <Badge variant="destructive">{m.approval_deadlocks} deadlocks</Badge>}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Auto-approve safe jobs</span>
          <Switch checked={s.auto_approve_enabled} onCheckedChange={(v) => setS({ ...s, auto_approve_enabled: v })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="block text-muted-foreground">Confidence threshold (QA ≥)</span>
            <Input type="number" min={0} max={100} value={s.approval_confidence_threshold}
              onChange={(e) => setS({ ...s, approval_confidence_threshold: Number(e.target.value) })} />
          </label>
          <label className="text-xs space-y-1">
            <span className="block text-muted-foreground">Max duplicate risk</span>
            <Input type="number" min={0} max={100} value={s.max_duplicate_threshold}
              onChange={(e) => setS({ ...s, max_duplicate_threshold: Number(e.target.value) })} />
          </label>
          <label className="text-xs space-y-1">
            <span className="block text-muted-foreground">Max retry attempts</span>
            <Input type="number" min={0} max={10} value={s.max_retry_threshold}
              onChange={(e) => setS({ ...s, max_retry_threshold: Number(e.target.value) })} />
          </label>
          <label className="text-xs space-y-1">
            <span className="block text-muted-foreground">Min unique media assets</span>
            <Input type="number" min={1} max={20} value={s.min_unique_media_assets}
              onChange={(e) => setS({ ...s, min_unique_media_assets: Number(e.target.value) })} />
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save settings
          </Button>
          <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />} Run approval pass
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}