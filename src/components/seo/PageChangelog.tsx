import { useState } from 'react';
import { ChevronDown, GitCommit, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_CHANGELOGS, type PageChangelogKey } from '@/lib/page-changelogs';

interface PageChangelogProps {
  pageKey: PageChangelogKey;
  className?: string;
}

/**
 * Inline, collapsible changelog block surfaced on contact + policy pages.
 *
 * Lists every recorded change with date, build/release tag and commit ref,
 * so Merchant Center reviewers and customers can audit exactly what changed
 * and when. Defaults to expanded on first paint, collapses on click.
 */
export function PageChangelog({ pageKey, className }: PageChangelogProps) {
  const entries = PAGE_CHANGELOGS[pageKey];
  const [open, setOpen] = useState(true);

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
          {entries.map((entry, idx) => (
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
              </div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-foreground">
                {entry.changes.map((c, i) => (
                  <li key={i} className="m-0">
                    {c}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
