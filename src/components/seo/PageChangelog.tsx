import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, GitCommit, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PAGE_CHANGELOGS, type PageChangelogKey } from '@/lib/page-changelogs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const entries = PAGE_CHANGELOGS[pageKey];
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

  return (
    <section
      aria-label="Page changelog"
      className={cn(
        'rounded-2xl border border-border/60 bg-muted/30 p-5 my-8',
        className,
      )}
    >
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
