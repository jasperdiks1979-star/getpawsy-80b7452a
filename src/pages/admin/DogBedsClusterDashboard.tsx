import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Crown, Shield, Link2, Eye, AlertTriangle, TrendingUp, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useGuidesList } from '@/hooks/useGuides';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const PRIMARY_CORNERSTONE = 'best-dog-bed-2026';

const CLUSTER_GUIDES = [
  // Support guides
  { slug: 'best-orthopedic-dog-bed', role: 'SUPPORT' as const },
  { slug: 'best-orthopedic-dog-bed-2026', role: 'SUPPORT' as const },
  { slug: 'calming-dog-bed-anxiety', role: 'SUPPORT' as const },
  { slug: 'dog-bed-for-large-breeds', role: 'SUPPORT' as const },
  { slug: 'memory-foam-vs-standard-dog-bed', role: 'SUPPORT' as const },
  { slug: 'best-outdoor-dog-bed', role: 'SUPPORT' as const },
  { slug: 'best-dog-bed-for-small-dogs', role: 'SUPPORT' as const },
  { slug: 'dog-bed-buying-guide', role: 'SUPPORT' as const },
  // Micro-intent guides
  { slug: 'best-dog-bed-under-100', role: 'MICRO' as const },
  { slug: 'dog-bed-for-anxiety', role: 'MICRO' as const },
  { slug: 'machine-washable-dog-bed-guide', role: 'MICRO' as const },
  { slug: 'dog-bed-size-chart-guide', role: 'MICRO' as const },
];

// Simulated link map — in production this would be computed from actual guide content
const INTERNAL_LINK_MAP: Record<string, string[]> = {
  'best-dog-bed-2026': ['best-orthopedic-dog-bed', 'calming-dog-bed-anxiety', 'outdoor-dog-games-2026', 'best-orthopedic-dog-bed-2026', 'dog-bed-for-large-breeds'],
  'best-orthopedic-dog-bed': ['best-dog-bed-2026', 'dog-bed-for-large-breeds', 'outdoor-dog-games-2026'],
  'best-orthopedic-dog-bed-2026': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'calming-dog-bed-anxiety': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'dog-bed-for-large-breeds': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'memory-foam-vs-standard-dog-bed': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'best-outdoor-dog-bed': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026', 'machine-washable-dog-bed-guide', 'dog-bed-size-chart-guide'],
  'best-dog-bed-for-small-dogs': ['best-dog-bed-2026', 'calming-dog-bed-anxiety', 'dog-bed-for-anxiety', 'machine-washable-dog-bed-guide', 'dog-bed-size-chart-guide', 'best-orthopedic-dog-bed'],
  'dog-bed-buying-guide': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'dog-bed-for-anxiety', 'best-outdoor-dog-bed', 'dog-bed-size-chart-guide', 'best-dog-bed-under-100', 'machine-washable-dog-bed-guide', 'dog-bed-for-large-breeds'],
  'best-dog-bed-under-100': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'calming-dog-bed-anxiety', 'dog-bed-size-chart-guide', 'dog-bed-for-large-breeds'],
  'dog-bed-for-anxiety': ['best-dog-bed-2026', 'calming-dog-bed-anxiety', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'machine-washable-dog-bed-guide': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'outdoor-dog-games-2026'],
  'dog-bed-size-chart-guide': ['best-dog-bed-2026', 'best-orthopedic-dog-bed', 'calming-dog-bed-anxiety', 'dog-bed-for-large-breeds', 'dog-bed-for-anxiety'],
};

const getRoleBadge = (role: string) => {
  switch (role) {
    case 'CORNERSTONE': return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">👑 Cornerstone</Badge>;
    case 'SUPPORT': return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">🛡️ Support</Badge>;
    case 'MICRO': return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">🔬 Micro</Badge>;
    default: return null;
  }
};

const DogBedsClusterDashboard = () => {
  const { data: allGuides } = useGuidesList();
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  const clusterData = useMemo(() => {
    if (!allGuides) return null;

    const allClusterSlugs = [PRIMARY_CORNERSTONE, ...CLUSTER_GUIDES.map(g => g.slug)];
    
    const guides = allClusterSlugs.map(slug => {
      const guide = allGuides.find(g => g.slug === slug);
      const role = slug === PRIMARY_CORNERSTONE ? 'CORNERSTONE' : CLUSTER_GUIDES.find(g => g.slug === slug)?.role || 'SUPPORT';
      
      // Calculate inbound links
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

    // Cannibalization check
    const keywordOverlaps: { guide1: string; guide2: string; keyword: string }[] = [];
    const dogBedGuides = allGuides.filter(g => g.category === 'Dog Beds');
    for (let i = 0; i < dogBedGuides.length; i++) {
      for (let j = i + 1; j < dogBedGuides.length; j++) {
        const shared = dogBedGuides[i].keywords.filter(k => dogBedGuides[j].keywords.includes(k));
        shared.forEach(kw => {
          keywordOverlaps.push({ guide1: dogBedGuides[i].slug, guide2: dogBedGuides[j].slug, keyword: kw });
        });
      }
    }

    // Authority score (simplified)
    const coverageScore = Math.min(100, (totalGuides / 15) * 100);
    const linkScore = Math.min(100, (cornerstoneInbound / 12) * 100);
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
    cornerstoneTop15: false, // Would come from GSC data
    avgInbound10: clusterData.avgInbound >= 10,
    supportTop25: 0, // Would come from GSC data
    snippetDetected: false, // Would come from snippet monitor
  };

  return (
    <Layout>
      <Helmet>
        <meta name="robots" content="noindex, follow" />
        <title>Dog Beds Cluster Dashboard | Admin</title>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard/guides-seo" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Crown className="w-6 h-6 text-amber-500" />
              Dog Beds Cluster — Cornerstone Domination
            </h1>
            <p className="text-muted-foreground text-sm">90-day topical authority acceleration dashboard</p>
          </div>
        </div>

        {/* Top Metrics */}
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
              <div className="text-xs text-muted-foreground">target: ≥12</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">Avg Inbound Links</div>
              <div className="text-2xl font-bold">{clusterData.avgInbound.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">target: ≥10</div>
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

        {/* 90-Day Targets */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              90-Day Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.cornerstoneTop15 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Cornerstone enters Top 15</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.avgInbound10 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Avg inbound ≥ 10</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.supportTop25 >= 2 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>2 supports in Top 25</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${target90Day.snippetDetected ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span>Snippet opportunity</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cluster Guides Table */}
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

        {/* Cannibalization Warnings */}
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

export default DogBedsClusterDashboard;
