import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  PAGE_CHANGELOGS,
  type PageChangelogEntry,
  type PageChangelogKey,
} from '@/lib/page-changelogs';

/**
 * Loads changelog entries for a given page key.
 *
 * Strategy: try the admin-managed `page_changelog_entries` table first
 * (published rows only, sorted newest → oldest). If the table is empty or
 * unreachable, fall back to the bundled static `PAGE_CHANGELOGS` so the
 * policy pages never render empty for visitors / Googlebot.
 *
 * The hook is used by the public <PageChangelog /> component, which means
 * it must work for anonymous traffic — the table's RLS allows that for
 * `is_published = true` rows.
 */
export function usePageChangelog(pageKey: PageChangelogKey) {
  const [entries, setEntries] = useState<PageChangelogEntry[]>(
    PAGE_CHANGELOGS[pageKey] ?? [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('page_changelog_entries')
          .select('entry_date, build_tag, commit_ref, changes, sort_order')
          .eq('page_key', pageKey)
          .eq('is_published', true)
          .order('entry_date', { ascending: false })
          .order('sort_order', { ascending: false });
        if (cancelled) return;
        if (!error && data && data.length > 0) {
          setEntries(
            data.map((row) => ({
              date: row.entry_date,
              build: row.build_tag,
              commit: row.commit_ref,
              changes: (row.changes ?? []) as string[],
            })),
          );
        }
      } catch {
        // Static fallback already in state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  return { entries, loading };
}