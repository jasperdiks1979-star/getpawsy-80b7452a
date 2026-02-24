import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Activity,
  BarChart3,
  FileText,
  Globe,
  Search,
  ShoppingCart,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

/* ── tiny stat card ─────────────────────────────────────────────── */
function Stat({ label, value, icon: Icon, delta }: {
  label: string; value: string | number; icon: React.ElementType; delta?: string;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {delta && <p className="text-xs text-primary">{delta}</p>}
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="w-3 h-3" /> {label}: unknown</span>;
  return ok
    ? <span className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="w-3 h-3" /> {label}: OK</span>
    : <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="w-3 h-3" /> {label}: FAIL</span>;
}

interface GscRow { page: string | null; impressions: number | null; clicks: number | null; position: number | null; }

export default function ProgressDashboard() {
  // ── Crawl health ─────────────────────────────────────────────
  const { data: healthChecks } = useQuery({
    queryKey: ['progress-health'],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_health_checks')
        .select('id, check_type, all_healthy, results, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    staleTime: 60_000,
  });

  // ── Job runs ─────────────────────────────────────────────────
  const { data: jobRuns } = useQuery({
    queryKey: ['progress-jobs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_runs')
        .select('id, source, status, started_at, finished_at, duration_ms, report, error_message')
        .order('started_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    staleTime: 60_000,
  });

  // ── GSC keywords (top 20 pages by impressions) ──────────────
  const { data: gscRows } = useQuery({
    queryKey: ['progress-gsc'],
    queryFn: async () => {
      const { data } = await supabase
        .from('gsc_keywords')
        .select('page, impressions, clicks, position')
        .order('impressions', { ascending: false })
        .limit(20);
      return (data || []) as GscRow[];
    },
    staleTime: 120_000,
  });

  // ── Content counts ───────────────────────────────────────────
  const { data: contentCounts } = useQuery({
    queryKey: ['progress-content'],
    queryFn: async () => {
      const [products, blogs, orders] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
      ]);
      return {
        products: products.count ?? 0,
        blogs: blogs.count ?? 0,
        orders: orders.count ?? 0,
      };
    },
    staleTime: 120_000,
  });

  // ── Derived metrics ──────────────────────────────────────────
  const totalImpressions = gscRows?.reduce((s, r) => s + (r.impressions || 0), 0) ?? 0;
  const totalClicks = gscRows?.reduce((s, r) => s + (r.clicks || 0), 0) ?? 0;
  const avgPosition = gscRows && gscRows.length > 0
    ? (gscRows.reduce((s, r) => s + (r.position || 0), 0) / gscRows.length).toFixed(1)
    : '—';

  const lastRun = jobRuns?.[0];
  const lastRunReport = lastRun?.report as Record<string, unknown> | null;

  const lastHealth = healthChecks?.[0];

  return (
    <Layout>
      <Helmet>
        <title>Progress Dashboard | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 space-y-8 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">Webshop Progress Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time overview of crawl health, indexing, GSC performance, content, and revenue signals.
          </p>
        </div>

        {/* ── Quick Stats ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Products" value={contentCounts?.products ?? '—'} icon={ShoppingCart} />
          <Stat label="Blog Posts" value={contentCounts?.blogs ?? '—'} icon={FileText} />
          <Stat label="Orders" value={contentCounts?.orders ?? '—'} icon={TrendingUp} />
          <Stat label="GSC Impressions" value={totalImpressions.toLocaleString()} icon={Search} />
        </div>

        {/* ── Crawl Health ─────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Activity className="w-4 h-4" /> Crawl Health</h2>
          <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
            <StatusBadge ok={lastHealth?.all_healthy ?? null} label="Overall site health" />

            <div className="border-t border-border/40 pt-3 space-y-2">
              <h3 className="text-sm font-medium">WWW → Apex Redirect (must be 301/308)</h3>
              <p className="text-xs text-muted-foreground">
                <strong>How to fix:</strong> In Cloudflare → Rules → Redirect Rules, create:
                <code className="bg-muted px-1.5 py-0.5 rounded ml-1 text-[11px]">
                  Hostname equals www.getpawsy.pet → 301 to https://getpawsy.pet/$1
                </code>.
                Ensure the DNS record for <code className="bg-muted px-1 rounded">www</code> is set to Grey Cloud (DNS Only) pointing to 185.158.133.1.
              </p>
            </div>

            {healthChecks && healthChecks.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-left py-1 pr-3">Check Type</th>
                      <th className="text-left py-1 pr-3">Healthy</th>
                      <th className="text-left py-1">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthChecks.map((check) => (
                      <tr key={check.id} className="border-b border-border/30">
                        <td className="py-1.5 pr-3">{check.check_type}</td>
                        <td className="py-1.5 pr-3">{check.all_healthy ? '✅' : '❌'}</td>
                        <td className="py-1.5 text-muted-foreground">{format(new Date(check.created_at), 'MMM d HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Indexing ─────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Globe className="w-4 h-4" /> Indexing</h2>
          <div className="bg-card border border-border/60 rounded-xl p-4 space-y-2">
            {lastRun ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Last run:</span> {format(new Date(lastRun.started_at), 'MMM d HH:mm')}</div>
                  <div><span className="text-muted-foreground">Status:</span> <span className={lastRun.status === 'completed' ? 'text-primary' : 'text-destructive'}>{lastRun.status}</span></div>
                  <div><span className="text-muted-foreground">Duration:</span> {lastRun.duration_ms ? `${(lastRun.duration_ms / 1000).toFixed(1)}s` : '—'}</div>
                  <div><span className="text-muted-foreground">Source:</span> {lastRun.source || '—'}</div>
                </div>
                {lastRunReport && (
                  <div className="mt-2 text-xs space-y-1 border-t border-border/40 pt-2">
                    <p>Submitted: <strong>{String(lastRunReport.submittedCount ?? lastRunReport.urlsSubmitted ?? '—')}</strong></p>
                    <p>Google confirmed: <strong>{String(lastRunReport.googleConfirmedCount ?? lastRunReport.googleProcessed ?? '—')}</strong></p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
            )}
          </div>
        </section>

        {/* ── GSC Performance ──────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> GSC Performance (Top 20 Pages)</h2>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <Stat label="Total Clicks" value={totalClicks} icon={Search} />
            <Stat label="Total Impressions" value={totalImpressions.toLocaleString()} icon={BarChart3} />
            <Stat label="Avg Position" value={avgPosition} icon={TrendingUp} />
          </div>
          {gscRows && gscRows.length > 0 && (
            <div className="bg-card border border-border/60 rounded-xl p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left py-1 pr-3">#</th>
                    <th className="text-left py-1 pr-3">Page</th>
                    <th className="text-right py-1 pr-3">Impressions</th>
                    <th className="text-right py-1 pr-3">Clicks</th>
                    <th className="text-right py-1">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {gscRows.map((row, i) => (
                    <tr key={`${row.page}-${i}`} className="border-b border-border/30">
                      <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-3 font-mono truncate max-w-[250px]">{row.page || '—'}</td>
                      <td className="py-1.5 pr-3 text-right">{row.impressions?.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right">{row.clicks}</td>
                      <td className="py-1.5 text-right">{row.position?.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
