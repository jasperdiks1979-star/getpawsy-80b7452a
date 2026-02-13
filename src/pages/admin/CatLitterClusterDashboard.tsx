import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Crown, Link2, AlertTriangle, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuidesList } from '@/hooks/useGuides';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const PRIMARY_CORNERSTONE = 'best-cat-litter-box-2026';

const CLUSTER_GUIDES = [
  // Support guides
  { slug: 'best-extra-large-litter-boxes', role: 'SUPPORT' as const },
  { slug: 'best-odor-control-litter-box', role: 'SUPPORT' as const },
  { slug: 'best-litter-box-small-apartments', role: 'SUPPORT' as const },
  { slug: 'how-many-litter-boxes-per-cat', role: 'SUPPORT' as const },
  { slug: 'covered-vs-open-litter-box', role: 'SUPPORT' as const },
  { slug: 'best-cat-litter-box-furniture-enclosures-2026', role: 'SUPPORT' as const },
  { slug: 'best-self-cleaning-litter-box-2026', role: 'SUPPORT' as const },
  { slug: 'best-litter-box-senior-cats', role: 'SUPPORT' as const },
  { slug: 'best-litter-box-kittens', role: 'SUPPORT' as const },
  { slug: 'best-low-tracking-litter-box', role: 'SUPPORT' as const },
  { slug: 'automatic-vs-manual-litter-box', role: 'SUPPORT' as const },
  { slug: 'litter-box-placement-guide', role: 'SUPPORT' as const },
  { slug: 'best-litter-box-odor-bathroom', role: 'SUPPORT' as const },
  // Micro-intent guides
  { slug: 'litter-box-for-studio-apartment', role: 'MICRO' as const },
  { slug: 'best-litter-box-for-multiple-cats', role: 'MICRO' as const },
  { slug: 'top-rated-litter-box-under-100', role: 'MICRO' as const },
  { slug: 'high-sided-litter-box-guide', role: 'MICRO' as const },
  { slug: 'litter-box-odor-control-tips', role: 'MICRO' as const },
  { slug: 'best-litter-box-studio-apartment', role: 'MICRO' as const },
  { slug: 'best-litter-boxes-multi-cat', role: 'MICRO' as const },
  { slug: 'best-litter-box-under-100', role: 'MICRO' as const },
  { slug: 'best-high-sided-litter-box', role: 'MICRO' as const },
  { slug: 'cat-litter-box-odor-solutions', role: 'MICRO' as const },
];

const INTERNAL_LINK_MAP: Record<string, string[]> = {
  'best-cat-litter-box-2026': ['best-cat-litter-box-furniture-enclosures-2026', 'best-self-cleaning-litter-box-2026', 'best-extra-large-litter-boxes', 'best-litter-boxes-multi-cat', 'how-many-litter-boxes-per-cat', 'litter-box-placement-guide', 'best-litter-box-senior-cats', 'best-dog-bed-2026'],
  'best-extra-large-litter-boxes': ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat', 'best-litter-box-senior-cats'],
  'best-odor-control-litter-box': ['best-cat-litter-box-2026', 'best-cat-litter-box-furniture-enclosures-2026', 'best-high-sided-litter-box', 'best-self-cleaning-litter-box-2026', 'best-litter-box-studio-apartment', 'best-litter-boxes-multi-cat'],
  'best-litter-box-small-apartments': ['best-cat-litter-box-2026', 'best-litter-box-studio-apartment', 'best-cat-litter-box-furniture-enclosures-2026', 'best-odor-control-litter-box'],
  'how-many-litter-boxes-per-cat': ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat', 'litter-box-placement-guide'],
  'covered-vs-open-litter-box': ['best-cat-litter-box-2026', 'best-high-sided-litter-box', 'best-litter-boxes-multi-cat', 'best-odor-control-litter-box', 'how-many-litter-boxes-per-cat'],
  'best-cat-litter-box-furniture-enclosures-2026': ['best-cat-litter-box-2026', 'best-litter-box-small-apartments'],
  'best-self-cleaning-litter-box-2026': ['best-cat-litter-box-2026', 'best-litter-boxes-multi-cat'],
  'best-litter-box-senior-cats': ['best-cat-litter-box-2026', 'best-extra-large-litter-boxes'],
  'best-litter-box-kittens': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box'],
  'best-low-tracking-litter-box': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box', 'best-high-sided-litter-box'],
  'automatic-vs-manual-litter-box': ['best-cat-litter-box-2026', 'best-self-cleaning-litter-box-2026'],
  'litter-box-placement-guide': ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat', 'best-litter-box-small-apartments'],
  'best-litter-box-odor-bathroom': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'litter-box-odor-control-tips'],
  'litter-box-for-studio-apartment': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'best-high-sided-litter-box'],
  'best-litter-box-for-multiple-cats': ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat', 'best-extra-large-litter-boxes', 'best-high-sided-litter-box', 'best-odor-control-litter-box', 'litter-box-for-studio-apartment'],
  'top-rated-litter-box-under-100': ['best-cat-litter-box-2026', 'best-high-sided-litter-box', 'best-odor-control-litter-box', 'best-litter-box-for-multiple-cats'],
  'high-sided-litter-box-guide': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box', 'best-extra-large-litter-boxes', 'best-litter-box-for-multiple-cats'],
  'litter-box-odor-control-tips': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'covered-vs-open-litter-box', 'best-litter-box-for-multiple-cats'],
  'best-litter-box-studio-apartment': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'best-litter-box-small-apartments'],
  'best-litter-boxes-multi-cat': ['best-cat-litter-box-2026', 'how-many-litter-boxes-per-cat', 'best-extra-large-litter-boxes'],
  'best-litter-box-under-100': ['best-cat-litter-box-2026', 'best-high-sided-litter-box', 'best-odor-control-litter-box'],
  'best-high-sided-litter-box': ['best-cat-litter-box-2026', 'covered-vs-open-litter-box', 'best-extra-large-litter-boxes'],
  'cat-litter-box-odor-solutions': ['best-cat-litter-box-2026', 'best-odor-control-litter-box', 'litter-box-odor-control-tips'],
};

const getRoleBadge = (role: string) => {
  switch (role) {
    case 'CORNERSTONE': return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">👑 Cornerstone</Badge>;
    case 'SUPPORT': return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">🛡️ Support</Badge>;
    case 'MICRO': return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">🔬 Micro</Badge>;
    default: return null;
  }
};

const CatLitterClusterDashboard = () => {
  const { data: allGuides } = useGuidesList();
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  const clusterData = useMemo(() => {
    if (!allGuides) return null;

    const allClusterSlugs = [PRIMARY_CORNERSTONE, ...CLUSTER_GUIDES.map(g => g.slug)];
    
    const guides = allClusterSlugs.map(slug => {
      const guide = allGuides.find(g => g.slug === slug);
      const role = slug === PRIMARY_CORNERSTONE ? 'CORNERSTONE' : CLUSTER_GUIDES.find(g => g.slug === slug)?.role || 'SUPPORT';
      
      const inboundLinks = Object.entries(INTERNAL_LINK_MAP)
        .filter(([, targets]) => targets.includes(slug))
        .map(([source]) => source);
      
      const outboundLinks = INTERNAL_LINK_MAP[slug] || [];
      
      return {
        slug,
        title: guide?.title || slug,
        role,
        inboundCount: inboundLinks.length,
        outboundCount: outboundLinks.length,
        inboundSources: inboundLinks,
        outboundTargets: outboundLinks,
        exists: !!guide,
      };
    });

    const cornerstoneInbound = guides.find(g => g.slug === PRIMARY_CORNERSTONE)?.inboundCount || 0;
    const avgInbound = guides.reduce((sum, g) => sum + g.inboundCount, 0) / guides.length;
    const totalGuides = guides.length;
    const supportGuides = guides.filter(g => g.role === 'SUPPORT').length;
    const microGuides = guides.filter(g => g.role === 'MICRO').length;

    const keywordOverlaps: { guide1: string; guide2: string; keyword: string }[] = [];
    const litterGuides = allGuides.filter(g => g.category === 'Cat Litter');
    for (let i = 0; i < litterGuides.length; i++) {
      for (let j = i + 1; j < litterGuides.length; j++) {
        const shared = litterGuides[i].keywords.filter(k => litterGuides[j].keywords.includes(k));
        shared.forEach(kw => {
          keywordOverlaps.push({ guide1: litterGuides[i].slug, guide2: litterGuides[j].slug, keyword: kw });
        });
      }
    }

    const coverageScore = Math.min(100, (totalGuides / 20) * 100);
    const linkScore = Math.min(100, (cornerstoneInbound / 14) * 100);
    const clusterScore = Math.round((coverageScore * 0.4 + linkScore * 0.6));

    return { guides, cornerstoneInbound, avgInbound, totalGuides, supportGuides, microGuides, keywordOverlaps, clusterScore, coverageScore, linkScore };
  }, [allGuides]);

  if (!clusterData) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  const target90Day = {
    cornerstoneTop15: false,
    avgInbound12: clusterData.avgInbound >= 12,
    supportTop25: 0,
    snippetDetected: false,
    zeroCannibalization: clusterData.keywordOverlaps.length === 0,
  };

  return (
    <Layout>
      <Helmet>
        <meta name="robots" content="noindex, follow" />
        <title>Cat Litter Cluster Dashboard | Admin</title>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard/guides-seo" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Crown className="w-6 h-6 text-amber-500" />
              Cat Litter Cluster — Cornerstone Domination
            </h1>
            <p className="text-muted-foreground text-sm">90-day topical authority acceleration dashboard</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">Cluster Score</div>
              <div className="text-2xl font-bold text-primary">{clusterData.clusterScore}</div>
              <Progress value={clusterData.clusterScore} className="h-1.5 mt-1" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">Total Guides</div>
              <div className="text-2xl font-bold">{clusterData.totalGuides}</div>
              <div className="text-xs text-muted-foreground">{clusterData.supportGuides} support · {clusterData.microGuides} micro</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">Cornerstone Inbound</div>
              <div className="text-2xl font-bold">{clusterData.cornerstoneInbound}</div>
              <div className="text-xs text-muted-foreground">target: ≥14</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">Avg Inbound Links</div>
              <div className="text-2xl font-bold">{clusterData.avgInbound.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">target: ≥12</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">Cannibalization Risks</div>
              <div className="text-2xl font-bold">{clusterData.keywordOverlaps.length}</div>
              <div className="text-xs text-muted-foreground">keyword overlaps</div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              90-Day Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.cornerstoneTop15 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Cornerstone Top 15</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.avgInbound12 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Avg inbound ≥ 12</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.supportTop25 >= 2 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>2 supports Top 25</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.snippetDetected ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Snippet captured</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.zeroCannibalization ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Zero cannibalization</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Cluster Authority Map
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Guide</th>
                    <th className="text-center px-3 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-center px-3 py-3 font-medium text-muted-foreground">Inbound</th>
                    <th className="text-center px-3 py-3 font-medium text-muted-foreground">Outbound</th>
                    <th className="text-center px-3 py-3 font-medium text-muted-foreground">Health</th>
                    <th className="text-center px-3 py-3 font-medium text-muted-foreground w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {clusterData.guides.map(guide => {
                    const healthColor = guide.inboundCount >= 8 ? 'bg-green-500' : guide.inboundCount >= 4 ? 'bg-orange-500' : 'bg-red-500';
                    const isExpanded = expandedGuide === guide.slug;
                    
                    return (
                      <tbody key={guide.slug}>
                        <tr 
                          className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => setExpandedGuide(isExpanded ? null : guide.slug)}
                        >
                          <td className="px-4 py-3">
                            <Link 
                              to={`/guides/${guide.slug}`} 
                              className="text-foreground hover:text-primary font-medium"
                              onClick={e => e.stopPropagation()}
                            >
                              {guide.slug}
                            </Link>
                            {!guide.exists && <Badge variant="outline" className="ml-2 text-[10px]">Missing</Badge>}
                          </td>
                          <td className="text-center px-3 py-3">{getRoleBadge(guide.role)}</td>
                          <td className="text-center px-3 py-3 font-mono">{guide.inboundCount}</td>
                          <td className="text-center px-3 py-3 font-mono">{guide.outboundCount}</td>
                          <td className="text-center px-3 py-3">
                            <div className={`w-3 h-3 rounded-full mx-auto ${healthColor}`} />
                          </td>
                          <td className="text-center px-3 py-3">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 bg-muted/20">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <div className="font-medium mb-1 text-muted-foreground">Inbound from:</div>
                                  {guide.inboundSources.length > 0 ? guide.inboundSources.map(s => (
                                    <div key={s} className="text-foreground/80">{s}</div>
                                  )) : <div className="text-muted-foreground italic">No inbound links</div>}
                                </div>
                                <div>
                                  <div className="font-medium mb-1 text-muted-foreground">Links to:</div>
                                  {guide.outboundTargets.length > 0 ? guide.outboundTargets.map(t => (
                                    <div key={t} className="text-foreground/80">{t}</div>
                                  )) : <div className="text-muted-foreground italic">No outbound links</div>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {clusterData.keywordOverlaps.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Cannibalization Risks ({clusterData.keywordOverlaps.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {clusterData.keywordOverlaps.slice(0, 10).map((overlap, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b border-border/30 last:border-0">
                    <Badge variant="outline" className="text-[10px] font-mono">{overlap.keyword}</Badge>
                    <span className="text-muted-foreground">shared by</span>
                    <span className="font-medium">{overlap.guide1}</span>
                    <span className="text-muted-foreground">&</span>
                    <span className="font-medium">{overlap.guide2}</span>
                  </div>
                ))}
                {clusterData.keywordOverlaps.length > 10 && (
                  <div className="text-xs text-muted-foreground">+{clusterData.keywordOverlaps.length - 10} more overlaps</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default CatLitterClusterDashboard;
