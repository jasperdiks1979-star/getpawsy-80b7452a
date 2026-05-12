import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

const MODES = ["OFF", "OBSERVE_ONLY", "DRAFT_ONLY", "AUTO_QUEUE", "AUTO_PUBLISH_CONSERVATIVE", "AUTO_PUBLISH_BALANCED"];

export function AutopilotSettingsTab({ onSaved }: { onSaved?: () => void }) {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { (async () => {
    const { data } = await supabase.from("gi_settings").select("*").limit(1).maybeSingle();
    setSettings(data);
  })(); }, []);
  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from("gi_settings").update({
      autopilot_mode: settings.autopilot_mode,
      pinterest_daily_cap: settings.pinterest_daily_cap,
      tiktok_daily_cap: settings.tiktok_daily_cap,
      min_us_sessions_for_decisions: settings.min_us_sessions_for_decisions,
      notes: settings.notes,
    }).eq("id", settings.id);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Saved" }); onSaved?.(); }
  }
  if (!settings) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Autopilot Settings</CardTitle>
        <CardDescription>Default is <strong>DRAFT_ONLY</strong>. Nothing auto-publishes until you change this.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <Label>Autopilot mode</Label>
          <Select value={settings.autopilot_mode} onValueChange={(v) => setSettings({ ...settings, autopilot_mode: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2"><Label>Pinterest daily cap</Label>
            <Input type="number" value={settings.pinterest_daily_cap} onChange={(e) => setSettings({ ...settings, pinterest_daily_cap: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>TikTok daily cap</Label>
            <Input type="number" value={settings.tiktok_daily_cap} onChange={(e) => setSettings({ ...settings, tiktok_daily_cap: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Min US sessions</Label>
            <Input type="number" value={settings.min_us_sessions_for_decisions} onChange={(e) => setSettings({ ...settings, min_us_sessions_for_decisions: Number(e.target.value) })} /></div>
        </div>
        <div className="space-y-2"><Label>Notes</Label>
          <Input value={settings.notes ?? ""} onChange={(e) => setSettings({ ...settings, notes: e.target.value })} placeholder="Optional notes" /></div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save
        </Button>
      </CardContent>
    </Card>
  );
}
