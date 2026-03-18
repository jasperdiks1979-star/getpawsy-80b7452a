/**
 * MoneyPageBooster — Renders contextual link blocks that boost internal equity to the top 30 money pages.
 * 
 * Three block types:
 * 1. "Recommended Guides" — links to money-page guides in the same species silo
 * 2. "Top Picks in This Category" — links to money-page collections
 * 3. "Learn More About This Topic" — deep-link to a single high-priority guide
 * 
 * All links are crawlable <a> tags for Googlebot.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Star, Lightbulb } from 'lucide-react';
import {
  MONEY_PAGES,
  getMoneyPagesForCluster,
  type MoneyPage,
} from '@/lib/money-pages-booster';

interface MoneyPageBoosterProps {
  /** Current page path (to exclude self-links) */
  currentPath: string;
  /** Current cluster ID */
  cluster: string;
  /** Species silo */
  species: 'cat' | 'dog' | 'multi';
  /** Optional: override which block types to show */
  blocks?: ('recommended' | 'topPicks' | 'learnMore')[];
  /** Optional guide index for title resolution */
  guidesIndex?: Array<{ slug: string; title: string }>;
  className?: string;
}

function resolveTitle(path: string, guidesIndex?: Array<{ slug: string; title: string }>): string {
  const slug = path.split('/').pop() || '';
  if (guidesIndex) {
    const entry = guidesIndex.find(g => g.slug === slug);
    if (entry) return entry.title.split('–')[0].split('|')[0].trim();
  }
  return slug
    .replace(/^(best-|how-to-)/g, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(2026|2025)\b/, '($&)');
}

export function MoneyPageBooster({
  currentPath,
  cluster,
  species,
  blocks = ['recommended', 'topPicks', 'learnMore'],
  guidesIndex,
  className = '',
}: MoneyPageBoosterProps) {
  // Get money pages for same cluster + compatible species
  const sameCluster = getMoneyPagesForCluster(cluster).filter(mp => mp.path !== currentPath);
  
  // Cross-cluster money pages (same species only)
  const crossCluster = MONEY_PAGES.filter(mp => {
    if (mp.path === currentPath) return false;
    if (mp.cluster === cluster) return false;
    if (species === 'cat') return mp.species === 'cat';
    if (species === 'dog') return mp.species === 'dog' || mp.species === 'multi';
    return true;
  }).sort((a, b) => b.boost - a.boost).slice(0, 4);

  const guidePages = [...sameCluster, ...crossCluster].filter(mp => mp.type === 'guide');
  const collectionPages = [...sameCluster, ...crossCluster].filter(mp => mp.type === 'collection');

  if (guidePages.length === 0 && collectionPages.length === 0) return null;

  // Rotate anchor types per rendering
  let anchorCounter = 0;
  const getAnchor = (mp: MoneyPage): { text: string; type: string } => {
    const types: ('exact' | 'partial' | 'semantic')[] = ['exact', 'partial', 'semantic'];
    const t = types[anchorCounter % 3];
    anchorCounter++;
    return { text: mp.anchors[t], type: t };
  };

  return (
    <nav className={`py-8 space-y-8 ${className}`} aria-label="Priority guides and collections">
      {/* Recommended Guides */}
      {blocks.includes('recommended') && guidePages.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Recommended Guides
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {guidePages.slice(0, 6).map(mp => {
              const { text } = getAnchor(mp);
              return (
                <Link
                  key={mp.path}
                  to={mp.path}
                  className="group flex flex-col gap-1 rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                    {resolveTitle(mp.path, guidesIndex)}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {text}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Read guide <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Top Picks in This Category */}
      {blocks.includes('topPicks') && collectionPages.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Top Picks in This Category
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {collectionPages.slice(0, 4).map(mp => {
              const { text } = getAnchor(mp);
              return (
                <Link
                  key={mp.path}
                  to={mp.path}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-muted hover:bg-primary/10 text-foreground hover:text-primary transition-colors"
                >
                  {text}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Learn More About This Topic */}
      {blocks.includes('learnMore') && sameCluster.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              In-Depth Buying Advice
            </h3>
          </div>
          {sameCluster.filter(mp => mp.type === 'guide').slice(0, 2).map(mp => (
            <Link
              key={mp.path}
              to={mp.path}
              className="group flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card hover:border-primary/30 transition-all mb-2"
            >
              <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors block">
                  {resolveTitle(mp.path, guidesIndex)}
                </span>
                <span className="text-xs text-muted-foreground">{mp.anchors.semantic}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary ml-auto transition-colors" />
            </Link>
          ))}
        </section>
      )}
    </nav>
  );
}
