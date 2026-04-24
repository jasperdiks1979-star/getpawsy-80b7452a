import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MousePointerClick, Anchor, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';

/**
 * Admin dashboard for the homepage hero CTA tracking pipeline.
 *
 * The hero emits two events:
 *   - `hero_cta_click`        — fires for both CTAs.
 *   - `hero_anchor_result`    — fires only for the secondary CTA after the
 *                               scroll resolves; carries `anchor_reached`
 *                               (true/false) so we can detect broken anchors.
 *
 * This page side-by-sides 7-day and 30-day windows so a regression is easy
 * to spot at a glance: a sudden drop in `anchor_reached %` or in the click
 * volume itself almost always means the hero, the anchor target, or the
 * route changed.
 */

interface HeroCtaReport {
  window: { startDate: string; endDate: string };
  totals: {
    heroCtaClick: { count: number; users: number };
    heroAnchorResult: { count: number; users: number };
  };
  ctaSplit: Record<string, number>;
  anchorReached: {
    true: number;
    false: number;
    unknown: number;
    ratePct: number;
  };
  dailyTrends: Array<{ date: string; clicks: number; anchorResults: number }>;
  derived: {
    totalClicks: number;
    totalAnchorResults: number;
    anchorResultCoveragePct: number;
  };
}

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const today = (): string => new Date().toISOString().slice(0, 10);

function useHeroCtaReport(days: 7 | 30) {
  const { invokeFunction } = useAuthenticatedFetch();
  return useQuery<HeroCtaReport>({
    queryKey: ['hero-cta-analytics', days],
    queryFn: async () => {
      const { data, error } = await invokeFunction<HeroCtaReport>('ga4-analytics', {
        body: {
          reportType: 'hero_ctas',
          startDate: isoDaysAgo(days - 1),
          endDate: today(),
        },
      });
      if (error) throw error;
      if (!data) throw new Error('Empty response');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : 'text-foreground';
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function classifyReachedRate(rate: number, sample: number): 'success' | 'warning' | 'default' {
  // Treat as "no signal" until we have enough events to be statistically meaningful.
  if (sample < 10) return 'default';
  if (rate >= 80) return 'success';
  if (rate < 50) return 'warning';
  return 'default';
}

function MiniBarChart({ data }: { data: HeroCtaReport['dailyTrends'] }) {
  const max = useMemo(
    () => Math.max(1, ...data.map((d) => Math.max(d.clicks, d.anchorResults))),
    [data],
  );
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No daily data in this window.
      </div>
    );
  }
  return (
    <div className="flex items-end gap-1 h-28" aria-label="Daily hero CTA volume">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${d.date} · ${d.clicks} clicks · ${d.anchorResults} anchor results`}>
          <div className="w-full flex flex-col justify-end h-full gap-px">
            <div
              className="w-full bg-primary/70 rounded-sm"
              style={{ height: `${(d.clicks / max) * 100}%` }}
            />
            <div
              className="w-full bg-secondary rounded-sm"
              style={{ height: `${(d.anchorResults / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportCard({
  days,
  report,
  isLoading,
  isError,
  refetch,
}: {
  days: 7 | 30;
  report: HeroCtaReport | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Last {days} days</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-28" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Last {days} days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Could not load GA4 data. Make sure the service account has access to the property.
          </p>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const reachedTone = classifyReachedRate(
    report.anchorReached.ratePct,
    report.anchorReached.true + report.anchorReached.false,
  );

  const primaryClicks = report.ctaSplit['shop_litter_boxes'] ?? 0;
  const secondaryClicks = report.ctaSplit['how_it_works'] ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Last {days} days</CardTitle>
            <CardDescription className="font-mono text-xs">
              {report.window.startDate} → {report.window.endDate}
            </CardDescription>
          </div>
          <Badge variant="outline">GA4</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Hero CTA clicks"
            value={report.totals.heroCtaClick.count.toLocaleString()}
            hint={`${report.totals.heroCtaClick.users.toLocaleString()} users`}
            icon={MousePointerClick}
          />
          <StatTile
            label="Anchor reached %"
            value={`${report.anchorReached.ratePct.toFixed(1)}%`}
            hint={`${report.anchorReached.true.toLocaleString()} of ${(report.anchorReached.true + report.anchorReached.false).toLocaleString()} verified`}
            icon={Anchor}
            tone={reachedTone}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">Primary CTA</div>
            <div className="font-semibold tabular-nums">
              {primaryClicks.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">shop_litter_boxes</div>
          </div>
          <div className="rounded-lg border border-border/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">Secondary CTA</div>
            <div className="font-semibold tabular-nums">
              {secondaryClicks.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">how_it_works</div>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Daily volume
            </span>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-primary/70" /> Clicks
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-secondary" /> Anchor results
              </span>
            </div>
          </div>
          <MiniBarChart data={report.dailyTrends} />
        </div>

        <div className="text-xs text-muted-foreground border-t border-border/40 pt-2">
          Anchor result coverage: {report.derived.anchorResultCoveragePct.toFixed(1)}%
          {report.anchorReached.unknown > 0 && (
            <> · {report.anchorReached.unknown.toLocaleString()} events without an anchor_reached value</>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HeroCtaAnalyticsPage() {
  const week = useHeroCtaReport(7);
  const month = useHeroCtaReport(30);

  const refreshAll = () => {
    week.refetch();
    month.refetch();
  };

  return (
    <div className="container px-4 md:px-6 py-6 md:py-10 max-w-5xl">
      <Helmet>
        <title>Hero CTA Analytics · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Link>
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Hero CTA Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Engagement and anchor-reach health for the homepage hero, pulled live from GA4.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={week.isFetching || month.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${week.isFetching || month.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ReportCard
          days={7}
          report={week.data}
          isLoading={week.isLoading}
          isError={week.isError}
          refetch={week.refetch}
        />
        <ReportCard
          days={30}
          report={month.data}
          isLoading={month.isLoading}
          isError={month.isError}
          refetch={month.refetch}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">How to read this</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Hero CTA clicks</strong> counts every click on either of the two hero CTAs.
            Drops vs. the prior period almost always signal a hero copy or layout regression.
          </p>
          <p>
            <strong className="text-foreground">Anchor reached %</strong> is the share of <code className="text-xs">hero_anchor_result</code> events
            where the verifier confirmed the user actually scrolled into the <code className="text-xs">#how-it-works</code> section.
            A sustained value below 50% means the anchor target is missing, late-mounting, or the section was renamed.
          </p>
          <p className="text-xs">
            Note: GA4 custom event parameters (<code>cta_id</code>, <code>anchor_reached</code>) must be registered in the GA4 admin
            for the breakdowns above to populate. The totals work either way.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}