// Pure helpers for the PCIE2 duplicate comparison set (no Deno/npm imports; unit-tested).
export type RecentRow = { id: string; headline: string | null };

/** Headlines to compare against, excluding the row currently being scored (self-match fix). */
export function recentExcludingSelf(recent: RecentRow[], selfId: string | null | undefined): string[] {
  return recent
    .filter((r) => !selfId || r.id !== selfId)
    .map((r) => r.headline)
    .filter((h): h is string => Boolean(h));
}
