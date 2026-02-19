import { Helmet } from 'react-helmet-async';
import { RunAllPanel } from '@/components/admin/RunAllPanel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import {
  AlertTriangle, TrendingUp, TrendingDown, Zap, RefreshCw,
  Eye, Target, Flame, ShieldAlert, Link2, FileText, ChevronRight,
} from 'lucide-react';
import { useSeoDashboard } from '@/hooks/useSeoDashboard';
import { THRESHOLDS, type DecisionAlert, type PriorityPage, type Top20Playbook } from '@/lib/seo-decision-engine';

type Tab = 'priority' | 'low_ctr' | 'top_20' | 'risk' | 'unsupported' | 'playbook' | 'weekly';

const TABS: { key: Tab; label: string; icon: typeof Eye }[] = [
  { key: 'priority', label: 'Priority Pages', icon: Target },
  { key: 'low_ctr', label: 'Low CTR', icon: Eye },
  { key: 'top_20', label: 'Top 20 Push', icon: TrendingUp },
  { key: 'risk', label: 'Ranking Risk', icon: ShieldAlert },
  { key: 'unsupported', label: 'Under-Supported', icon: Link2 },
  { key: 'playbook', label: 'Top 20 Playbook', icon: Flame },
  { key: 'weekly', label: 'Weekly Report', icon: FileText },
];

export default function AdminSeoDashboard() {
  const { gscResult, priorityPages, alerts, playbooks, weeklyReport, loading, refetch } = useSeoDashboard();
  const [activeTab, setActiveTab] = useState<Tab>('priority');

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const lowCtr = alerts.filter(a => a.type === 'low_ctr');
  const top20 = alerts.filter(a => a.type === 'top_20_push');
  const risk = alerts.filter(a => a.type === 'decay');
  const unsupported = alerts.filter(a => a.type === 'under_supported');

  const tabCounts: Record<Tab, number> = {
    priority: priorityPages.slice(0, 10).length,
    low_ctr: lowCtr.length,
    top_20: top20.length,
    risk: risk.length,
    unsupported: unsupported.length,
    playbook: playbooks.length,
    weekly: 1,
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">SEO Decision Engine</h1>
            <p className="text-sm text-muted-foreground">Monitoring + decision support · No auto-changes</p>
          </div>
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Status Bar */}
        {gscResult && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
            Status: <span className="font-medium">{gscResult.status.toUpperCase()}</span>
            {gscResult.lastSyncedAt && <> · Last sync: {new Date(gscResult.lastSyncedAt).toLocaleString()}</>}
            {gscResult.sitewide && <> · {gscResult.sitewide.totalGuidesWithData} guides · {gscResult.sitewide.totalImpressions.toLocaleString()} impressions</>}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Total Impressions" value={weeklyReport?.totalImpressions.toLocaleString() ?? '—'} sub="7-day" />
          <KpiCard label="Total Clicks" value={weeklyReport?.totalClicks.toLocaleString() ?? '—'} sub="7-day" />
          <KpiCard label="Avg CTR" value={weeklyReport ? `${weeklyReport.avgCtr.toFixed(2)}%` : '—'} sub="All guides" />
          <KpiCard label="Avg Position" value={weeklyReport ? weeklyReport.avgPosition.toFixed(1) : '—'} sub="All guides" />
          <KpiCard label="Active Alerts" value={String(alerts.length)} sub={`${risk.length} critical`} highlight={risk.length > 0} />
        </div>

        {/* Safety Banner */}
        <div className="text-xs bg-muted/30 border rounded px-3 py-2 flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">
            Safety: Max {THRESHOLDS.SAFETY.maxChangesPerPage14d} changes/page/14d · No auto-rewrites · All suggestions require manual approval
          </span>
        </div>

        {/* Pipeline Runner */}
        <RunAllPanel />

        {/* Tabs */}
        <div className="border-b overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">{tabCounts[tab.key]}</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'priority' && <PriorityTab pages={priorityPages} />}
          {activeTab === 'low_ctr' && <AlertListTab alerts={lowCtr} emptyText="No low CTR alerts" />}
          {activeTab === 'top_20' && <AlertListTab alerts={top20} emptyText="No Top 20 push candidates" />}
          {activeTab === 'risk' && <AlertListTab alerts={risk} emptyText="No ranking risk alerts" />}
          {activeTab === 'unsupported' && <AlertListTab alerts={unsupported} emptyText="All guides have adequate link support" />}
          {activeTab === 'playbook' && <PlaybookTab playbooks={playbooks} />}
          {activeTab === 'weekly' && weeklyReport && <WeeklyTab report={weeklyReport} />}
        </div>
      </div>
    </div>
  );
}

// ============= SUB-COMPONENTS =============

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${highlight ? 'text-destructive' : ''}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function PriorityTab({ pages }: { pages: PriorityPage[] }) {
  const top10 = pages.slice(0, 10);
  if (top10.length === 0) return <EmptyState text="No priority pages" />;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Top 10 Priority Pages</h2>
      {top10.map(p => (
        <Card key={p.slug}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold">/guides/{p.slug}</p>
                <p className="text-xs text-muted-foreground">{p.reason}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-primary">{p.score}</div>
                <p className="text-[10px] text-muted-foreground">Score</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <MetricCell label="Impressions" value={String(p.metrics.impressions7d)} />
              <MetricCell label="CTR" value={`${p.metrics.ctr7d.toFixed(2)}%`} />
              <MetricCell label="Position" value={p.metrics.avgPosition7d.toFixed(1)} />
              <MetricCell label="Trend" value={p.metrics.trendDirection} icon={
                p.metrics.trendDirection === 'up' ? <TrendingUp className="h-3 w-3 text-primary" /> :
                p.metrics.trendDirection === 'down' ? <TrendingDown className="h-3 w-3 text-destructive" /> : null
              } />
              <MetricCell label="Links In" value={String(p.metrics.inboundLinks)} />
            </div>
            {p.alerts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.alerts.map((a, i) => (
                  <Badge key={i} variant={a.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px]">
                    {a.title}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AlertListTab({ alerts, emptyText }: { alerts: DecisionAlert[]; emptyText: string }) {
  if (alerts.length === 0) return <EmptyState text={emptyText} />;

  return (
    <ScrollArea className="max-h-[600px]">
      <div className="space-y-3">
        {alerts.map((a, i) => (
          <Card key={`${a.slug}-${i}`} className={a.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' : ''}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">/guides/{a.slug}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
                <Badge variant={a.severity === 'critical' ? 'destructive' : a.severity === 'warning' ? 'secondary' : 'outline'} className="text-[10px]">
                  {a.severity}
                </Badge>
              </div>

              {/* Metrics */}
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                {a.metrics.impressions !== undefined && <span>Impr: {a.metrics.impressions}</span>}
                {a.metrics.ctr !== undefined && <span>CTR: {a.metrics.ctr.toFixed(2)}%</span>}
                {a.metrics.position !== undefined && <span>Pos: {a.metrics.position}</span>}
                {a.metrics.inboundLinks !== undefined && <span>Links: {a.metrics.inboundLinks}</span>}
              </div>

              {/* Suggested Actions */}
              <div className="bg-muted/50 rounded p-2">
                <p className="text-[10px] font-semibold mb-1">Suggested Actions (manual):</p>
                <ul className="space-y-0.5">
                  {a.suggestedActions.map((action, j) => (
                    <li key={j} className="text-[10px] text-muted-foreground flex items-start gap-1">
                      <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

function PlaybookTab({ playbooks }: { playbooks: Top20Playbook[] }) {
  if (playbooks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Flame className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No pages qualify for Top 20 Playbook activation.</p>
          <p className="text-xs text-muted-foreground mt-1">Requires position 18–25 stable for 14 days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5">
        <Flame className="h-4 w-4 text-accent-foreground" /> Top 20 Push Playbook
      </h2>
      <p className="text-xs text-muted-foreground">
        Pages in position 18–25 (stable). Max 2 structural changes per 14 days.
      </p>
      {playbooks.map(pb => (
        <Card key={pb.slug} className="border-accent/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold">/guides/{pb.slug}</p>
              <Badge variant="secondary" className="text-[10px]">
                Pos {pb.position}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{pb.impressions} impressions · Activated {new Date(pb.activatedAt).toLocaleDateString()}</p>
            <ol className="space-y-1 mt-1">
              {pb.steps.map((step, j) => (
                <li key={j} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                  <span className="font-bold text-foreground shrink-0">{j + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WeeklyTab({ report }: { report: NonNullable<ReturnType<typeof useSeoDashboard>['weeklyReport']> }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Weekly SEO Review — {report.weekOf}</h2>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Impressions" value={report.totalImpressions.toLocaleString()} sub="7-day total" />
        <KpiCard label="Clicks" value={report.totalClicks.toLocaleString()} sub="7-day total" />
        <KpiCard label="Avg CTR" value={`${report.avgCtr.toFixed(2)}%`} sub="All guides" />
        <KpiCard label="Avg Position" value={report.avgPosition.toFixed(1)} sub="All guides" />
      </div>

      {/* Gainers & Decliners */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-primary" /> Top Gaining Pages</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            {report.topGainers.length > 0 ? report.topGainers.map(g => (
              <div key={g.slug} className="flex justify-between">
                <span>/guides/{g.slug}</span>
                <span className="text-primary font-medium">+{g.delta} impr</span>
              </div>
            )) : <p className="text-muted-foreground">No gainers this period</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-destructive" /> Top Declining Pages</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            {report.topDecliners.length > 0 ? report.topDecliners.map(d => (
              <div key={d.slug} className="flex justify-between">
                <span>/guides/{d.slug}</span>
                <span className="text-destructive font-medium">{d.delta} pos</span>
              </div>
            )) : <p className="text-muted-foreground">No decliners this period</p>}
          </CardContent>
        </Card>
      </div>

      {/* Near Top 20 & Low CTR */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Pages Near Top 20 (pos 18–25)</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            {report.pagesNearTop20.length > 0 ? report.pagesNearTop20.map(s => (
              <p key={s}>/guides/{s}</p>
            )) : <p className="text-muted-foreground">None</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Pages with CTR &lt; 1%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            {report.pagesLowCtr.length > 0 ? report.pagesLowCtr.map(s => (
              <p key={s}>/guides/{s}</p>
            )) : <p className="text-muted-foreground">None</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recommended Actions */}
      {report.recommendedActions.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Recommended Manual Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {report.recommendedActions.map((a, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCell({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        {icon}
        <p className="font-semibold text-xs">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
