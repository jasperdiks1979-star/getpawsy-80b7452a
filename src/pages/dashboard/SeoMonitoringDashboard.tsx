import { useState } from 'react';
import { useSeoMonitoring } from '@/hooks/useSeoMonitoring';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, Zap, Lock } from 'lucide-react';

export default function SeoMonitoringDashboard() {
  const { gscResult, priorityScores, alerts, unsupportedPages, weeklySummary, loading } = useSeoMonitoring();
  const [activeTab, setActiveTab] = useState<'priority' | 'low_ctr' | 'top_20' | 'risk' | 'unsupported'>('priority');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Zap className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <p>Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  if (!gscResult || gscResult.status === 'no_sync') {
    return (
      <div className="p-6">
        <Card className="border-warning bg-warning/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              No GSC Data
            </CardTitle>
          </CardHeader>
          <CardContent className="text-warning/80">
            {gscResult?.statusMessage || 'GSC sync not configured. Check edge function logs.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const lowCtrAlerts = alerts.filter(a => a.type === 'low_ctr');
  const top20Alerts = alerts.filter(a => a.type === 'top_20_push');
  const riskAlerts = alerts.filter(a => a.type === 'decay');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SEO Monitoring Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Real-time guide performance alerts. Monitoring only—no automatic changes.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Impressions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklySummary?.totalImpressions.toLocaleString() || '—'}</div>
            <p className="mt-1 text-xs text-muted-foreground">7-day total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg CTR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklySummary?.avgCtr.toFixed(2)}%</div>
            <p className="mt-1 text-xs text-muted-foreground">Across all guides</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklySummary?.avgPosition.toFixed(1)}</div>
            <p className="mt-1 text-xs text-muted-foreground">All guides</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{alerts.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">{riskAlerts.length} critical</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('priority')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'priority'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Priority Pages ({priorityScores.slice(0, 10).length})
          </button>
          <button
            onClick={() => setActiveTab('low_ctr')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'low_ctr'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Low CTR ({lowCtrAlerts.length})
          </button>
          <button
            onClick={() => setActiveTab('top_20')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'top_20'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Top 20 Candidates ({top20Alerts.length})
          </button>
          <button
            onClick={() => setActiveTab('risk')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'risk'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Ranking Risk ({riskAlerts.length})
          </button>
          <button
            onClick={() => setActiveTab('unsupported')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'unsupported'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Under-Supported ({unsupportedPages.length})
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'priority' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Top 10 Priority Pages</h2>
          {priorityScores.slice(0, 10).map(score => (
            <Card key={score.slug}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">/guides/{score.slug}</CardTitle>
                    <CardDescription className="text-xs">{score.reason}</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">{score.score}</div>
                    <p className="text-xs text-muted-foreground">Priority</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-5 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Impressions</p>
                    <p className="font-semibold">{score.metrics.impressions7d}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CTR</p>
                    <p className="font-semibold">{score.metrics.ctr7d.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Position</p>
                    <p className="font-semibold">{score.metrics.avgPosition7d.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trend</p>
                    <div className="flex items-center gap-1">
                    {score.metrics.trendDirection === 'up' && <TrendingUp className="h-4 w-4 text-success" />}
                    {score.metrics.trendDirection === 'down' && <TrendingDown className="h-4 w-4 text-destructive" />}
                      <p className="font-semibold">{score.metrics.trendDirection}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Links</p>
                    <p className="font-semibold">{score.metrics.inboundLinks}</p>
                  </div>
                </div>
                {score.alerts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {score.alerts.map((alert, i) => (
                      <Badge key={i} variant={alert.severity === 'critical' ? 'destructive' : 'outline'} className="text-xs">
                        {alert.type.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'low_ctr' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Low CTR Candidates</h2>
          {lowCtrAlerts.length > 0 ? (
            lowCtrAlerts.map((alert, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">/guides/{alert.slug}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{alert.description}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {alert.metrics.impressions && (
                      <div>
                        <p className="text-xs text-muted-foreground">Impressions</p>
                        <p className="font-semibold">{alert.metrics.impressions}</p>
                      </div>
                    )}
                    {alert.metrics.ctr && (
                      <div>
                        <p className="text-xs text-muted-foreground">CTR</p>
                        <p className="font-semibold">{alert.metrics.ctr.toFixed(2)}%</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-primary font-medium">💡 Consider: A/B test SEO title and meta description</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-4 text-center text-muted-foreground">No low CTR alerts</CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'top_20' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Top 20 Push Candidates</h2>
          {top20Alerts.length > 0 ? (
            top20Alerts.map((alert, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">/guides/{alert.slug}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{alert.description}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {alert.metrics.position && (
                      <div>
                        <p className="text-xs text-muted-foreground">Position</p>
                        <p className="font-semibold">{alert.metrics.position.toFixed(1)}</p>
                      </div>
                    )}
                    {alert.metrics.impressions && (
                      <div>
                        <p className="text-xs text-muted-foreground">Impressions</p>
                        <p className="font-semibold">{alert.metrics.impressions}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-success font-medium">💡 Consider: Add 3-5 internal links from authority pages</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-4 text-center text-muted-foreground">No Top 20 candidates</CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Ranking Risk Pages</h2>
          {riskAlerts.length > 0 ? (
            riskAlerts.map((alert, i) => (
              <Card key={i} className="border-destructive/30 bg-destructive/5">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base text-destructive">/guides/{alert.slug}</CardTitle>
                    <Badge variant="destructive" className="text-xs">Critical</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-destructive/80">{alert.description}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {alert.metrics.position && (
                      <div>
                        <p className="text-xs text-destructive/70">Current Position</p>
                        <p className="font-semibold">{alert.metrics.position.toFixed(1)}</p>
                      </div>
                    )}
                    {alert.metrics.positionDelta && (
                      <div>
                        <p className="text-xs text-destructive/70">Drop (7d)</p>
                        <p className="font-semibold text-destructive">{Math.abs(alert.metrics.positionDelta)} places</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-destructive/80 font-medium">⚠️ Action: Investigate changes; review backlinks and content freshness</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-4 text-center text-muted-foreground">No ranking risk alerts</CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'unsupported' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Under-Supported Guides (&lt;3 inbound links)</h2>
          {unsupportedPages.length > 0 ? (
            <div className="space-y-2">
              {unsupportedPages.map(slug => (
                <Card key={slug} className="border-primary/30 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-primary">/guides/{slug}</p>
                        <p className="text-xs text-primary/70">Low internal link support</p>
                      </div>
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-2 text-xs text-primary/70">💡 Consider: Add contextual links from related guides or homepage</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-4 text-center text-muted-foreground">All guides have adequate link support</CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
