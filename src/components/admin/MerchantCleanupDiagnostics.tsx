import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Trash2, Search, ImageIcon, FolderTree, ShieldAlert, RefreshCw,
  Loader2, Copy, Download, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CleanupReport {
  ok: boolean;
  action: string;
  timestamp: string;
  [key: string]: unknown;
}

export function MerchantCleanupDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [showFullReport, setShowFullReport] = useState(false);

  const callCleanup = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    setLoading(true);
    setActiveAction(action);
    setReport(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error('Not authenticated'); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000);

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/merchant-cleanup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({ action, ...extra }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await res.text();
      let data: CleanupReport;
      try { data = JSON.parse(text); } catch {
        toast.error(`Invalid response: ${text.substring(0, 100)}`);
        return;
      }

      setReport(data);
      if (data.ok) {
        toast.success(`${action} completed`);
      } else {
        toast.error((data as any).error || 'Action failed');
      }
    } catch (e) {
      const err = e as Error;
      toast.error(err.name === 'AbortError' ? 'Request timed out' : err.message);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  }, []);

  const copyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('Report copied');
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-${report.action}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('JSON downloaded');
  };

  const isRunning = (action: string) => loading && activeAction === action;

  const ActionButton = ({ action, label, icon: Icon, variant = 'outline', destructive = false, extra = {} }: {
    action: string; label: string; icon: any; variant?: 'outline' | 'default' | 'destructive'; destructive?: boolean; extra?: Record<string, unknown>;
  }) => (
    <Button
      variant={variant}
      size="sm"
      disabled={loading}
      onClick={() => {
        if (destructive && !confirm(`Are you sure you want to run ${label}? This will modify data.`)) return;
        callCleanup(action, extra);
      }}
    >
      {isRunning(action) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Icon className="h-4 w-4 mr-1" />}
      {label}
    </Button>
  );

  // Typed accessors for diagnose report
  const diag = report?.action === 'diagnose' ? report : null;
  const overview = diag?.overview as any;
  const issueBreakdown = diag?.issueBreakdown as any;
  const policyIsolation = diag?.policyIsolation as any;
  const healthReport = diag?.healthReport as any;
  const legacy = diag?.legacy as any;
  const issueGroups = diag?.issueGroups as any[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5" />
          Merchant Cleanup Diagnostics
        </CardTitle>
        <CardDescription>Identify stale items, invalid categories, image issues, and policy blocks in Google Merchant Center</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ActionButton action="diagnose" label="Full Diagnostics" icon={Search} variant="default" />
          <ActionButton action="cleanup_preview" label="Preview Cleanup" icon={Trash2} />
          <ActionButton action="cleanup_run" label="Run Cleanup" icon={Trash2} variant="destructive" destructive />
          <ActionButton action="category_preview" label="Preview Category Repair" icon={FolderTree} />
          <ActionButton action="category_run" label="Run Category Repair" icon={FolderTree} variant="default" destructive />
          <ActionButton action="image_preview" label="Preview Image Repair" icon={ImageIcon} />
          <ActionButton action="image_run" label="Run Image Repair" icon={ImageIcon} variant="default" destructive />
          <Button variant="outline" size="sm" disabled={loading} onClick={() => callCleanup('diagnose')}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh Status
          </Button>
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm">Running {activeAction}…</span>
          </div>
        )}

        {/* Report display */}
        {report && (
          <div className="space-y-4">
            {/* Header + actions */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={report.ok ? 'default' : 'destructive'}>{report.action}</Badge>
                <span className="text-xs text-muted-foreground">{report.timestamp ? new Date(report.timestamp as string).toLocaleString() : ''}</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={copyReport}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
                <Button variant="ghost" size="sm" onClick={downloadJson}><Download className="h-4 w-4 mr-1" /> Download JSON</Button>
              </div>
            </div>

            {/* Error display */}
            {!report.ok && (
              <div className="p-3 bg-destructive/10 rounded-md text-sm flex items-start gap-2">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span>{(report as any).error || 'Unknown error'}</span>
              </div>
            )}

            {/* ── DIAGNOSE report ── */}
            {diag && overview && (
              <>
                {/* Overview counters */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
                  {[
                    { label: 'In Merchant', value: overview.merchantProductCount },
                    { label: 'Local Active', value: overview.localActiveCount },
                    { label: 'Exported', value: overview.localExportedCount },
                    { label: 'With Issues', value: overview.productsWithIssues, color: overview.productsWithIssues > 0 ? 'text-destructive' : '' },
                    { label: 'Issue Groups', value: overview.issueGroupCount },
                  ].map(s => (
                    <div key={s.label} className="p-2 rounded-md bg-muted/50">
                      <p className={`text-xl font-bold ${s.color || ''}`}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Issue Breakdown */}
                {issueBreakdown && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {[
                      { label: 'Account Policy', value: issueBreakdown.policy_account?.count ?? 0, icon: ShieldAlert, color: (issueBreakdown.policy_account?.count ?? 0) > 0 ? 'text-destructive' : '' },
                      { label: 'Product Data', value: issueBreakdown.product_data?.count ?? 0, icon: AlertTriangle },
                      { label: 'Category', value: issueBreakdown.category?.count ?? 0, icon: FolderTree },
                      { label: 'Image', value: issueBreakdown.image?.count ?? 0, icon: ImageIcon },
                      { label: 'Stale/Legacy', value: issueBreakdown.legacy_stale?.staleCount ?? 0, icon: Trash2 },
                    ].map(s => (
                      <div key={s.label} className="p-2 rounded-md border border-border/50 flex items-center gap-2">
                        <s.icon className={`h-4 w-4 shrink-0 ${s.color || 'text-muted-foreground'}`} />
                        <div>
                          <p className={`text-lg font-bold ${s.color || ''}`}>{s.value}</p>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Policy Isolation Banner */}
                {policyIsolation?.accountLevelPolicyIssueDetected && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-destructive" />
                      <span className="font-bold text-destructive">ACCOUNT LEVEL ISSUE</span>
                    </div>
                    <p className="text-muted-foreground">{policyIsolation.policyIssueSummary}</p>
                    <p className="text-xs text-muted-foreground">This is NOT a per-product feed issue. Resolve via Google Merchant Center reconsideration request.</p>
                    {policyIsolation.latestLiveSyncSucceeded && (
                      <div className="flex items-center gap-1 text-xs mt-1">
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span>Latest live sync succeeded — products were accepted by Google API</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Recommendations */}
                {healthReport?.recommendedNextActions?.length > 0 && (
                  <div className="p-3 bg-muted/50 rounded-md space-y-1">
                    <p className="text-sm font-medium">Recommended Actions</p>
                    {healthReport.recommendedNextActions.map((rec: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">{rec}</p>
                    ))}
                  </div>
                )}

                {/* Issue Groups */}
                {issueGroups && issueGroups.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs">
                        <ChevronDown className="h-3 w-3 mr-1" />
                        View {issueGroups.length} Issue Groups
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-1 mt-2">
                        {issueGroups.map((g: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                            <div className="flex items-center gap-2">
                              <Badge variant={g.level === 'policy' ? 'destructive' : g.level === 'image' ? 'secondary' : 'outline'} className="text-[10px]">{g.level}</Badge>
                              <span className="text-muted-foreground truncate max-w-[300px]">{g.description}</span>
                            </div>
                            <span className="font-mono">{g.count}×</span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Legacy Items */}
                {legacy && legacy.staleCount > 0 && (
                  <div className="p-3 bg-amber-500/10 rounded-md text-sm space-y-1">
                    <p className="font-medium text-amber-700 dark:text-amber-400">🗑️ {legacy.staleCount} stale Merchant items</p>
                    <p className="text-xs text-muted-foreground">
                      Items with getpawsy_ prefix no longer in current export.
                      {legacy.nonPrefixCount > 0 && ` Plus ${legacy.nonPrefixCount} non-prefixed items.`}
                    </p>
                    {legacy.staleOfferIds?.length > 0 && (
                      <p className="text-xs font-mono text-muted-foreground mt-1 break-all">
                        Sample: {legacy.staleOfferIds.slice(0, 5).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── CLEANUP report ── */}
            {(report.action === 'cleanup_preview' || report.action === 'cleanup_run') && report.ok && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Stale Found', value: (report as any).staleCount },
                    { label: 'To Delete', value: (report as any).toDeleteCount },
                    { label: 'Deleted', value: (report as any).deletedCount },
                    { label: 'Errors', value: (report as any).deleteErrors, color: (report as any).deleteErrors > 0 ? 'text-destructive' : '' },
                  ].map(s => (
                    <div key={s.label} className="p-2 rounded-md bg-muted/50">
                      <p className={`text-xl font-bold ${s.color || ''}`}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {(report as any).preview && <Badge variant="outline" className="text-xs">🔍 Preview — no deletions performed</Badge>}
                {(report as any).remainingStale > 0 && (
                  <p className="text-xs text-muted-foreground">⚠️ {(report as any).remainingStale} stale items remaining (capped at max per run)</p>
                )}
              </div>
            )}

            {/* ── CATEGORY report ── */}
            {(report.action === 'category_preview' || report.action === 'category_run') && report.ok && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Invalid Categories', value: (report as any).invalidCategoryCount },
                    { label: 'Corrected', value: (report as any).correctedCategoryCount },
                    { label: 'Omitted', value: (report as any).omittedCategoryCount },
                  ].map(s => (
                    <div key={s.label} className="p-2 rounded-md bg-muted/50">
                      <p className="text-xl font-bold">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {(report as any).preview && <Badge variant="outline" className="text-xs">🔍 Preview — no changes applied</Badge>}
                {(report as any).sampleInvalidProducts?.length > 0 && (
                  <div className="space-y-1 mt-2">
                    <p className="text-xs font-medium">Sample Invalid Products</p>
                    {(report as any).sampleInvalidProducts.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="text-xs p-2 bg-muted/30 rounded font-mono">
                        {p.name} — category: {p.currentCategory} → {p.action}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── IMAGE report ── */}
            {(report.action === 'image_preview' || report.action === 'image_run') && report.ok && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Image Issues', value: (report as any).imageIssueCount },
                    { label: 'Fixed', value: (report as any).fixedImageCount },
                    { label: 'Addl Removed', value: (report as any).removedAdditionalImagesCount },
                    { label: 'Remaining', value: (report as any).imageFailuresRemaining },
                  ].map(s => (
                    <div key={s.label} className="p-2 rounded-md bg-muted/50">
                      <p className="text-xl font-bold">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {(report as any).preview && <Badge variant="outline" className="text-xs">🔍 Preview — no changes applied</Badge>}
                {(report as any).samples?.length > 0 && (
                  <div className="space-y-1 mt-2">
                    <p className="text-xs font-medium">Sample Image Issues</p>
                    {(report as any).samples.slice(0, 5).map((s: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-muted/30 rounded font-mono break-all">
                        {s.name} — {s.field}: {s.issue} → {s.action}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Full JSON toggle */}
            <Collapsible open={showFullReport} onOpenChange={setShowFullReport}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  {showFullReport ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                  {showFullReport ? 'Hide' : 'View'} Full Response
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto max-h-[400px] overflow-y-auto font-mono whitespace-pre-wrap mt-2">
                  {JSON.stringify(report, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
