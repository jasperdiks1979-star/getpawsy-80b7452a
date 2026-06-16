import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Send,
  MessageSquare,
  Download,
  ExternalLink,
} from "lucide-react";

type Snapshot = {
  monitor: {
    status?: "healthy" | "delayed" | "stalled";
    publishedToday?: number;
    queued?: number;
    drafts?: number;
    failed?: number;
    rejected?: number;
    blocked?: number;
    lastPublishAt?: string | null;
    minutesSinceLastPublish?: number | null;
    oldestDraftAt?: string | null;
    nextPublishAt?: string | null;
    incidents?: Array<{ condition: string; severity: string }>;
  } | null;
  generatedToday: number;
  avgDraftToPostedMin: number | null;
  recentPins: Array<{
    id: string;
    pin_title: string;
    product_slug: string;
    board_name: string;
    pinterest_pin_id: string | null;
    external_url: string | null;
    pin_image_url: string | null;
    posted_at: string | null;
  }>;
  stuckPins: Array<{
    id: string;
    pin_title: string;
    product_slug: string;
    status: string;
    retries: number;
    last_publish_error: string | null;
    recovery_mode_publish: boolean;
    updated_at: string;
  }>;
  revenue: Array<{
    pin_id: string;
    product_slug: string | null;
    board: string | null;
    headline: string | null;
    clicks: number;
    orders: number;
    revenue_cents: number;
    roas: number;
  }>;
  incidents: Array<{
    id: string;
    created_at: string;
    condition: string;
    severity: string;
    status: string;
    recovery_attempted: boolean;
    sms_alert_sent: boolean;
  }>;
};

const statusMeta = {
  healthy: { dot: "🟢", label: "Healthy", cls: "bg-emerald-100 text-emerald-800" },
  delayed: { dot: "🟡", label: "Delayed", cls: "bg-amber-100 text-amber-800" },
  stalled: { dot: "🔴", label: "Stalled", cls: "bg-red-100 text-red-800" },
} as const;

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function fmtAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function PinterestRevenueControlPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-revenue-control",
        { body: { action: "snapshot" } },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "snapshot_failed");
      setSnap(data.snapshot);
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function action(name: string, label: string) {
    setBusy(name);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-revenue-control",
        { body: { action: name } },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || `${name}_failed`);
      toast.success(`${label} ✓`);
      load();
    } catch (e: any) {
      toast.error(`${label}: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setBusy("export_audit");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/pinterest-revenue-control`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "export_audit" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pinterest-audit-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("CSV exported");
    } catch (e: any) {
      toast.error(`Export: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const m = snap?.monitor ?? null;
  const st = m?.status ? statusMeta[m.status] : statusMeta.healthy;

  return (
    <div className="min-h-screen bg-background p-3 md:p-6">
      <Helmet>
        <title>Pinterest Revenue Control</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="mb-4">
        <h1 className="text-xl md:text-2xl font-semibold">
          Pinterest Revenue Control
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Monitor, self-heal, and audit the Pinterest pin pipeline.
        </p>
      </header>

      {/* Status card */}
      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{st.dot}</span>
            <div>
              <Badge className={st.cls}>{st.label}</Badge>
              <div className="text-xs text-muted-foreground mt-1">
                Last publish {fmtAgo(m?.lastPublishAt)} • next ~{fmt(m?.nextPublishAt)}
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-4 text-center">
          <Metric label="Posted today" value={m?.publishedToday ?? 0} />
          <Metric label="Generated today" value={snap?.generatedToday ?? 0} />
          <Metric label="Queued" value={m?.queued ?? 0} />
          <Metric label="Drafts" value={m?.drafts ?? 0} />
          <Metric label="Failed" value={m?.failed ?? 0} />
          <Metric
            label="Avg draft→post"
            value={snap?.avgDraftToPostedMin == null ? "—" : `${snap.avgDraftToPostedMin}m`}
          />
        </div>
      </Card>

      {/* Action buttons */}
      <Card className="p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Button size="sm" variant="outline" disabled={!!busy}
            onClick={() => action("run_health_check", "Health check")}>
            <RefreshCw className="h-4 w-4 mr-1" /> Health
          </Button>
          <Button size="sm" disabled={!!busy}
            onClick={() => action("recover", "Recover stalled flow")}>
            <ShieldAlert className="h-4 w-4 mr-1" /> Recover
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy}
            onClick={() => action("generate", "Generate 3 pins")}>
            <Sparkles className="h-4 w-4 mr-1" /> Generate 3
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy}
            onClick={() => action("publish_next", "Publish next pin")}>
            <Send className="h-4 w-4 mr-1" /> Publish next
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy}
            onClick={() => action("test_sms", "Test SMS")}>
            <MessageSquare className="h-4 w-4 mr-1" /> Test SMS
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </Card>

      {/* Recent pins */}
      <Card className="p-3 mb-3">
        <h2 className="text-sm font-semibold mb-2">Last 10 published pins</h2>
        <div className="space-y-2">
          {(snap?.recentPins ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs border-b pb-2 last:border-0">
              {p.pin_image_url ? (
                <img src={p.pin_image_url} alt="" className="h-10 w-10 rounded object-cover flex-shrink-0" loading="lazy" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.pin_title}</div>
                <div className="text-muted-foreground truncate">
                  {p.board_name} • {p.product_slug} • {fmtAgo(p.posted_at)}
                </div>
              </div>
              {p.external_url && (
                <a href={p.external_url} target="_blank" rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
          {(!snap?.recentPins || snap.recentPins.length === 0) && (
            <div className="text-xs text-muted-foreground">No published pins yet.</div>
          )}
        </div>
      </Card>

      {/* Stuck pins */}
      <Card className="p-3 mb-3">
        <h2 className="text-sm font-semibold mb-2">
          Stuck / recovered ({snap?.stuckPins?.length ?? 0})
        </h2>
        <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
          {(snap?.stuckPins ?? []).map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 border-b pb-1 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.pin_title}</div>
                <div className="text-muted-foreground truncate">
                  {p.product_slug} • retries {p.retries}
                  {p.last_publish_error ? ` • ${p.last_publish_error.slice(0, 80)}` : ""}
                </div>
              </div>
              <Badge variant="outline" className="flex-shrink-0">
                {p.recovery_mode_publish ? "recovered" : p.status}
              </Badge>
            </div>
          ))}
          {(!snap?.stuckPins || snap.stuckPins.length === 0) && (
            <div className="text-muted-foreground">No stuck pins.</div>
          )}
        </div>
      </Card>

      {/* Revenue attribution */}
      <Card className="p-3 mb-3">
        <h2 className="text-sm font-semibold mb-2">Revenue attribution (7-day)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">Pin</th>
                <th className="py-1 pr-2">Product</th>
                <th className="py-1 pr-2 text-right">Clicks</th>
                <th className="py-1 pr-2 text-right">Orders</th>
                <th className="py-1 pr-2 text-right">Revenue</th>
                <th className="py-1 pr-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {(snap?.revenue ?? []).map((r) => (
                <tr key={r.pin_id} className="border-t">
                  <td className="py-1 pr-2 truncate max-w-[120px]">{r.pin_id}</td>
                  <td className="py-1 pr-2 truncate max-w-[180px]">{r.product_slug ?? "—"}</td>
                  <td className="py-1 pr-2 text-right">{r.clicks}</td>
                  <td className="py-1 pr-2 text-right">{r.orders}</td>
                  <td className="py-1 pr-2 text-right">
                    €{(r.revenue_cents / 100).toFixed(2)}
                  </td>
                  <td className="py-1 pr-2 text-right">{Number(r.roas ?? 0).toFixed(2)}</td>
                </tr>
              ))}
              {(!snap?.revenue || snap.revenue.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-2 text-muted-foreground text-center">
                    No attributed revenue yet in the 7-day window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Incidents */}
      <Card className="p-3 mb-3">
        <h2 className="text-sm font-semibold mb-2">Recent incidents</h2>
        <div className="space-y-1 text-xs max-h-48 overflow-y-auto">
          {(snap?.incidents ?? []).map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
              <div className="truncate">
                <span className="font-medium">{i.condition}</span>
                <span className="text-muted-foreground"> • {fmt(i.created_at)}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Badge variant="outline">{i.severity}</Badge>
                {i.sms_alert_sent && <Badge variant="outline">SMS</Badge>}
                {i.recovery_attempted && <Badge variant="outline">recov</Badge>}
              </div>
            </div>
          ))}
          {(!snap?.incidents || snap.incidents.length === 0) && (
            <div className="text-muted-foreground">No incidents.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-base md:text-lg font-semibold">{value}</div>
      <div className="text-[10px] md:text-xs text-muted-foreground">{label}</div>
    </div>
  );
}