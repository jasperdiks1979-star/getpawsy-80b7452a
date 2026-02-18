import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Download, Link, Target, Eye, MousePointerClick, TrendingUp, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { prepareBacklinkAssets, type LinkableAsset } from '@/lib/backlink-domination';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

function Section({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="cursor-pointer py-3 px-4" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0 px-4 pb-4">{children}</CardContent>}
    </Card>
  );
}

export default function BacklinkEnginePage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: gscData, isLoading } = useQuery({
    queryKey: ['backlink-engine-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('keyword_rankings')
        .select('keyword, slug, impressions, clicks, ctr, position')
        .not('slug', 'is', null)
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const pages = useMemo(() => {
    if (!gscData) return [];
    const slugMap = new Map<string, { slug: string; position: number; impressions: number; clicks: number; ctr: number }>();
    for (const row of gscData) {
      if (!row.slug) continue;
      const existing = slugMap.get(row.slug);
      if (!existing || (row.impressions || 0) > existing.impressions) {
        slugMap.set(row.slug, {
          slug: row.slug,
          position: row.position || 99,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          ctr: (row.ctr || 0) * 100,
        });
      }
    }
    return Array.from(slugMap.values());
  }, [gscData]);

  const backlinkResult = useMemo(() => {
    if (pages.length === 0) return null;
    return prepareBacklinkAssets(pages);
  }, [pages]);

  // Filtered views
  const pos11to20 = useMemo(() => pages.filter(p => p.position >= 11 && p.position <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 50), [pages]);
  const lowCtr = useMemo(() => pages.filter(p => p.ctr < 1 && p.impressions > 10).sort((a, b) => b.impressions - a.impressions).slice(0, 50), [pages]);

  const downloadCsv = () => {
    if (!backlinkResult?.csvData) return;
    const blob = new Blob([backlinkResult.csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `getpawsy-backlink-outreach-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Outreach CSV downloaded');
  };

  const downloadFilteredCsv = (rows: Array<{ slug: string; position: number; impressions: number; clicks: number; ctr: number }>, name: string) => {
    const lines = [
      'Slug,Position,Impressions,Clicks,CTR',
      ...rows.map(r => `${r.slug},${r.position},${r.impressions},${r.clicks},${r.ctr.toFixed(2)}%`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `getpawsy-${name}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${name} CSV downloaded`);
  };

  if (!authLoading && !isAdmin) {
    navigate('/dashboard');
    return null;
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><title>Backlink Engine | Admin</title></Helmet>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link className="h-6 w-6 text-primary" /> Backlink Domination Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Authority guides, outreach summaries, anchor variations & CSV export
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!backlinkResult}>
            <Download className="h-4 w-4 mr-1" /> Export Full CSV
          </Button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Authority Assets</p>
            <p className="text-2xl font-bold">{backlinkResult?.totalAssets || 0}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Priority Score</p>
            <p className="text-2xl font-bold">{backlinkResult?.avgPriorityScore || 0}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pos 11–20 Pages</p>
            <p className="text-2xl font-bold">{pos11to20.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">CTR &lt;1% Pages</p>
            <p className="text-2xl font-bold">{lowCtr.length}</p>
          </CardContent></Card>
        </div>

        {/* Top Authority Guides */}
        <Section title="Top Authority Guides (by impressions)" badge={`${backlinkResult?.totalAssets || 0} assets`} defaultOpen>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {backlinkResult?.assets.map((a: LinkableAsset) => (
              <div key={a.slug} className="p-3 rounded-lg border bg-card text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-3 w-3 text-primary" />
                    <span className="font-mono text-xs text-primary">/{a.slug}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge variant="outline" className="text-xs">Pos {a.position}</Badge>
                    <Badge variant="secondary" className="text-xs">{a.impressions} imp</Badge>
                    <Badge className="text-xs bg-primary/10 text-primary">Score: {a.priorityScore}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{a.outreachSummary}</p>
                <div className="flex flex-wrap gap-1">
                  {a.anchorVariations.map((anchor, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{anchor}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Position 11-20 */}
        <Section title="Pages Ranking 11–20" badge={`${pos11to20.length} pages`}>
          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" onClick={() => downloadFilteredCsv(pos11to20, 'pos-11-20')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {pos11to20.map(p => (
              <div key={p.slug} className="flex items-center justify-between p-2 rounded border text-xs">
                <span className="font-mono text-primary truncate max-w-[50%]">/{p.slug}</span>
                <div className="flex gap-2">
                  <Badge variant="outline">Pos {p.position}</Badge>
                  <Badge variant="secondary">{p.impressions} imp</Badge>
                  <Badge variant={p.clicks === 0 ? 'destructive' : 'outline'}>{p.clicks} clicks</Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Low CTR */}
        <Section title="Pages with CTR < 1%" badge={`${lowCtr.length} pages`}>
          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" onClick={() => downloadFilteredCsv(lowCtr, 'low-ctr')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {lowCtr.map(p => (
              <div key={p.slug} className="flex items-center justify-between p-2 rounded border text-xs">
                <span className="font-mono text-primary truncate max-w-[50%]">/{p.slug}</span>
                <div className="flex gap-2">
                  <Badge variant="outline">Pos {p.position}</Badge>
                  <Badge variant="secondary">{p.impressions} imp</Badge>
                  <Badge variant="destructive">{p.ctr.toFixed(1)}% CTR</Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </Layout>
  );
}
