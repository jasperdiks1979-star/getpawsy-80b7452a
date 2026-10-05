/**
 * GuideClusterNav — "More on <topic>" block for guides in an SEO cluster:
 * one link to the canonical collection, then the pillar and sibling guides.
 * Mirrors the prerendered aside (vite-plugin-prerender-guides buildClusterNav).
 */
import { Link } from 'react-router-dom';
import { useGuidesList } from '@/hooks/useGuides';
import { clusterForGuide } from '@/lib/seo-clusters';

export function GuideClusterNav({ slug }: { slug: string }) {
  const cluster = clusterForGuide(slug);
  const { data: guides } = useGuidesList();
  if (!cluster) return null;
  const titles = new Map((guides || []).map((g) => [g.slug, g.title]));
  const siblings = [cluster.pillar, ...cluster.supporting].filter((s) => s !== slug && titles.has(s));

  return (
    <aside aria-label="Related guides" className="mt-10 rounded-lg border border-border bg-muted/40 p-5">
      <h2 className="text-lg font-semibold text-foreground">More on {cluster.label.toLowerCase()}</h2>
      <p className="mt-2 text-sm">
        <Link to={`/collections/${cluster.collection}`} className="text-primary underline-offset-4 hover:underline">
          Shop {cluster.label.toLowerCase()}
        </Link>
      </p>
      {siblings.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {siblings.map((s) => (
            <li key={s}>
              <Link to={`/guides/${s}`} className="text-foreground underline-offset-4 hover:underline">
                {titles.get(s)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
