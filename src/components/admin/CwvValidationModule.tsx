import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw,
  ExternalLink, Download, ClipboardCheck, Shield, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────

interface VitalRow {
  id: string;
  ts: string;
  path: string;
  device_hint: string | null;
  lcp_value: number | null;
  lcp_element: string | null;
  cls_value: number | null;
  inp_value: number | null;
  inp_event: string | null;
  fcp_value: number | null;
  ttfb_value: number | null;
}

interface ValidationEvent {
  id: string;
  ts: string;
  event_type: string;
  notes: string | null;
}

type CwvStatus =
  | 'collecting'
  | 'improving'
  | 'likely_fixed'
  | 'ready_to_validate'
  | 'validation_in_progress'
  | 'validated_monitoring'
  | 'regressed';

// ── Helpers ────────────────────────────────────────────

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMs(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}ms`;
}
function formatCls(v: number | null): string {
  return v === null ? '—' : v.toFixed(3);
}

function ratingClass(metric: string, value: number | null): string {
  if (value === null) return 'text-muted-foreground';
  const t: Record<string, [number, number]> = {
    lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500],
  };
  const th = t[metric];
  if (!th) return 'text-muted-foreground';
  if (value <= th[0]) return 'text-green-600';
  if (value <= th[1]) return 'text-yellow-600';
  return 'text-red-600';
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function filterByDays(rows: VitalRow[], days: number): VitalRow[] {
  const cutoff = daysAgo(days).toISOString();
  return rows.filter(r => r.ts >= cutoff);
}

function mobileOnly(rows: VitalRow[]): VitalRow[] {
  return rows.filter(r => r.device_hint === 'mobile');
}

function extract(rows: VitalRow[], key: 'lcp_value' | 'cls_value' | 'inp_value'): number[] {
  return rows.map(r => r[key]).filter((v): v is number => v !== null);
}

// ── Rules Engine ───────────────────────────────────────

interface RuleResult {
  label: string;
  passed: boolean;
  detail: string;
}

function evaluateRules(
  mobile7d: VitalRow[],
  mobile3d: VitalRow[],
  minSampleSize: number,
): { rules: RuleResult[]; allPassed: boolean; likelyFixed: boolean } {
  const lcp7 = extract(mobile7d, 'lcp_value');
  const cls7 = extract(mobile7d, 'cls_value');
  const inp7 = extract(mobile7d, 'inp_value');
  const lcp3 = extract(mobile3d, 'lcp_value');

  const p75Lcp7 = percentile(lcp7, 75);
  const p75Cls7 = percentile(cls7, 75);
  const p75Inp7 = percentile(inp7, 75);
  const p75Lcp3 = percentile(lcp3, 75);

  const n7 = mobile7d.length;

  const lcpOk = p75Lcp7 !== null && p75Lcp7 <= 2500;
  const clsOk = p75Cls7 !== null && p75Cls7 < 0.1;
  const inpOk = p75Inp7 !== null && (p75Inp7 <= 200 || p75Inp7 <= 250);
  const sampleOk = n7 >= minSampleSize;

  // Regression check: last 3d p75 LCP not >10% worse than 7d
  let noRegression = true;
  let regressionDetail = 'No regression';
  if (p75Lcp7 !== null && p75Lcp3 !== null) {
    const threshold = p75Lcp7 * 1.1;
    noRegression = p75Lcp3 <= threshold;
    regressionDetail = noRegression
      ? `3d p75 (${formatMs(p75Lcp3)}) ≤ 110% of 7d p75 (${formatMs(p75Lcp7)})`
      : `3d p75 (${formatMs(p75Lcp3)}) > 110% of 7d p75 (${formatMs(p75Lcp7)}) ⚠️`;
  }

  const rules: RuleResult[] = [
    {
      label: 'p75 LCP ≤ 2500ms (7d)',
      passed: lcpOk,
      detail: `p75 = ${formatMs(p75Lcp7)} (n=${lcp7.length})`,
    },
    {
      label: 'p75 CLS < 0.10 (7d)',
      passed: clsOk,
      detail: `p75 = ${formatCls(p75Cls7)} (n=${cls7.length})`,
    },
    {
      label: 'p75 INP ≤ 200ms (7d)',
      passed: inpOk,
      detail: `p75 = ${formatMs(p75Inp7)}${p75Inp7 !== null && p75Inp7 > 200 && p75Inp7 <= 250 ? ' (≤250 trending down)' : ''} (n=${inp7.length})`,
    },
    {
      label: `Sample size ≥ ${minSampleSize} sessions (7d)`,
      passed: sampleOk,
      detail: `n = ${n7}`,
    },
    {
      label: 'No LCP regression (3d vs 7d)',
      passed: noRegression,
      detail: regressionDetail,
    },
  ];

  const allPassed = rules.every(r => r.passed);

  // likely_fixed: thresholds met for 3d but sample might be low
  const lcp3ok = p75Lcp3 !== null && p75Lcp3 <= 2500;
  const cls3 = percentile(extract(mobile3d, 'cls_value'), 75);
  const inp3 = percentile(extract(mobile3d, 'inp_value'), 75);
  const cls3ok = cls3 !== null && cls3 < 0.1;
  const inp3ok = inp3 !== null && inp3 <= 250;
  const likelyFixed = !allPassed && lcp3ok && cls3ok && inp3ok;

  return { rules, allPassed, likelyFixed };
}

// ── Monitoring regression check ──────────────────────

function checkMonitoringRegression(mobile7d: VitalRow[]): string | null {
  const p75Lcp = percentile(extract(mobile7d, 'lcp_value'), 75);
  const p75Cls = percentile(extract(mobile7d, 'cls_value'), 75);
  const p75Inp = percentile(extract(mobile7d, 'inp_value'), 75);
  const warnings: string[] = [];
  if (p75Lcp !== null && p75Lcp > 2700) warnings.push(`LCP p75 = ${formatMs(p75Lcp)} > 2700ms`);
  if (p75Cls !== null && p75Cls >= 0.12) warnings.push(`CLS p75 = ${formatCls(p75Cls)} ≥ 0.12`);
  if (p75Inp !== null && p75Inp > 250) warnings.push(`INP p75 = ${formatMs(p75Inp)} > 250ms`);
  return warnings.length > 0 ? warnings.join('; ') : null;
}

// ── Status badge rendering ───────────────────────────

const STATUS_CONFIG: Record<CwvStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  collecting: { label: 'Collecting data', color: 'bg-muted text-muted-foreground', icon: Loader2 },
  improving: { label: 'Improving', color: 'bg-yellow-100 text-yellow-800', icon: TrendingUp },
  likely_fixed: { label: 'Likely fixed', color: 'bg-blue-100 text-blue-800', icon: Shield },
  ready_to_validate: { label: 'Ready to validate', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  validation_in_progress: { label: 'Validation in progress', color: 'bg-purple-100 text-purple-800', icon: ClipboardCheck },
  validated_monitoring: { label: 'Validated (monitoring)', color: 'bg-green-200 text-green-900', icon: Shield },
  regressed: { label: 'Regressed ⚠️', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

// ── Search Console deep links ─────────────────────────

const GSC_PROPERTY = 'https%3A%2F%2Fgetpawsy.pet';
const GSC_LINKS = [
  { label: 'Core Web Vitals', url: `https://search.google.com/search-console/core-web-vitals?resource_id=${GSC_PROPERTY}` },
  { label: 'Page Experience', url: `https://search.google.com/search-console/page-experience?resource_id=${GSC_PROPERTY}` },
  { label: 'Sitemaps', url: `https://search.google.com/search-console/sitemaps?resource_id=${GSC_PROPERTY}` },
];

// ── Component ─────────────────────────────────────────

export default function CwvValidationModule() {
  const [rows, setRows] = useState<VitalRow[]>([]);
  const [events, setEvents] = useState<ValidationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const MIN_SAMPLE = 50; // conservative for smaller sites

  const loadData = useCallback(async () => {
    setLoading(true);
    const cutoff28d = daysAgo(28).toISOString();
    const [vitalsRes, eventsRes] = await Promise.all([
      supabase
        .from('web_vitals')
        .select('id, ts, path, device_hint, lcp_value, lcp_element, cls_value, inp_value, inp_event, fcp_value, ttfb_value')
        .gte('ts', cutoff28d)
        .order('ts', { ascending: false })
        .limit(1000),
      supabase
        .from('cwv_validation_events')
        .select('id, ts, event_type, notes')
        .order('ts', { ascending: false })
        .limit(20),
    ]);
    setRows((vitalsRes.data as VitalRow[]) || []);
    setEvents((eventsRes.data as ValidationEvent[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Compute aggregates ──

  const mobile28d = mobileOnly(rows);
  const mobile7d = filterByDays(mobile28d, 7);
  const mobile3d = filterByDays(mobile28d, 3);

  const { rules, allPassed, likelyFixed } = evaluateRules(mobile7d, mobile3d, MIN_SAMPLE);

  // ── Determine current status ──

  const lastEvent = events[0];
  const isInValidation = lastEvent?.event_type === 'user_started_validation' || lastEvent?.event_type === 'monitoring';
  const isConfirmedValidated = lastEvent?.event_type === 'user_confirmed_validated';

  let status: CwvStatus;
  if (isConfirmedValidated) {
    const regressionWarning = checkMonitoringRegression(mobile7d);
    status = regressionWarning ? 'regressed' : 'validated_monitoring';
  } else if (isInValidation) {
    const regressionWarning = checkMonitoringRegression(mobile7d);
    status = regressionWarning ? 'regressed' : 'validation_in_progress';
  } else if (allPassed) {
    status = 'ready_to_validate';
  } else if (likelyFixed) {
    status = 'likely_fixed';
  } else if (mobile7d.length > 0) {
    status = 'improving';
  } else {
    status = 'collecting';
  }

  const regressionWarning = (status === 'validation_in_progress' || status === 'validated_monitoring' || status === 'regressed')
    ? checkMonitoringRegression(mobile7d)
    : null;

  const StatusIcon = STATUS_CONFIG[status].icon;

  // ── Top LCP elements ──

  const lcpElements: Record<string, number> = {};
  mobile7d.forEach(r => {
    if (r.lcp_element) lcpElements[r.lcp_element] = (lcpElements[r.lcp_element] || 0) + 1;
  });
  const topLcpElements = Object.entries(lcpElements).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // ── Evidence table (7d vs 28d) ──

  const evidenceMetrics = [
    { key: 'lcp', label: 'LCP', field: 'lcp_value' as const, format: formatMs },
    { key: 'cls', label: 'CLS', field: 'cls_value' as const, format: formatCls },
    { key: 'inp', label: 'INP', field: 'inp_value' as const, format: formatMs },
  ];

  // ── Actions ──

  const logEvent = async (type: string, notes?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cwv_validation_events').insert({
      event_type: type,
      notes: notes || null,
      created_by: user?.id || null,
    });
    toast.success(`Validation event logged: ${type}`);
    loadData();
  };

  const handleStartValidation = () => {
    logEvent('user_started_validation', 'Admin clicked "I clicked Validate Fix in Search Console"');
  };

  const handleConfirmValidated = () => {
    logEvent('user_confirmed_validated', 'Admin confirmed Search Console accepted the fix');
  };

  const exportEvidence = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/export-cwv-evidence`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `cwv-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Evidence exported!');
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    }
    setExporting(false);
  };

  // ── Render ──

  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" />
          CWV Validation (Mobile)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_CONFIG[status].color} gap-1`}>
            <StatusIcon className="h-3 w-3" />
            {STATUS_CONFIG[status].label}
          </Badge>
          <Button size="sm" variant="ghost" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ── Regression Warning ── */}
            {regressionWarning && (
              <div className="bg-destructive/10 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Regression Detected</p>
                  <p className="text-xs text-destructive">{regressionWarning}</p>
                </div>
              </div>
            )}

            {/* ── Rules Checklist ── */}
            <div>
              <p className="text-sm font-medium mb-2">Validation Rules (deterministic)</p>
              <div className="space-y-1.5">
                {rules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {rule.passed ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-medium">{rule.label}</span>
                      <span className="text-muted-foreground ml-2">{rule.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Min sample threshold: {MIN_SAMPLE} sessions. Using conservative threshold for smaller sites.
              </p>
            </div>

            {/* ── Evidence Panel (7d vs 28d) ── */}
            <div>
              <p className="text-sm font-medium mb-2">Evidence (Mobile p75)</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Metric</th>
                      <th className="text-right p-2">Last 7d</th>
                      <th className="text-right p-2">Last 28d</th>
                      <th className="text-right p-2">n (7d)</th>
                      <th className="text-right p-2">n (28d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidenceMetrics.map(m => {
                      const v7 = extract(mobile7d, m.field);
                      const v28 = extract(mobile28d, m.field);
                      const p75_7 = percentile(v7, 75);
                      const p75_28 = percentile(v28, 75);
                      return (
                        <tr key={m.key} className="border-b last:border-0">
                          <td className="p-2 font-medium">{m.label}</td>
                          <td className={`p-2 text-right font-mono ${ratingClass(m.key, p75_7)}`}>
                            {m.format(p75_7)}
                          </td>
                          <td className={`p-2 text-right font-mono ${ratingClass(m.key, p75_28)}`}>
                            {m.format(p75_28)}
                          </td>
                          <td className="p-2 text-right text-muted-foreground">{v7.length}</td>
                          <td className="p-2 text-right text-muted-foreground">{v28.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Top LCP Elements ── */}
            {topLcpElements.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Top LCP Elements (7d, by frequency)</p>
                <div className="space-y-1">
                  {topLcpElements.map(([el, count], i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[10px]">#{i + 1}</Badge>
                      <code className="break-all text-muted-foreground">{el}</code>
                      <span className="text-muted-foreground shrink-0">({count}x)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Manual Checklist ── */}
            <div>
              <p className="text-sm font-medium mb-2">Pre-validation Checklist</p>
              <div className="space-y-1 text-xs">
                {[
                  'Homepage loads in incognito (no white screen)',
                  'LCP hero loads without lazy (fetchpriority="high")',
                  'No CLS jumps from cookie/banner',
                  'www→apex is 301 (check WWW Redirect above)',
                  'sitemap.xml + robots.txt reachable (200)',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-4 h-4 border rounded flex items-center justify-center text-[10px] shrink-0">☐</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Search Console Deep Links ── */}
            <div>
              <p className="text-sm font-medium mb-2">Search Console</p>
              <div className="flex flex-wrap gap-2">
                {GSC_LINKS.map(link => (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                      <ExternalLink className="h-3 w-3" />
                      {link.label}
                    </Button>
                  </a>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Click "Mobile" issue → "Validate Fix". Property: getpawsy.pet
              </p>
            </div>

            {/* ── Action Buttons ── */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {status === 'ready_to_validate' && (
                <Button size="sm" onClick={handleStartValidation} className="gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  I clicked "Validate Fix" in Search Console
                </Button>
              )}
              {status === 'validation_in_progress' && (
                <Button size="sm" variant="outline" onClick={handleConfirmValidated} className="gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Search Console accepted the fix
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={exportEvidence} disabled={exporting} className="gap-1.5">
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Export Evidence
              </Button>
            </div>

            {/* ── Validation Log ── */}
            {events.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Validation Log</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {events.map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-xs border-b border-border/50 py-1">
                      <span className="text-muted-foreground">
                        {new Date(e.ts).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{e.event_type}</Badge>
                      {e.notes && <span className="text-muted-foreground truncate">{e.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
