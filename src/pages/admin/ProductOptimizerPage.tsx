import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, Search, Zap, Tag, BarChart3,
  CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Eye, Sparkles, Shield, ArrowRight, Lock, Unlock,
  RotateCcw, History, Download, ShoppingCart, FileText,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ── Types ──
interface ProductItem {
  id: string; name: string; slug: string; sku?: string; category?: string;
  product_type?: string; google_product_category?: string; price?: number;
  stock?: number; is_active?: boolean; image_url?: string;
  primary_species?: string; animal_type?: string;
  shopping_title?: string; short_title?: string;
  meta_title?: string; meta_description?: string;
  ai_locked?: boolean; ai_manual_override?: boolean;
  quality_score: number; quality_label: string;
  shopping_priority?: number; content_readiness?: number; feed_readiness?: number;
  confidence_tier?: string;
  scores?: any; flags: string[];
  originalTitle?: string; optimizedTitle?: string; shortTitle?: string;
  titleChars?: number; usedAI?: boolean; usedFallback?: boolean;
  originalDescription?: string; optimizedDescription?: string; bullets?: string[];
  seoTitle?: string; seoMetaDescription?: string; seoKeywords?: string[];
  suggestedProductType?: string; googleCategory?: string;
  animal?: string; keyFeature?: string; primaryKeyword?: string;
  benefitAngle?: string; conversionAngle?: string;
  keywordCluster?: string; customLabels?: any;
  ok?: boolean; error?: string; applied?: boolean;
  benefit_angle?: string; conversion_angle?: string;
  custom_label_0?: string; custom_label_1?: string;
  custom_label_2?: string; custom_label_3?: string; custom_label_4?: string;
}

interface RunRecord {
  id: string; mode: string; total_products: number;
  success_count: number; error_count: number; fallback_count: number;
  started_at: string; completed_at?: string; version?: string; config?: any;
}

type OptMode = 'titles' | 'short_titles' | 'descriptions' | 'metadata' | 'feed' | 'all';
type Filter = 'all' | 'active' | 'draft' | 'in_stock' | 'out_of_stock' | 'missing_product_type' | 'missing_google_category' | 'low_quality' | 'locked' | 'manual_override';

// Recovery-specific types
interface RecoveryItem extends ProductItem {
  dropshipRisk?: number;
  dropshipLevel?: string;
  dropshipSignals?: string[];
}

// ── API Helper ──
async function callPipeline(action: string, body: any = {}): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not authenticated. Please log in.');
  const res = await fetch(
    `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/product-optimizer-pipeline`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    }
  );
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`Invalid response: ${text.slice(0, 200)}`); }
  if (!res.ok || !data.success) throw new Error(data.error || data.details || `HTTP ${res.status}`);
  return data;
}

// ── Components ──
function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color = score >= 80 ? 'text-green-600 bg-green-50 border-green-200'
    : score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : score >= 40 ? 'text-orange-600 bg-orange-50 border-orange-200'
    : 'text-red-600 bg-red-50 border-red-200';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>{score}{label && <span className="font-normal">· {label}</span>}</span>;
}

function SummaryCard({ label, value, suffix, variant }: { label: string; value: number | string; suffix?: string; variant?: 'success' | 'warning' | 'danger' | 'info' }) {
  const colors = {
    success: 'bg-green-50 border-green-200 text-green-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    danger: 'bg-red-50 border-red-200 text-red-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  const cls = variant ? colors[variant] : 'bg-muted border-border text-foreground';
  return (
    <div className={`p-2 rounded border text-center ${cls}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}{suffix || ''}</p>
    </div>
  );
}

function FlagBadge({ flag }: { flag: string }) {
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">{flag.replace(/_/g, ' ')}</Badge>;
}

// ── Main Page ──
export default function ProductOptimizerPage() {
  const [tab, setTab] = useState('audit');

  // Audit
  const [auditItems, setAuditItems] = useState<ProductItem[]>([]);
  const [auditSummary, setAuditSummary] = useState<any>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');

  // Optimize
  const [optMode, setOptMode] = useState<OptMode>('all');
  const [optItems, setOptItems] = useState<ProductItem[]>([]);
  const [optSummary, setOptSummary] = useState<any>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optDryRun, setOptDryRun] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyLoading, setApplyLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  // Scoring
  const [rescoreLoading, setRescoreLoading] = useState(false);

  // History
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Rollback
  const [rollbackLoading, setRollbackLoading] = useState(false);

  // Recovery
  const [recoveryItems, setRecoveryItems] = useState<RecoveryItem[]>([]);
  const [recoverySummary, setRecoverySummary] = useState<any>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryDryRun, setRecoveryDryRun] = useState(true);
  const [recoverySelected, setRecoverySelected] = useState<Set<string>>(new Set());
  const [recoveryApplyLoading, setRecoveryApplyLoading] = useState(false);
  const [recoveryExpandedId, setRecoveryExpandedId] = useState<string | null>(null);

  // ── Audit ──
  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await callPipeline('audit', { filter, search, limit: 50 });
      setAuditItems(data.items || []);
      setAuditSummary(data.summary || null);
      setAuditTotal(data.totalCount || 0);
      toast.success(`Audited ${data.returnedCount} products (${data.totalCount} total)`);
    } catch (err: any) { toast.error(err.message); }
    finally { setAuditLoading(false); }
  }, [filter, search]);

  // ── Optimize ──
  const runOptimize = useCallback(async (ids?: string[]) => {
    setOptLoading(true); setOptItems([]); setOptSummary(null);
    try {
      const body: any = { mode: optMode, dryRun: optDryRun, limit: 20 };
      if (ids?.length) body.ids = ids;
      const data = await callPipeline('optimize', body);
      setOptItems(data.items || []);
      setOptSummary(data.summary || null);
      if (data.runId) setLastRunId(data.runId);
      toast.success(optDryRun ? `Preview: ${data.summary?.optimized || 0} optimized` : `Applied: ${data.summary?.updated || 0} updated`);
    } catch (err: any) { toast.error(err.message); }
    finally { setOptLoading(false); }
  }, [optMode, optDryRun]);

  // ── Batch Apply ──
  const applySelected = useCallback(async () => {
    if (selected.size === 0) { toast.error('No products selected'); return; }
    if (!confirm(`Apply optimizations to ${selected.size} products?`)) return;
    setApplyLoading(true);
    try {
      const updates = optItems.filter(i => selected.has(i.id) && i.ok).map(i => {
        const fields: any = {};
        if (i.optimizedTitle) fields.shopping_title = i.optimizedTitle;
        if (i.shortTitle) fields.short_title = i.shortTitle;
        if (i.optimizedDescription) fields.optimized_description = i.optimizedDescription;
        if (i.bullets?.length) fields.description_bullets = i.bullets;
        if (i.seoTitle) { fields.seo_title = i.seoTitle; fields.meta_title = i.seoTitle; }
        if (i.seoMetaDescription) { fields.seo_meta_description = i.seoMetaDescription; fields.meta_description = i.seoMetaDescription; }
        if (i.seoKeywords?.length) fields.seo_keywords = i.seoKeywords;
        if (i.suggestedProductType) fields.product_type = i.suggestedProductType;
        if (i.googleCategory) fields.google_product_category = i.googleCategory;
        if (i.animal) fields.animal_type = i.animal;
        if (i.keyFeature) fields.key_feature = i.keyFeature;
        if (i.primaryKeyword) fields.primary_keyword = i.primaryKeyword;
        if (i.benefitAngle) fields.benefit_angle = i.benefitAngle;
        if (i.conversionAngle) fields.conversion_angle = i.conversionAngle;
        if (i.keywordCluster) fields.keyword_cluster = i.keywordCluster;
        if (i.customLabels) {
          fields.custom_label_0 = i.customLabels.l0;
          fields.custom_label_1 = i.customLabels.l1;
          fields.custom_label_2 = i.customLabels.l2;
          fields.custom_label_3 = i.customLabels.l3;
          fields.custom_label_4 = i.customLabels.l4;
        }
        fields.quality_score = i.quality_score;
        fields.quality_flags = i.flags;
        fields.shopping_priority_score = i.shopping_priority;
        fields.content_readiness_score = i.content_readiness;
        fields.feed_readiness_score = i.feed_readiness;
        return { id: i.id, fields };
      }).filter(u => Object.keys(u.fields).length > 0);

      if (!updates.length) { toast.error('No applicable changes'); setApplyLoading(false); return; }
      const data = await callPipeline('apply', { updates });
      toast.success(`Applied ${data.applied} updates (${data.errors} errors)`);
      setSelected(new Set());
    } catch (err: any) { toast.error(err.message); }
    finally { setApplyLoading(false); }
  }, [selected, optItems]);

  // ── Rescore ──
  const runRescore = useCallback(async () => {
    setRescoreLoading(true);
    try {
      const data = await callPipeline('rescore', { limit: 200 });
      toast.success(`Rescored ${data.rescored} products (${data.errors} errors)`);
    } catch (err: any) { toast.error(err.message); }
    finally { setRescoreLoading(false); }
  }, []);

  // ── History ──
  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await callPipeline('runs', { limit: 20 });
      setRuns(data.runs || []);
    } catch (err: any) { toast.error(err.message); }
    finally { setRunsLoading(false); }
  }, []);

  // ── Rollback ──
  const rollbackRun = useCallback(async (runId: string) => {
    if (!confirm('Rollback this run? This will restore previous values.')) return;
    setRollbackLoading(true);
    try {
      const data = await callPipeline('rollback', { runId });
      toast.success(`Rolled back ${data.rolled_back} products`);
      loadRuns();
    } catch (err: any) { toast.error(err.message); }
    finally { setRollbackLoading(false); }
  }, [loadRuns]);

  // ── Lock/Unlock ──
  const lockProducts = useCallback(async (ids: string[], lock: boolean) => {
    try {
      await callPipeline(lock ? 'lock' : 'unlock', { ids });
      toast.success(`${lock ? 'Locked' : 'Unlocked'} ${ids.length} products`);
      runAudit();
    } catch (err: any) { toast.error(err.message); }
  }, [runAudit]);

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected(new Set(optItems.filter(i => i.ok).map(i => i.id)));

  // ── Merchant Recovery ──
  const runRecovery = useCallback(async (ids?: string[]) => {
    setRecoveryLoading(true); setRecoveryItems([]); setRecoverySummary(null);
    try {
      const body: any = { dryRun: recoveryDryRun, limit: 20 };
      if (ids?.length) body.ids = ids;
      const data = await callPipeline('merchant-recovery', body);
      setRecoveryItems(data.items || []);
      setRecoverySummary(data.summary || null);
      toast.success(recoveryDryRun
        ? `Recovery preview: ${data.summary?.processed || 0} analyzed`
        : `Recovery applied: ${data.summary?.updated || 0} updated`
      );
    } catch (err: any) { toast.error(err.message); }
    finally { setRecoveryLoading(false); }
  }, [recoveryDryRun]);

  const applyRecoverySelected = useCallback(async () => {
    if (recoverySelected.size === 0) { toast.error('No products selected'); return; }
    if (!confirm(`Apply merchant recovery to ${recoverySelected.size} products? This rewrites titles, descriptions, and metadata.`)) return;
    setRecoveryApplyLoading(true);
    try {
      const ids = Array.from(recoverySelected);
      const data = await callPipeline('merchant-recovery', { ids, dryRun: false });
      toast.success(`Recovery applied: ${data.summary?.updated || 0} updated`);
      setRecoverySelected(new Set());
      setRecoveryItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, applied: true } : i));
    } catch (err: any) { toast.error(err.message); }
    finally { setRecoveryApplyLoading(false); }
  }, [recoverySelected]);

  const toggleRecoverySelect = (id: string) => setRecoverySelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAllRecovery = () => setRecoverySelected(new Set(recoveryItems.filter(i => i.ok).map(i => i.id)));

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      <Helmet><title>AI Product Optimizer PRO | GetPawsy Admin</title></Helmet>

      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Product Optimizer PRO
        </h1>
        <p className="text-sm text-muted-foreground">Audit, optimize, score, and enrich products for SEO, Google Shopping, and conversions</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="audit" className="gap-1"><BarChart3 className="h-3.5 w-3.5" />Audit</TabsTrigger>
          <TabsTrigger value="optimize" className="gap-1"><Zap className="h-3.5 w-3.5" />Optimizer</TabsTrigger>
          <TabsTrigger value="feed" className="gap-1"><ShoppingCart className="h-3.5 w-3.5" />Feed Enrichment</TabsTrigger>
          <TabsTrigger value="scoring" className="gap-1"><BarChart3 className="h-3.5 w-3.5" />Scoring</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="h-3.5 w-3.5" />History</TabsTrigger>
        </TabsList>

        {/* ════════ AUDIT TAB ════════ */}
        <TabsContent value="audit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Product Quality Audit</CardTitle>
              <CardDescription>Scan products for quality issues and optimization opportunities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by name, slug, SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
                  </div>
                </div>
                <div className="min-w-[160px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Filter</label>
                  <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="draft">Draft Only</SelectItem>
                      <SelectItem value="in_stock">In Stock</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                      <SelectItem value="missing_product_type">Missing Product Type</SelectItem>
                      <SelectItem value="missing_google_category">Missing Google Category</SelectItem>
                      <SelectItem value="low_quality">Low Quality (&lt;50)</SelectItem>
                      <SelectItem value="locked">AI Locked</SelectItem>
                      <SelectItem value="manual_override">Manual Override</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={runAudit} disabled={auditLoading} size="sm" className="h-9">
                  {auditLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Run Audit
                </Button>
              </div>

              {auditSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  <SummaryCard label="Total" value={auditTotal} />
                  <SummaryCard label="Avg Score" value={auditSummary.avgScore} suffix="/100" />
                  <SummaryCard label="Excellent" value={auditSummary.excellent} variant="success" />
                  <SummaryCard label="Good" value={auditSummary.good} variant="info" />
                  <SummaryCard label="Needs Work" value={auditSummary.needsWork} variant="warning" />
                  <SummaryCard label="Critical" value={auditSummary.critical} variant="danger" />
                </div>
              )}

              {auditItems.length > 0 && (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-1.5">
                    {auditItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 p-2 border border-border/50 rounded hover:bg-muted/30 transition-colors">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Tag className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            {item.ai_locked && <Lock className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                            {item.ai_manual_override && <Shield className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">${item.price}</span>
                            {item.animal_type && <Badge variant="secondary" className="text-[10px] px-1">{item.animal_type}</Badge>}
                            {item.confidence_tier && <Badge variant="outline" className="text-[10px] px-1">{item.confidence_tier}</Badge>}
                            {item.flags.slice(0, 3).map(f => <FlagBadge key={f} flag={f} />)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <ScoreBadge score={item.quality_score} label={item.quality_label} />
                          <div className="flex gap-1">
                            {item.shopping_priority !== undefined && <span className="text-[10px] text-muted-foreground">Shop:{item.shopping_priority}</span>}
                            {item.feed_readiness !== undefined && <span className="text-[10px] text-muted-foreground">Feed:{item.feed_readiness}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => lockProducts([item.id], !item.ai_locked)} title={item.ai_locked ? 'Unlock' : 'Lock'}>
                            {item.ai_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ OPTIMIZER TAB ════════ */}
        <TabsContent value="optimize">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI Optimizer</CardTitle>
              <CardDescription>Generate optimized titles, descriptions, metadata, and enrichments using AI with deterministic fallbacks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="min-w-[180px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
                  <Select value={optMode} onValueChange={(v) => setOptMode(v as OptMode)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Full Optimization</SelectItem>
                      <SelectItem value="titles">Titles (70-120 chars)</SelectItem>
                      <SelectItem value="short_titles">Short Titles (&lt;70 chars)</SelectItem>
                      <SelectItem value="descriptions">Descriptions</SelectItem>
                      <SelectItem value="metadata">SEO Metadata</SelectItem>
                      <SelectItem value="feed">Feed Enrichment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 h-9">
                  <Checkbox id="dryRun" checked={optDryRun} onCheckedChange={(v) => setOptDryRun(!!v)} />
                  <label htmlFor="dryRun" className="text-sm cursor-pointer flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> Preview Only
                  </label>
                </div>
                <Button onClick={() => runOptimize()} disabled={optLoading} size="sm" className="h-9">
                  {optLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                  {optDryRun ? 'Preview' : 'Optimize'} (20)
                </Button>
                {auditItems.length > 0 && (
                  <Button variant="outline" onClick={() => runOptimize(auditItems.filter(i => i.quality_score < 60).map(i => i.id))} disabled={optLoading} size="sm" className="h-9">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Fix Low-Quality ({auditItems.filter(i => i.quality_score < 60).length})
                  </Button>
                )}
              </div>

              {optSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <SummaryCard label="Optimized" value={optSummary.optimized} variant="success" />
                  <SummaryCard label="Fallback" value={optSummary.fallback} variant="warning" />
                  <SummaryCard label="Failed" value={optSummary.failed} variant="danger" />
                  <SummaryCard label="DB Updated" value={optSummary.updated} variant="info" />
                </div>
              )}

              {optItems.length > 0 && optDryRun && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={selectAll}><CheckCircle className="h-3.5 w-3.5 mr-1" />Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}><XCircle className="h-3.5 w-3.5 mr-1" />Deselect</Button>
                  {selected.size > 0 && (
                    <Button size="sm" onClick={applySelected} disabled={applyLoading}>
                      {applyLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1" />}
                      Apply {selected.size} Selected
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                </div>
              )}

              {optItems.length > 0 && (
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-2">
                    {optItems.map(item => {
                      const isExpanded = expandedId === item.id;
                      return (
                        <div key={item.id} className={`border rounded p-3 transition-colors ${item.ok ? 'border-border/50' : 'border-destructive/30 bg-destructive/5'} ${selected.has(item.id) ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}>
                          <div className="flex items-start gap-2">
                            {optDryRun && <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="mt-1" disabled={!item.ok} />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-medium truncate max-w-[300px]">{item.name}</span>
                                <ScoreBadge score={item.quality_score || 0} />
                                {item.usedAI && <Badge variant="secondary" className="text-[10px] px-1.5">AI</Badge>}
                                {item.usedFallback && <Badge variant="outline" className="text-[10px] px-1.5">Fallback</Badge>}
                                {item.applied && <Badge className="text-[10px] px-1.5 bg-green-600">Applied</Badge>}
                                {!item.ok && <Badge variant="destructive" className="text-[10px] px-1.5">Error</Badge>}
                                {item.confidence_tier && <Badge variant="outline" className="text-[10px] px-1.5">{item.confidence_tier}</Badge>}
                              </div>
                              {item.optimizedTitle && (
                                <div className="space-y-0.5 text-xs">
                                  <div className="text-muted-foreground line-through">{item.originalTitle} <span className="no-underline">({item.originalTitle?.length || 0}c)</span></div>
                                  <div className="text-primary font-medium">{item.optimizedTitle} <span className="font-normal text-muted-foreground">({item.titleChars}c)</span></div>
                                </div>
                              )}
                              {item.error && <p className="text-xs text-destructive mt-1">{item.error}</p>}
                              {/* Inline scores */}
                              <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                                {item.shopping_priority !== undefined && <span>Shop: {item.shopping_priority}</span>}
                                {item.content_readiness !== undefined && <span>Content: {item.content_readiness}</span>}
                                {item.feed_readiness !== undefined && <span>Feed: {item.feed_readiness}</span>}
                              </div>
                            </div>
                            <Collapsible open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : item.id)}>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </CollapsibleTrigger>
                            </Collapsible>
                          </div>
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              <div className="space-y-2">
                                {item.shortTitle && <DetailRow label="Short Title" value={item.shortTitle} />}
                                {item.optimizedDescription && <DetailRow label="Description" value={item.optimizedDescription.slice(0, 400)} />}
                                {item.bullets?.length && (
                                  <div><span className="font-medium text-muted-foreground">Bullets:</span>
                                    <ul className="mt-1 list-disc list-inside">{item.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                                  </div>
                                )}
                                {item.seoTitle && <DetailRow label="SEO Title" value={item.seoTitle} />}
                                {item.seoMetaDescription && <DetailRow label="Meta Description" value={item.seoMetaDescription} />}
                                {item.seoKeywords && <DetailRow label="Keywords" value={item.seoKeywords.join(', ')} />}
                              </div>
                              <div className="space-y-2">
                                {item.suggestedProductType && <DetailRow label="Product Type" value={item.suggestedProductType} />}
                                {item.googleCategory && <DetailRow label="Google Category" value={item.googleCategory} />}
                                {item.animal && <DetailRow label="Target Animal" value={item.animal} />}
                                {item.keyFeature && <DetailRow label="Key Feature" value={item.keyFeature} />}
                                {item.primaryKeyword && <DetailRow label="Primary Keyword" value={item.primaryKeyword} />}
                                {item.benefitAngle && <DetailRow label="Benefit Angle" value={item.benefitAngle} />}
                                {item.conversionAngle && <DetailRow label="Conversion Angle" value={item.conversionAngle} />}
                                {item.keywordCluster && <DetailRow label="Keyword Cluster" value={item.keywordCluster} />}
                                {item.customLabels && (
                                  <div><span className="font-medium text-muted-foreground">Custom Labels:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {Object.entries(item.customLabels).map(([k, v]) => <Badge key={k} variant="outline" className="text-[10px]">{k}: {v as string}</Badge>)}
                                    </div>
                                  </div>
                                )}
                                {item.flags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">{item.flags.map(f => <FlagBadge key={f} flag={f} />)}</div>
                                )}
                              </div>
                              <div className="col-span-full text-muted-foreground">ID: {item.id} · Slug: {item.slug}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ FEED ENRICHMENT TAB ════════ */}
        <TabsContent value="feed">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Feed Enrichment</CardTitle>
              <CardDescription>Preview and apply Google Shopping feed fields: categories, labels, product types, and taxonomy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={() => { setOptMode('feed'); setOptDryRun(true); setTab('optimize'); setTimeout(() => runOptimize(), 100); }} size="sm">
                  <Eye className="h-4 w-4 mr-1" /> Preview Feed Enrichment
                </Button>
                <Button variant="outline" onClick={() => { setOptMode('feed'); setOptDryRun(false); setTab('optimize'); setTimeout(() => runOptimize(), 100); }} size="sm">
                  <Zap className="h-4 w-4 mr-1" /> Apply Feed Enrichment
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Feed enrichment auto-fills: product_type, google_product_category, animal_type, key_feature, 
                primary_keyword, benefit_angle, conversion_angle, and custom labels (l0-l4) for Google Merchant Center.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ SCORING TAB ════════ */}
        <TabsContent value="scoring">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Scoring Engine</CardTitle>
              <CardDescription>Recompute quality, shopping priority, content readiness, and feed readiness scores</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={runRescore} disabled={rescoreLoading} size="sm">
                  {rescoreLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Re-score All (200 batch)
                </Button>
              </div>
              <div className="bg-muted/50 rounded p-3 text-sm space-y-2">
                <p className="font-medium">Scoring Breakdown:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li><strong>Quality Score (0-100):</strong> 20% title + 20% description + 15% SEO + 20% shopping + 15% completeness + 10% conversion</li>
                  <li><strong>Shopping Priority (0-100):</strong> Image, stock, price, product type, google category, shopping title presence</li>
                  <li><strong>Content Readiness (0-100):</strong> Description depth, meta title/desc, product type, keywords</li>
                  <li><strong>Feed Readiness (0-100):</strong> Google category, product type, shopping title, image, price, stock, labels, brand</li>
                  <li><strong>Confidence Tier:</strong> High (≥75) / Medium (≥50) / Low (&lt;50)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ HISTORY TAB ════════ */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" /> Run History & Rollback</CardTitle>
              <CardDescription>View past optimizer runs and rollback if needed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={loadRuns} disabled={runsLoading} size="sm">
                {runsLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Load Run History
              </Button>

              {runs.length > 0 && (
                <div className="space-y-2">
                  {runs.map(run => (
                    <div key={run.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <p className="text-sm font-medium">{run.mode} · {run.version}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(run.started_at).toLocaleString()} · {run.total_products} products · 
                          <span className="text-green-600 ml-1">{run.success_count} ok</span>
                          {run.error_count > 0 && <span className="text-red-600 ml-1">{run.error_count} errors</span>}
                          {run.fallback_count > 0 && <span className="text-amber-600 ml-1">{run.fallback_count} fallback</span>}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {run.mode === 'apply' && (
                          <Button variant="outline" size="sm" onClick={() => rollbackRun(run.id)} disabled={rollbackLoading}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Rollback
                          </Button>
                        )}
                        {run.error_count > 0 && (
                          <Button variant="outline" size="sm" onClick={async () => {
                            const data = await callPipeline('retry-failed', { runId: run.id });
                            if (data.retryIds?.length) {
                              toast.info(`Found ${data.retryIds.length} failed items. Retrying...`);
                              setOptMode('all'); setOptDryRun(false); setTab('optimize');
                              runOptimize(data.retryIds);
                            } else { toast.info('No failed items to retry'); }
                          }}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry Failed
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {runs.length === 0 && !runsLoading && (
                <p className="text-sm text-muted-foreground">No runs found. Click "Load Run History" to fetch.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}:</span>{' '}
      <span className="text-foreground">{value}</span>
    </div>
  );
}
