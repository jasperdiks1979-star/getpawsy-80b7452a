import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Play, AlertCircle } from "lucide-react";

type Snapshot = {
  status: "healthy" | "delayed" | "stalled";
  publishedToday: number;
  queued: number;
  drafts: number;
  failed: number;
  rejected: number;
  blocked: number;
  lastPublishAt: string | null;
  minutesSinceLastPublish: number | null;
  oldestDraftAt: string | null;
  minutesOldestDraft: number | null;
  lastDirectorAt: string | null;
  minutesSinceLastDirector: number | null;
  nextPublishAt: string | null;
  incidents: Array<{ condition: string; severity: string; detail: any }>;
  recovery?: any;
};

const statusColor = {
  healthy: { dot: "🟢", label: "Healthy", cls: "bg-emerald-100 text-emerald-800" },
  delayed: { dot: "🟡", label: "Delayed", cls: "bg-amber-100 text-amber-800" },
  stalled: { dot: "🔴", label: "Stalled", cls: "bg-red-100 text-red-800" },
} as const;

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function PinterestHealthPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);

  async function refresh(runAction = false) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-flow-monitor",
        runAction ? { body: {} } : { method: "GET" as any },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Monitor returned error");
      setSnap(data.snapshot);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    const { data: incs } = await supabase
      .from("pinterest_health_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15);
    setIncidents(incs ?? []);
  }

  useEffect(() => {
    refresh(false);
    const t = setInterval(() => refresh(false), 60_000);
    return () => clearInterval(t);
  }, []);

  const sc = snap ? statusColor[snap.status] : statusColor.healthy;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <Helmet>
        <title>Pinterest Health Monitor — GetPawsy Admin</title>
      </Helmet>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Pinterest Flow Monitor</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh(false)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => refresh(true)} disabled={loading}>
            <Play className="h-4 w-4 mr-1" />
            Run monitor + recovery
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 text-red-800 text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          {error}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-3xl">{sc.dot}</span>
          <Badge className={sc.cls}>{sc.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {snap ? `${snap.incidents.length} active condition(s)` : "Loading…"}
          </span>
        </div>

        {snap && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            <Stat label="Published today" value={snap.publishedToday} />
            <Stat label="Queued" value={snap.queued} />
            <Stat label="Drafts" value={snap.drafts} />
            <Stat label="Failed / stuck" value={snap.failed} />
            <Stat label="Rejected" value={snap.rejected} />
            <Stat label="Blocked (legacy)" value={snap.blocked} />
          </div>
        )}

        {snap && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Row label="Last publish" value={`${fmt(snap.lastPublishAt)} (${snap.minutesSinceLastPublish ?? "—"} min ago)`} />
            <Row label="Next scheduled" value={fmt(snap.nextPublishAt)} />
            <Row label="Oldest draft" value={snap.oldestDraftAt ? `${fmt(snap.oldestDraftAt)} (${snap.minutesOldestDraft} min)` : "none"} />
            <Row label="Last director output" value={snap.lastDirectorAt ? `${fmt(snap.lastDirectorAt)} (${snap.minutesSinceLastDirector} min)` : "—"} />
          </div>
        )}
      </Card>

      {snap && snap.incidents.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold mb-2">Active conditions</h2>
          <ul className="space-y-1 text-sm">
            {snap.incidents.map((i, n) => (
              <li key={n} className="flex justify-between gap-2 border-b py-1">
                <span className="font-mono">{i.condition}</span>
                <span className="text-muted-foreground">{i.severity}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-semibold mb-2">Recent incidents</h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents logged yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {incidents.map((i) => (
              <div key={i.id} className="border rounded p-2">
                <div className="flex justify-between flex-wrap gap-2">
                  <span className="font-mono">{i.condition}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(i.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2 mt-1 text-xs flex-wrap">
                  <Badge variant="outline">{i.severity}</Badge>
                  {i.sms_alert_sent && <Badge className="bg-blue-100 text-blue-800">SMS sent</Badge>}
                  {i.recovery_attempted && <Badge className="bg-emerald-100 text-emerald-800">Recovery attempted</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}