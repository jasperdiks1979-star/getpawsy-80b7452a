import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  enabled: boolean;
  recipient_email: string | null;
  webhook_url: string | null;
  threshold: number;
  cooldown_minutes: number;
};

type AlertLogRow = {
  id: string;
  key_fingerprint: string;
  consecutive_failures: number;
  source_function: string;
  email_sent: boolean;
  webhook_sent: boolean;
  webhook_status: number | null;
  email_error: string | null;
  webhook_error: string | null;
  created_at: string;
};

const DEFAULTS: Settings = {
  enabled: true,
  recipient_email: "",
  webhook_url: "",
  threshold: 3,
  cooldown_minutes: 60,
};

export default function VoiceoverAlertSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [recent, setRecent] = useState<AlertLogRow[]>([]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: logs }] = await Promise.all([
      supabase.from("cinematic_voiceover_alert_settings").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("cinematic_voiceover_alert_log")
        .select("id, key_fingerprint, consecutive_failures, source_function, email_sent, webhook_sent, webhook_status, email_error, webhook_error, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (s) {
      setSettings({
        enabled: !!s.enabled,
        recipient_email: (s.recipient_email as string | null) ?? "",
        webhook_url: (s.webhook_url as string | null) ?? "",
        threshold: Number(s.threshold ?? 3),
        cooldown_minutes: Number(s.cooldown_minutes ?? 60),
      });
    }
    setRecent((logs ?? []) as AlertLogRow[]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("cinematic_voiceover_alert_settings")
      .upsert({
        id: 1,
        enabled: settings.enabled,
        recipient_email: settings.recipient_email?.trim() || null,
        webhook_url: settings.webhook_url?.trim() || null,
        threshold: settings.threshold,
        cooldown_minutes: settings.cooldown_minutes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Alert settings saved"); loadAll(); }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-voiceover-alert", {
        body: {
          key_fingerprint: "test-fingerprint",
          consecutive_failures: Math.max(settings.threshold, 1),
          source: "cinematic-voiceover-generate",
          last_error: "Synthetic test alert from admin panel",
          force: true,
        },
      });
      if (error) throw error;
      const r = data as { ok: boolean; dispatched?: boolean; email?: any; webhook?: any; skipped?: string };
      if (r.skipped) toast.message(`Skipped: ${r.skipped}`);
      else if (r.dispatched) {
        const bits: string[] = [];
        if (r.email?.sent) bits.push("email ✓");
        else if (r.email?.error) bits.push(`email ✗ (${r.email.error})`);
        if (r.webhook?.sent) bits.push("webhook ✓");
        else if (r.webhook?.error) bits.push(`webhook ✗ (${r.webhook.error})`);
        toast.success(`Test alert dispatched: ${bits.join(", ") || "no channels"}`);
      } else toast.message("No alert dispatched");
      loadAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> ElevenLabs invalid_api_key alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
              />
              <Label className="text-sm">
                Alert when cinematic-voiceover-generate/backfill see repeated 401 invalid_api_key
              </Label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Recipient email</Label>
                <Input
                  type="email"
                  placeholder="ops@example.com"
                  value={settings.recipient_email ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, recipient_email: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Webhook URL (Slack/Discord/HTTP)</Label>
                <Input
                  type="url"
                  placeholder="https://hooks.slack.com/services/…"
                  value={settings.webhook_url ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, webhook_url: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Threshold (consecutive 401s)</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.threshold}
                  onChange={(e) => setSettings((s) => ({ ...s, threshold: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cooldown (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.cooldown_minutes}
                  onChange={(e) => setSettings((s) => ({ ...s, cooldown_minutes: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save settings
              </Button>
              <Button size="sm" variant="outline" onClick={sendTest} disabled={testing}>
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send test alert
              </Button>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Recent alerts</div>
              {recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No alerts dispatched yet.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {recent.map((a) => (
                    <li key={a.id} className="rounded border bg-muted/30 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={a.email_sent || a.webhook_sent ? "secondary" : "destructive"}>
                          {a.email_sent || a.webhook_sent ? "sent" : "failed"}
                        </Badge>
                        <span className="font-mono">{a.key_fingerprint}</span>
                        <span>×{a.consecutive_failures}</span>
                        <span className="text-muted-foreground">{a.source_function}</span>
                        <span className="ml-auto text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                      </div>
                      {(a.email_error || a.webhook_error) && (
                        <div className="mt-1 text-[11px] text-destructive">
                          {a.email_error ? `email: ${a.email_error}` : null}
                          {a.email_error && a.webhook_error ? " · " : null}
                          {a.webhook_error ? `webhook: ${a.webhook_error}` : null}
                        </div>
                      )}
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