import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, GitCommit, History, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { cn } from '@/lib/utils';
import { type PageChangelogKey } from '@/lib/page-changelogs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageChangelog } from '@/hooks/usePageChangelog';

/**
 * Canonical absolute origin used for all `@id`/`url` fields in the
 * structured-data emitted below. Hard-coded on purpose — the canonical
 * host is enforced sitewide (see HostnameGuard / useCanonical), and any
 * preview/staging host must NOT leak into JSON-LD because Google would
 * then index a non-canonical surface.
 */
const CANONICAL_HOST = 'https://getpawsy.pet';

/**
 * Maps each pageKey to the public route the changelog renders on.
 * Used to build the `mainEntityOfPage` URL inside the JSON-LD payload
 * so reviewers (and Google) can match the changelog dataset 1:1 to the
 * surface that was actually updated.
 */
const PAGE_PATHS: Record<PageChangelogKey, string> = {
  contact: '/contact',
  about: '/about',
  shipping: '/shipping',
  returns: '/return-policy',
  privacy: '/privacy-policy',
  terms: '/terms-of-service',
  cookies: '/cookie-policy',
};

const PAGE_LABELS: Record<PageChangelogKey, string> = {
  contact: 'Contact',
  about: 'About GetPawsy',
  shipping: 'Shipping Policy',
  returns: 'Return Policy',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  cookies: 'Cookie Policy',
};

interface PageChangelogProps {
  pageKey: PageChangelogKey;
  className?: string;
}

/**
 * Lookup result for a release record matched against a changelog entry's
 * `build` tag. We expose just enough metadata for the inline link.
 */
interface ReleaseLookup {
  id: string;
  status: string;
  completed_at: string | null;
}

/**
 * Inline, collapsible changelog block surfaced on contact + policy pages.
 *
 * Lists every recorded change with date, build/release tag and commit ref,
 * so Merchant Center reviewers and customers can audit exactly what changed
 * and when. Defaults to expanded on first paint, collapses on click.
 *
 * For admins, each entry whose `build` matches a `release_reports.title`
 * also renders a "View release" link that deep-links to the corresponding
 * row in the admin Release Status Timeline (`#release-<id>` anchor).
 */
export function PageChangelog({ pageKey, className }: PageChangelogProps) {
  const { entries } = usePageChangelog(pageKey);
  const [open, setOpen] = useState(true);
  const { isAdmin } = useAuth();
  const [releases, setReleases] = useState<Record<string, ReleaseLookup>>({});

  // Unique build tags present on this page — used to fetch matching releases.
  const buildTags = useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => e.build))).filter(Boolean),
    [entries],
  );

  // Fetch matching release_reports rows by title. Admin-only because RLS on
  // release_reports restricts SELECT to admins; non-admin reads simply return
  // no rows, so we skip the network round-trip entirely for visitors.
  useEffect(() => {
    if (!isAdmin || buildTags.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('release_reports')
        .select('id,title,status,completed_at,created_at')
        .in('title', buildTags)
        .order('created_at', { ascending: false });
      if (cancelled || error || !data) return;
      // Pick the most recent release per build tag (rows are pre-sorted desc).
      const map: Record<string, ReleaseLookup> = {};
      for (const row of data as Array<{ id: string; title: string; status: string; completed_at: string | null }>) {
        if (!map[row.title]) {
          map[row.title] = {
            id: row.id,
            status: row.status,
            completed_at: row.completed_at,
          };
        }
      }
      setReleases(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, buildTags]);

  if (!entries || entries.length === 0) return null;

  // Build a Dataset JSON-LD payload describing the page's changelog.
  //
  // We deliberately use `Dataset` + `hasPart: CreativeWork[]` rather than
  // plain `Article`s because:
  //   1. The changelog is a collection of versioned change records, not
  //      one editorial article — Dataset matches that semantic exactly.
  //   2. Google Search and third-party SEO auditors (Ahrefs, Sitebulb,
  //      OnCrawl) all parse `Dataset.dateModified` as the authoritative
  //      "freshness" signal for the host page, which is what we want for
  //      Merchant Center reviewers checking when policies were last revised.
  //   3. Each CreativeWork part keeps the build tag (as `version`) and the
  //      bullet points (as `description` + `text`) so an auditor can verify
  //      the diff without scraping the rendered HTML.
  const pagePath = PAGE_PATHS[pageKey];
  const pageLabel = PAGE_LABELS[pageKey];
  const pageUrl = `${CANONICAL_HOST}${pagePath}`;
  const datasetId = `${pageUrl}#changelog`;
  const latestDate = entries[0]?.date;
  const earliestDate = entries[entries.length - 1]?.date;

  const changelogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': datasetId,
    name: `${pageLabel} – page changelog`,
    description:
      `Versioned change log for the ${pageLabel} page on GetPawsy, ` +
      `listing every visible policy/content update with date, build tag and commit reference.`,
    url: datasetId,
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    license: `${CANONICAL_HOST}/terms-of-service`,
    creator: {
      '@type': 'Organization',
      name: 'GetPawsy',
      url: CANONICAL_HOST,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
      url: pageUrl,
      name: pageLabel,
    },
    ...(latestDate ? { dateModified: latestDate } : {}),
    ...(earliestDate ? { datePublished: earliestDate } : {}),
    variableMeasured: ['date', 'build', 'commit', 'changes'],
    hasPart: entries.map((entry, idx) => {
      const versionId = `${datasetId}-${entry.date}-${idx}`;
      return {
        '@type': 'CreativeWork',
        '@id': versionId,
        name: entry.build,
        version: entry.build,
        identifier: entry.commit,
        datePublished: entry.date,
        dateModified: entry.date,
        // Short summary first, full bullet body in `text` so both compact
        // SERP previews and full-evidence audits have what they need.
        description: entry.changes.slice(0, 2).join(' '),
        text: entry.changes.map((c) => `• ${c}`).join('\n'),
        isPartOf: { '@id': datasetId },
        about: {
          '@type': 'WebPage',
          '@id': pageUrl,
          url: pageUrl,
          name: pageLabel,
        },
      };
    }),
  };

  return (
    <section
      aria-label="Page changelog"
      className={cn(
        'rounded-2xl border border-border/60 bg-muted/30 p-5 my-8',
        className,
      )}
    >
      {/*
        Emit changelog structured data into <head> via Helmet so it lands in
        the initial HTML payload that Googlebot crawls — see
        seo/static-shell-and-pre-hydration-metadata. Helmet de-duplicates by
        innerHTML, so multiple <PageChangelog /> instances on the same page
        (shouldn't happen but be safe) won't double-emit.
      */}
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(changelogJsonLd)}
        </script>
      </Helmet>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground m-0">
            Page changelog
          </h2>
          <span className="text-xs text-muted-foreground">
            ({entries.length} {entries.length === 1 ? 'update' : 'updates'})
          </span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ol className="mt-4 space-y-4">
          {entries.map((entry, idx) => {
            const release = releases[entry.build];
            return (
              <li
                key={`${entry.date}-${idx}`}
                className="border-l-2 border-primary/40 pl-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <time dateTime={entry.date} className="font-medium text-foreground">
                    {entry.date}
                  </time>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {entry.build}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <GitCommit className="h-3 w-3" />
                    {entry.commit}
                  </span>
                  {release && (
                    <Link
                      to={`/admin/integrations/merchant#release-${release.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                      aria-label={`View release record for ${entry.build}`}
                    >
                      View release
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-foreground">
                  {entry.changes.map((c, i) => (
                    <li key={i} className="m-0">
                      {c}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
