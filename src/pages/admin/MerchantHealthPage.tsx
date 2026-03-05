import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  CheckCircle, XCircle, Loader2, RefreshCw, ShieldCheck, AlertTriangle,
  Globe, Image, Tag, Truck, FileText, Scale, AlertOctagon, Wrench, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { Helmet } from 'react-helmet-async';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  detail: string;
  productId?: string;
  productSlug?: string;
  autoFixable: boolean;
  fixed?: boolean;
  fixAction?: string;
}

interface ScanResult {
  ok: boolean;
  ts: string;
  score: number;
  merchantReviewReady: boolean;
  findings: Finding[];
  summary: {
    totalProducts: number;
    eligibleForExport: number;
    excludedFromExport: number;
    brokenLandingPages: number;
    imageIssues: number;
    weightOutliers: number;
    missingCategories: number;
    cloudinaryRewrites: number;
    fixesApplied: number;
  };
  exportEligibility: Array<{
    id: string;
    slug: string;
    eligible: boolean;
    reasons: string[];
  }>;
}

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-500', text: 'text-red-700 dark:text-red-400', icon: AlertOctagon, label: 'CRITICAL' },
  high:     { color: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400', icon: AlertTriangle, label: 'HIGH' },
  medium:   { color: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', icon: AlertTriangle, label: 'MEDIUM' },
  low:      { color: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', icon: FileText, label: 'LOW' },
};

function SeverityBadge({ severity }: { severity: Finding['severity'] }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <Badge variant="outline" className={`${cfg.text} border-current text-xs font-bold`}>
      {cfg.label}
    </Badge>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" stroke="currentColor" className="text-muted/20" strokeWidth="8" fill="none" />
        <circle cx="50" cy="50" r="45" stroke="currentColor" className={color} strokeWidth="8" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export default function MerchantHealthPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/merchant-self-heal`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ dryRun }),
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Scan failed');
      setResult(json);
      setLastRun(json.ts);
      console.log('[MerchantHealth] Scan result:', json);
      toast.success(json.merchantReviewReady ? 'All checks passed — Merchant Review Ready' : `${json.findings.length} issues detected`);
    } catch (e: any) {
      toast.error(e.message);
      console.error('[MerchantHealth] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Load last scan from logs
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cron_job_logs')
        .select('details, completed_at')
        .eq('job_name', 'merchant-self-heal')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.details) {
        setResult(data.details as unknown as ScanResult);
        setLastRun(data.completed_at);
      }
    })();
  }, []);

  const groupedFindings = result?.findings.reduce((acc, f) => {
    (acc[f.category] = acc[f.category] || []).push(f);
    return acc;
  }, {} as Record<string, Finding[]>) || {};

  const downloadReport = () => {
    if (!result) return;
    const lines = [
      'MERCHANT CENTER SELF-HEALING REPORT',
      `Generated: ${result.ts}`,
      `Score: ${result.score}/100`,
      `Review Ready: ${result.merchantReviewReady ? 'YES' : 'NO'}`,
      '',
      'SUMMARY',
      `Total Products: ${result.summary.totalProducts}`,
      `Eligible for Export: ${result.summary.eligibleForExport}`,
      `Excluded: ${result.summary.excludedFromExport}`,
      `Broken Landing Pages: ${result.summary.brokenLandingPages}`,
      `Image Issues: ${result.summary.imageIssues}`,
      `Weight Outliers: ${result.summary.weightOutliers}`,
      `Missing Categories: ${result.summary.missingCategories}`,
      `Cloudinary Rewrites: ${result.summary.cloudinaryRewrites}`,
      `Fixes Applied: ${result.summary.fixesApplied}`,
      '',
      'FINDINGS',
      ...result.findings.map(f =>
        `[${f.severity.toUpperCase()}] ${f.title}\n  ${f.detail}${f.fixed ? `\n  ✅ Fixed: ${f.fixAction}` : ''}`
      ),
      '',
      'EXCLUDED PRODUCTS',
      ...(result.exportEligibility || []).map(e =>
        `  ${e.slug}: ${e.reasons.join(', ')}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-health-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Merchant Center Self-Healing Engine
          </h1>
          <p className="text-muted-foreground text-sm">
            Continuous compliance monitoring & auto-repair
            {lastRun && <span className="ml-2 text-xs opacity-70">Last: {new Date(lastRun).toLocaleString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
            <Label htmlFor="dry-run" className="text-sm cursor-pointer">
              {dryRun ? '🔍 Dry Run' : '🔧 Apply Fixes'}
            </Label>
          </div>
          <Button onClick={runScan} disabled={loading} variant={dryRun ? 'default' : 'destructive'}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {dryRun ? 'Run Scan' : 'Scan & Fix'}
          </Button>
        </div>
      </div>

      {!dryRun && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>Apply Fixes mode active.</strong> Safe auto-fixes will be applied: exclusion of broken products, Cloudinary image rewrites, category fallbacks, weight normalization.</span>
        </div>
      )}

      {result && (
        <>
          {/* Score + Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardContent className="pt-6">
                <ScoreRing score={result.score} />
                <div className="text-center mt-3">
                  <Badge variant={result.merchantReviewReady ? 'default' : 'destructive'} className="text-sm">
                    {result.merchantReviewReady ? '✅ Merchant Review Ready' : '❌ Not Ready'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Export Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {[
                    { label: 'Total Products', value: result.summary.totalProducts, icon: Tag },
                    { label: 'Export Eligible', value: result.summary.eligibleForExport, icon: CheckCircle },
                    { label: 'Excluded', value: result.summary.excludedFromExport, icon: XCircle },
                    { label: 'Fixes Applied', value: result.summary.fixesApplied, icon: Wrench },
                  ].map(m => (
                    <div key={m.label} className="p-2 rounded-lg bg-muted/50">
                      <m.icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{m.value}</div>
                      <div className="text-xs text-muted-foreground">{m.label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Issue counts by severity */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
              const count = result.findings.filter(f => f.severity === sev).length;
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <Card key={sev} className={count > 0 ? 'border-current' : ''} style={count > 0 ? { borderColor: 'hsl(var(--destructive))' } : {}}>
                  <CardContent className="pt-4 text-center">
                    <div className={`text-2xl font-bold ${count > 0 ? cfg.text : 'text-muted-foreground'}`}>{count}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">{cfg.label}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed scan results */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" /> Landing Pages</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusLine ok={result.summary.brokenLandingPages === 0} label={`${result.summary.brokenLandingPages} broken pages`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Image className="w-4 h-4" /> Image Health</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusLine ok={result.summary.imageIssues === 0} label={`${result.summary.imageIssues} image issues`} />
                <StatusLine ok={true} label={`${result.summary.cloudinaryRewrites} Cloudinary rewrites`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Scale className="w-4 h-4" /> Weight & Attributes</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusLine ok={result.summary.weightOutliers === 0} label={`${result.summary.weightOutliers} weight outliers`} />
                <StatusLine ok={result.summary.missingCategories === 0} label={`${result.summary.missingCategories} missing categories`} />
              </CardContent>
            </Card>
          </div>

          {/* Findings accordion */}
          {Object.keys(groupedFindings).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" /> All Findings ({result.findings.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={downloadReport}>
                    <Download className="w-3 h-3 mr-1.5" />
                    Export Report
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {Object.entries(groupedFindings).map(([cat, items]) => (
                    <AccordionItem key={cat} value={cat}>
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          {cat.replace(/_/g, ' ')}
                          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {items.map(f => (
                            <div key={f.id} className="flex items-start gap-3 p-2 rounded bg-muted/30 text-sm">
                              <SeverityBadge severity={f.severity} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{f.title}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{f.detail}</div>
                                {f.fixed && (
                                  <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> {f.fixAction}
                                  </div>
                                )}
                              </div>
                              {f.autoFixable && !f.fixed && (
                                <Badge variant="outline" className="text-xs shrink-0">Auto-fixable</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Excluded products */}
          {(result.exportEligibility || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" /> Excluded from Export ({result.exportEligibility.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {result.exportEligibility.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <code className="text-xs truncate max-w-[60%]">/product/{e.slug}</code>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {e.reasons.map(r => (
                          <Badge key={r} variant="destructive" className="text-[10px]">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Merchant Center Self-Healing Engine</p>
          <p className="text-sm mt-1">Click "Run Scan" to audit your store for compliance issues.</p>
        </div>
      )}
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
      <span className="text-sm">{label}</span>
    </div>
  );
}
