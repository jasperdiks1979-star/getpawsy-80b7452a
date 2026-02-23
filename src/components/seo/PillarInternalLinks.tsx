/**
 * PillarInternalLinks — Tier 2 internal link block for pillar pages.
 * Links to: all intents + 1 cross-cluster pillar.
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { type SeoPillar, type SeoNamespace, getCrossClusterPillars } from '@/lib/seo-route-config';

interface Props {
  pillar: SeoPillar;
  namespace: SeoNamespace;
}

export function PillarInternalLinks({ pillar, namespace }: Props) {
  const crossPillars = getCrossClusterPillars(pillar.slug);

  return (
    <section className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
      <h2 className="text-2xl font-display font-bold mb-1">Explore More Expert Guides</h2>
      <p className="text-muted-foreground text-sm mb-6">In-depth research and buying advice from our pet product team.</p>

      {/* Intent links */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {pillar.intents.map(intent => (
          <Link
            key={intent.slug}
            to={`/${namespace}/${pillar.slug}/${intent.slug}`}
            className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{intent.h1}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{intent.intro.substring(0, 100)}...</p>
            <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              Read guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>

      {/* Cross-cluster links */}
      {crossPillars.length > 0 && (
        <div className="border-t border-border/50 pt-6">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Related Guides</h3>
          <div className="flex flex-wrap gap-3">
            {crossPillars.map(cp => (
              <Link
                key={cp.slug}
                to={`/${cp.namespace}/${cp.slug}`}
                className="text-sm text-primary hover:underline font-medium"
              >
                {cp.h1} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
