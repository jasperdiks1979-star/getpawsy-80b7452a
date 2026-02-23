/**
 * IntentInternalLinks — Tier 3 internal link block for sub-intent pages.
 * Links to: back to pillar + 3 sibling intents + 1 cross-cluster pillar.
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  type SeoPillar,
  type SeoIntent,
  type SeoNamespace,
  getSiblingIntents,
  getCrossClusterPillars,
} from '@/lib/seo-route-config';

interface Props {
  pillar: SeoPillar;
  intent: SeoIntent;
  namespace: SeoNamespace;
}

export function IntentInternalLinks({ pillar, intent, namespace }: Props) {
  const siblings = getSiblingIntents(namespace, pillar.slug, intent.slug).slice(0, 3);
  const crossPillars = getCrossClusterPillars(pillar.slug).slice(0, 1);

  return (
    <section className="mb-16 bg-muted/30 rounded-2xl p-6 md:p-10">
      <h2 className="text-2xl font-display font-bold mb-1">Continue Reading</h2>
      <p className="text-muted-foreground text-sm mb-6">More expert guides in this series.</p>

      {/* Back to pillar */}
      <Link
        to={`/${namespace}/${pillar.slug}`}
        className="group flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4 hover:bg-primary/10 transition-colors"
      >
        <span className="text-sm font-semibold text-primary">← Back to {pillar.h1}</span>
      </Link>

      {/* Sibling intents */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {siblings.map(s => (
          <Link
            key={s.slug}
            to={`/${namespace}/${pillar.slug}/${s.slug}`}
            className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{s.h1}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{s.intro.substring(0, 80)}...</p>
            <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              Read guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>

      {/* Cross-cluster pillar */}
      {crossPillars.length > 0 && (
        <div className="border-t border-border/50 pt-4">
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Also explore</h3>
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
