/**
 * SEO Console — Admin/Dev only
 * Shows: pages per niche, keywords assigned, internal link graph, missing meta/schema.
 * Access: /admin/seo-console (dev/admin only)
 */
// Layout removed — AdminLayout provides admin shell
import { NICHE_KEYWORD_RESEARCH } from '@/data/niche-keyword-research';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Helmet } from 'react-helmet-async';

export default function SeoConsole() {
  const totalKeywords = NICHE_KEYWORD_RESEARCH.reduce(
    (sum, n) => sum + n.supporting_keywords.length, 0
  );

  const allInternalLinks = NICHE_KEYWORD_RESEARCH.flatMap(n =>
    n.supporting_keywords.flatMap(k => k.internal_link_targets)
  );
  const uniqueInternalLinks = new Set(allInternalLinks);

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>SEO Console | GetPawsy Admin</title>
      </Helmet>
      <div className="container py-8 max-w-5xl">
        <h1 className="text-3xl font-display font-bold mb-6">SEO Console</h1>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Niches</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{NICHE_KEYWORD_RESEARCH.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Keywords</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalKeywords}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Internal Links</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{uniqueInternalLinks.size}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pages Created</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{NICHE_KEYWORD_RESEARCH.length * 2}</p></CardContent>
          </Card>
        </div>

        {/* Per-Niche Detail */}
        {NICHE_KEYWORD_RESEARCH.map((niche) => {
          const transactional = niche.supporting_keywords.filter(k => k.intent === 'transactional');
          const informational = niche.supporting_keywords.filter(k => k.intent === 'informational');
          return (
            <Card key={niche.id} className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  {niche.name}
                  <Badge variant="secondary">{niche.primary_keyword}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium mb-1">Shop Page</p>
                    <a href={niche.shop_page} className="text-primary text-sm hover:underline">{niche.shop_page}</a>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Guide Page</p>
                    <a href={niche.guide_page} className="text-primary text-sm hover:underline">{niche.guide_page}</a>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm font-medium mb-2">Transactional Keywords ({transactional.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {transactional.map(k => (
                      <Badge key={k.keyword} variant="outline" className="text-xs">
                        {k.keyword} <span className="ml-1 text-muted-foreground">({k.estimated_volume_range})</span>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Informational Keywords ({informational.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {informational.map(k => (
                      <Badge key={k.keyword} variant="outline" className="text-xs bg-muted/50">
                        {k.keyword} <span className="ml-1 text-muted-foreground">({k.estimated_volume_range})</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
