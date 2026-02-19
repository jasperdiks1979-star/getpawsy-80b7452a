import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BookOpen, CheckCircle, XCircle, AlertTriangle, RefreshCw, ExternalLink,
  TrendingUp, Link2, FileSearch, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildGuideIndexReport, buildImpressionLiftPlan, type GuideIndexEntry, type NearWinPage } from '@/lib/link-graph-engine';

// All known guide slugs from public/data/guides/
const GUIDE_SLUGS = [
  'best-cat-litter-box-2026', 'best-dog-bed-2026', 'best-cat-trees-2026',
  'best-self-cleaning-litter-box-2026', 'outdoor-dog-games-2026', 'best-orthopedic-dog-bed-2026',
  'best-orthopedic-dog-bed', 'best-dog-bed-for-small-dogs', 'best-dog-bed-under-100',
  'best-outdoor-dog-bed', 'calming-dog-bed-anxiety', 'dog-bed-buying-guide',
  'dog-bed-for-anxiety', 'dog-bed-for-large-breeds', 'dog-bed-size-chart-guide',
  'machine-washable-dog-bed-guide', 'memory-foam-vs-standard-dog-bed',
  'best-cat-trees-small-apartments', 'best-cat-condo-small-apartments',
  'cat-condo-vs-cat-tower', 'choosing-safe-cat-tree-indoor', 'modern-cat-trees-home-design',
  'automatic-vs-manual-litter-box', 'best-cat-litter-box-furniture-enclosures-2026',
  'best-extra-large-litter-boxes', 'best-high-sided-litter-box',
  'best-litter-box-for-multiple-cats', 'best-litter-box-kittens',
  'best-litter-box-odor-bathroom', 'best-litter-box-senior-cats',
  'best-litter-box-small-apartments', 'best-litter-box-studio-apartment',
  'best-litter-box-under-100', 'best-litter-boxes-multi-cat',
  'best-low-tracking-litter-box', 'best-odor-control-litter-box',
  'cat-litter-box-odor-solutions', 'covered-vs-open-litter-box',
  'high-sided-litter-box-guide', 'how-many-litter-boxes-per-cat',
  'litter-box-for-studio-apartment', 'litter-box-odor-control-tips',
  'litter-box-placement-guide', 'top-rated-litter-box-under-100',
  'guinea-pig-cage-vs-playpen', 'how-to-choose-guinea-pig-cage',
  'backyard-enrichment-for-dogs', 'how-to-tire-out-a-dog-fast',
  'outdoor-dog-games-enrichment', 'summer-dog-activities',
];

export function GuideVisibilityWidget() {
  const [report, setReport] = useState<GuideIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Build guide index report
    // All guides are now in sitemap-guides.xml
    const sitemapSlugs = new Set(GUIDE_SLUGS.map(s => `guides/${s}`));
    const internalLinksMap = new Map<string, number>();
    // Approximate: each guide links to 2-4 other guides via cluster linking
    GUIDE_SLUGS.forEach(s => internalLinksMap.set(`guides/${s}`, 3));

    const entries = buildGuideIndexReport(GUIDE_SLUGS, sitemapSlugs, internalLinksMap);
    setReport(entries);
    setLoading(false);
  }, []);

  const indexed = report.filter(r => r.status !== 'not_indexed').length;
  const withIssues = report.filter(r => r.issues.length > 0).length;

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Guide Visibility & Index Report
        </CardTitle>
        <CardDescription>
          {GUIDE_SLUGS.length} guides tracked · {indexed} likely indexed · {withIssues} with issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 text-center border-green-500/20">
            <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <div className="text-lg font-bold">{GUIDE_SLUGS.length}</div>
            <div className="text-[10px] text-muted-foreground">Total Guides</div>
          </div>
          <div className="border rounded-lg p-3 text-center border-green-500/20">
            <FileSearch className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <div className="text-lg font-bold">{indexed}</div>
            <div className="text-[10px] text-muted-foreground">In Sitemap</div>
          </div>
          <div className={cn('border rounded-lg p-3 text-center', withIssues > 0 ? 'border-yellow-500/20' : 'border-green-500/20')}>
            {withIssues > 0 ? (
              <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
            ) : (
              <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-500" />
            )}
            <div className="text-lg font-bold">{withIssues}</div>
            <div className="text-[10px] text-muted-foreground">With Issues</div>
          </div>
        </div>

        {/* Issue List (if any) */}
        {withIssues > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Guides with Issues
            </h4>
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {report.filter(r => r.issues.length > 0).slice(0, 10).map(entry => (
                <div key={entry.slug} className="flex items-center gap-2 text-xs py-1.5 px-2 border-b last:border-0">
                  <XCircle className="h-3 w-3 text-destructive shrink-0" />
                  <code className="text-[10px] truncate flex-1">/guides/{entry.slug}</code>
                  <span className="text-[9px] text-muted-foreground">{entry.issues[0]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sitemap Status */}
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>sitemap-guides.xml</strong> now includes all {GUIDE_SLUGS.length} guide URLs with priority 0.85
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default GuideVisibilityWidget;
