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
import {
  Loader2, RefreshCw, Search, Zap, FileText, Tag, BarChart3,
  CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Eye, Sparkles, Shield, ArrowRight,
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
  quality_score: number; quality_label: string;
  scores?: any; flags: string[];
  // Optimization results
  originalTitle?: string; optimizedTitle?: string; shortTitle?: string;
  titleChars?: number; usedAI?: boolean; usedFallback?: boolean;
  originalDescription?: string; optimizedDescription?: string; bullets?: string[];
  metaTitle?: string; metaDescription?: string; seoKeywords?: string[];
  suggestedProductType?: string; ok?: boolean; error?: string; applied?: boolean;
}

interface AuditSummary {
  avgScore: number; needsWork: number; critical: number;
  excellent: number; good: number;
}

type OptMode = 'titles' | 'short_titles' | 'descriptions' | 'metadata' | 'all';
type Filter = 'all' | 'active' | 'draft' | 'in_stock' | 'out_of_stock' | 'missing_product_type' | 'missing_google_category' | 'low_quality';

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
  if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Score Badge ──
function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color = score >= 80 ? 'text-green-600 bg-green-50 border-green-200'
    : score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : score >= 40 ? 'text-orange-600 bg-orange-50 border-orange-200'
    : 'text-red-600 bg-red-50 border-red-200';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>{score} {label && <span className="font-normal">· {label}</span>}</span>;
}

function FlagBadge({ flag }: { flag: string }) {
  const label = flag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">{label}</Badge>;
}

export default function ProductOptimizerPage() {
  // Audit state
  const [auditItems, setAuditItems] = useState<ProductItem[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');

  // Optimize state
  const [optMode, setOptMode] = useState<OptMode>('titles');
  const [optItems, setOptItems] = useState<ProductItem[]>([]);
  const [optSummary, setOptSummary] = useState<any>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optDryRun, setOptDryRun] = useState(true);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyLoading, setApplyLoading] = useState(false);

  // Detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const msg = optDryRun ? `Preview: ${data.summary?.optimized || 0} optimized` : `Applied: ${data.summary?.updated || 0} updated`;
      toast.success(msg);
    } catch (err: any) { toast.error(err.message); }
    finally { setOptLoading(false); }
  }, [optMode, optDryRun]);

  // ── Batch Apply ──
  const applySelected = useCallback(async () => {
    if (selected.size === 0) { toast.error('No products selected'); return; }
    if (!confirm(`Apply optimizations to ${selected.size} products? This will write to the database.`)) return;
    setApplyLoading(true);
    try {
      const updates = optItems
        .filter(i => selected.has(i.id) && i.ok)
        .map(i => {
          const fields: any = {};
          if (i.optimizedTitle) fields.shopping_title = i.optimizedTitle;
          if (i.shortTitle) fields.short_title = i.shortTitle;
          if (i.optimizedDescription) fields.optimized_description = i.optimizedDescription;
          if (i.bullets?.length) fields.description_bullets = i.bullets;
          if (i.metaTitle) fields.meta_title = i.metaTitle;
          if (i.metaDescription) fields.meta_description = i.metaDescription;
          if (i.seoKeywords?.length) fields.seo_keywords = i.seoKeywords;
          if (i.suggestedProductType) fields.product_type = i.suggestedProductType;
          fields.quality_score = i.quality_score;
          fields.quality_flags = i.flags;
          return { id: i.id, fields };
        })
        .filter(u => Object.keys(u.fields).length > 0);

      if (updates.length === 0) { toast.error('No applicable changes found'); setApplyLoading(false); return; }

      const data = await callPipeline('apply', { updates });
      toast.success(`Applied ${data.applied} updates (${data.errors} errors)`);
      setSelected(new Set());
    } catch (err: any) { toast.error(err.message); }
    finally { setApplyLoading(false); }
  }, [selected, optItems]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selectAll = () => {
    const allIds = optItems.filter(i => i.ok).map(i => i.id);
    setSelected(new Set(allIds));
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <Helmet><title>AI Product Optimizer | GetPawsy Admin</title></Helmet>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Product Optimizer</h1>
        <p className="text-sm text-muted-foreground">Audit, optimize, and enrich product data for SEO, Google Shopping, and conversions</p>
      </div>

      {/* ── AUDIT SECTION ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Product Quality Audit</CardTitle>
          <CardDescription>Scan products to identify quality issues and optimization opportunities</CardDescription>
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
                  <SelectItem value="low_quality">Low Quality (Score &lt; 50)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runAudit} disabled={auditLoading} size="sm" className="h-9">
              {auditLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Run Audit
            </Button>
          </div>

          {/* Summary Cards */}
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

          {/* Audit Items */}
          {auditItems.length > 0 && (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-1.5">
                {auditItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2 border border-border/50 rounded hover:bg-muted/30 transition-colors">
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <Tag className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">${item.price}</span>
                        {item.category && <span className="text-xs text-muted-foreground">· {item.category}</span>}
                        {item.flags.slice(0, 3).map(f => <FlagBadge key={f} flag={f} />)}
                        {item.flags.length > 3 && <Badge variant="outline" className="text-[10px]">+{item.flags.length - 3}</Badge>}
                      </div>
                    </div>
                    <ScoreBadge score={item.quality_score} label={item.quality_label} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── OPTIMIZE SECTION ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI Optimizer</CardTitle>
          <CardDescription>Generate optimized titles, descriptions, and metadata using AI with deterministic fallbacks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-[160px]">
              <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
              <Select value={optMode} onValueChange={(v) => setOptMode(v as OptMode)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="titles">Titles (70-120 chars)</SelectItem>
                  <SelectItem value="short_titles">Short Titles (&lt;70 chars)</SelectItem>
                  <SelectItem value="descriptions">Descriptions</SelectItem>
                  <SelectItem value="metadata">SEO Metadata</SelectItem>
                  <SelectItem value="all">Full Optimization</SelectItem>
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
              {optDryRun ? 'Preview' : 'Optimize'} (20 Products)
            </Button>
            {auditItems.length > 0 && (
              <Button variant="outline" onClick={() => runOptimize(auditItems.filter(i => i.quality_score < 60).map(i => i.id))} disabled={optLoading} size="sm" className="h-9">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Fix Low-Quality ({auditItems.filter(i => i.quality_score < 60).length})
              </Button>
            )}
          </div>

          {/* Optimize Summary */}
          {optSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryCard label="Optimized" value={optSummary.optimized} variant="success" />
              <SummaryCard label="Fallback Used" value={optSummary.fallback} variant="warning" />
              <SummaryCard label="Failed" value={optSummary.failed} variant="danger" />
              <SummaryCard label="DB Updated" value={optSummary.updated} variant="info" />
            </div>
          )}

          {/* Selection controls */}
          {optItems.length > 0 && optDryRun && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAll}><CheckCircle className="h-3.5 w-3.5 mr-1" /> Select All</Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}><XCircle className="h-3.5 w-3.5 mr-1" /> Deselect All</Button>
              {selected.size > 0 && (
                <Button size="sm" onClick={applySelected} disabled={applyLoading}>
                  {applyLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1" />}
                  Apply {selected.size} Selected
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            </div>
          )}

          {/* Optimize Items */}
          {optItems.length > 0 && (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-2">
                {optItems.map(item => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <div key={item.id} className={`border rounded p-3 transition-colors ${item.ok ? 'border-border/50' : 'border-destructive/30 bg-destructive/5'} ${selected.has(item.id) ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}>
                      <div className="flex items-start gap-2">
                        {optDryRun && (
                          <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="mt-1" disabled={!item.ok} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium truncate max-w-[300px]">{item.name}</span>
                            <ScoreBadge score={item.quality_score || 0} />
                            {item.usedAI && <Badge variant="secondary" className="text-[10px] px-1.5">AI</Badge>}
                            {item.usedFallback && <Badge variant="outline" className="text-[10px] px-1.5">Fallback</Badge>}
                            {item.applied && <Badge className="text-[10px] px-1.5 bg-green-600">Applied</Badge>}
                            {!item.ok && <Badge variant="destructive" className="text-[10px] px-1.5">Error</Badge>}
                          </div>

                          {/* Title comparison */}
                          {item.optimizedTitle && (
                            <div className="space-y-0.5 text-xs">
                              <div className="text-muted-foreground line-through">{item.originalTitle} <span className="no-underline">({item.originalTitle?.length || 0}c)</span></div>
                              <div className="text-primary font-medium">{item.optimizedTitle} <span className="font-normal text-muted-foreground">({item.titleChars}c)</span></div>
                            </div>
                          )}

                          {item.error && <p className="text-xs text-destructive mt-1">{item.error}</p>}
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
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-3 text-xs">
                          {item.shortTitle && (
                            <div><span className="font-medium text-muted-foreground">Short Title:</span> <span className="text-foreground">{item.shortTitle}</span></div>
                          )}
                          {item.optimizedDescription && (
                            <div>
                              <span className="font-medium text-muted-foreground">Optimized Description:</span>
                              <p className="mt-1 text-foreground whitespace-pre-wrap">{item.optimizedDescription.slice(0, 500)}</p>
                            </div>
                          )}
                          {item.bullets && item.bullets.length > 0 && (
                            <div>
                              <span className="font-medium text-muted-foreground">Key Bullets:</span>
                              <ul className="mt-1 list-disc list-inside text-foreground">
                                {item.bullets.map((b, i) => <li key={i}>{b}</li>)}
                              </ul>
                            </div>
                          )}
                          {item.metaTitle && <div><span className="font-medium text-muted-foreground">Meta Title:</span> <span className="text-foreground">{item.metaTitle}</span></div>}
                          {item.metaDescription && <div><span className="font-medium text-muted-foreground">Meta Description:</span> <span className="text-foreground">{item.metaDescription}</span></div>}
                          {item.seoKeywords && <div><span className="font-medium text-muted-foreground">Keywords:</span> <span className="text-foreground">{item.seoKeywords.join(', ')}</span></div>}
                          {item.suggestedProductType && <div><span className="font-medium text-muted-foreground">Suggested Type:</span> <span className="text-foreground">{item.suggestedProductType}</span></div>}
                          {item.flags.length > 0 && (
                            <div className="flex flex-wrap gap-1">{item.flags.map(f => <FlagBadge key={f} flag={f} />)}</div>
                          )}
                          <div className="text-muted-foreground">ID: {item.id} · Slug: {item.slug}</div>
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
    </div>
  );
}

// ── Summary Card ──
function SummaryCard({ label, value, suffix, variant }: { label: string; value: number; suffix?: string; variant?: 'success' | 'warning' | 'danger' | 'info' }) {
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
