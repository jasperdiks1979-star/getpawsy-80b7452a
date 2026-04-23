import { Helmet } from 'react-helmet-async';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, RefreshCw, Bot, FileSearch, ExternalLink, ShieldAlert } from 'lucide-react';
import { useBotRenderSeoCorrelation, type BotSeoRow } from '@/hooks/useBotRenderSeoCorrelation';

function riskColor(label: BotSeoRow['riskLabel']): string {
  switch (label) {
    case 'critical': return 'bg-destructive text-destructive-foreground';
    case 'high':     return 'bg-orange-500 text-white';
    case 'medium':   return 'bg-yellow-500 text-foreground';
    default:         return 'bg-muted text-muted-foreground';
  }
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtRelative(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BotRenderSeoDashboard() {
  const { rows, summary, loading, error, refetch, windowDays, setWindowDays } =
    useBotRenderSeoCorrelation(14);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | BotSeoRow['riskLabel']>('all');

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (riskFilter !== 'all' && r.riskLabel !== riskFilter) return false;
      if (search && !r.slug.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, riskFilter]);

  return (
    <>
      <Helmet>
        <title>Bot Render × SEO Correlation | GetPawsy Admin</title>
        <meta name="description" content="Correlate bot render state with GSC performance to find soft-404 risk." />
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Bot Render × SEO Correlation
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Correlates Googlebot/crawler hits on <code>/product/*</code> with the render state
              captured by the PDP bot-render trace, then joins GSC impressions/clicks per slug
              to surface pages at risk of being indexed as soft-404s.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Bot className="h-4 w-4" /> Bot visits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalBotVisits}</div>
              <div className="text-xs text-muted-foreground">{summary.uniqueBots} unique bot types</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileSearch className="h-4 w-4" /> Render events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totalRenderedEvents}
                <span className="text-sm font-normal text-muted-foreground"> rendered</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {summary.totalShellEvents} shell · {summary.totalTimeoutEvents} timeout
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" /> Pages at risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{summary.pagesAtRisk}</div>
              <div className="text-xs text-muted-foreground">High + critical risk</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Shell ratio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.totalShellEvents + summary.totalRenderedEvents + summary.totalTimeoutEvents > 0
                  ? fmtPct(
                      (summary.totalShellEvents + summary.totalTimeoutEvents) /
                      (summary.totalShellEvents + summary.totalRenderedEvents + summary.totalTimeoutEvents)
                    )
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground">Shell + timeout / total</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6 flex flex-wrap items-center gap-3">
            <Input
              placeholder="Filter by slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk levels</SelectItem>
                <SelectItem value="critical">Critical only</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground ml-auto">
              Showing {filtered.length} of {rows.length} pages
            </div>
          </CardContent>
        </Card>

        {/* Error state */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-page correlation</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No bot crawls of <code>/product/*</code> in the selected window.
                <div className="mt-2 text-xs">
                  Once Googlebot fetches a PDP, the render-trace hook will populate this view.
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk</TableHead>
                    <TableHead>Product slug</TableHead>
                    <TableHead>Bots</TableHead>
                    <TableHead className="text-right">Crawls</TableHead>
                    <TableHead className="text-right">Shell</TableHead>
                    <TableHead className="text-right">Rendered</TableHead>
                    <TableHead className="text-right">Timeout</TableHead>
                    <TableHead className="text-right">Shell %</TableHead>
                    <TableHead className="text-right">GSC impr.</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Avg pos.</TableHead>
                    <TableHead>Last crawl</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.slug}>
                      <TableCell>
                        <Badge className={riskColor(row.riskLabel)}>
                          {row.riskLabel} · {row.softFourOhFourRisk}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[280px] truncate">
                        {row.slug}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.botTypes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.botTypes.slice(0, 3).map((b) => (
                              <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>
                            ))}
                            {row.botTypes.length > 3 && (
                              <span className="text-muted-foreground">+{row.botTypes.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.totalCrawls}</TableCell>
                      <TableCell className="text-right">{row.shellCount}</TableCell>
                      <TableCell className="text-right text-green-600">{row.renderedCount}</TableCell>
                      <TableCell className="text-right text-destructive">{row.timeoutCount}</TableCell>
                      <TableCell className="text-right">{fmtPct(row.shellPct)}</TableCell>
                      <TableCell className="text-right">{row.impressions || '—'}</TableCell>
                      <TableCell className="text-right">{row.clicks || '—'}</TableCell>
                      <TableCell className="text-right">
                        {row.avgPosition !== null ? row.avgPosition.toFixed(1) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtRelative(row.lastCrawlAt)}
                      </TableCell>
                      <TableCell>
                        <a
                          href={row.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          <strong>How it works:</strong> the PDP bot-render trace hook tags crawler URLs with{' '}
          <code>?_render=shell|rendered|timeout</code>. This dashboard parses those tags from{' '}
          <code>crawler_visits</code>, joins them to <code>keyword_rankings</code> by slug, and
          flags pages where Googlebot frequently sees the loading shell — the leading indicator of
          a soft-404 indexing.
        </div>
      </div>
    </>
  );
}