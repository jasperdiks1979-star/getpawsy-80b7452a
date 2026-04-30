/**
 * lpFunnelExport — client-side CSV exporter for `lp_funnel_events`.
 *
 * Pulls every event row in a date range (paged in 1k chunks to dodge the
 * Supabase default row cap), serializes to RFC-4180 CSV, and triggers a
 * browser download. All Clarity-tagged dimensions that we mirror to
 * Postgres come along for the ride: cohort, cta_variant, placement,
 * time_to_visible_ms, time_to_click_ms, dwell_ms, scroll depths,
 * is_first_click, first_click_placement, plus full UTM context.
 *
 * Use cases:
 *   - Offline pivots in Excel / Google Sheets
 *   - Feeding a notebook (pandas) without standing up a pipeline
 *   - Sharing a snapshot with a collaborator who doesn't have admin access
 */
import { supabase } from '@/integrations/supabase/client';

/** Columns exported, in the order they appear in the CSV. Kept in sync
 *  with the actual `lp_funnel_events` schema — adding a new column here
 *  is a single-line change. */
const COLUMNS = [
  'created_at',
  'session_id',
  'event_name',
  'placement',
  'cohort',
  'cta_variant',
  'page_path',
  'product_id',
  'product_name',
  'value',
  'lp_click_id',
  'lp_placement',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'funnel',
  'time_to_visible_ms',
  'time_to_click_ms',
  'dwell_ms',
  'scroll_depth_at_visible',
  'scroll_depth_at_click',
  'is_first_click',
  'first_click_placement',
  'is_internal',
] as const;

type Row = Record<(typeof COLUMNS)[number], unknown>;

export type LpFunnelExportOptions = {
  /** ISO start (inclusive). */
  startIso: string;
  /** ISO end (exclusive). */
  endIso: string;
  /** When false, internal/Founder Mode rows are filtered out (default). */
  includeInternal?: boolean;
  /** Optional cohort narrowing — null/undefined = both. */
  cohort?: 'first_session' | 'returning' | null;
  /** Per-batch page size (Supabase caps PostgREST at 1000 by default). */
  pageSize?: number;
  /** Progress callback so the UI can render "fetched 4321 / ?" updates. */
  onProgress?: (fetched: number) => void;
};

export type LpFunnelExportResult = {
  rowCount: number;
  csv: string;
};

/** RFC-4180 CSV cell escape — wraps in quotes when needed and doubles
 *  embedded quotes. Null/undefined become empty cells. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Pull all rows from `lp_funnel_events` in [startIso, endIso) using keyset
 *  pagination on (created_at, id). Keyset > offset because the table grows
 *  while we paginate. */
export async function fetchLpFunnelRows(
  opts: LpFunnelExportOptions,
): Promise<Row[]> {
  const pageSize = opts.pageSize ?? 1000;
  const includeInternal = opts.includeInternal ?? false;
  const out: Row[] = [];

  // Cursor — (created_at, id) so we can resume past rows that share the
  // same timestamp without skipping or duplicating any.
  let cursorTs: string | null = null;
  let cursorId: string | null = null;

  while (true) {
    let q = supabase
      .from('lp_funnel_events')
      .select(COLUMNS.join(','))
      .gte('created_at', opts.startIso)
      .lt('created_at', opts.endIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(pageSize);

    if (!includeInternal) q = q.or('is_internal.is.null,is_internal.eq.false');
    if (opts.cohort) q = q.eq('cohort', opts.cohort);
    if (cursorTs && cursorId) {
      // Keyset: rows strictly after the last (ts, id) we saw.
      q = q.or(
        `and(created_at.gt.${cursorTs}),and(created_at.eq.${cursorTs},id.gt.${cursorId})`,
      );
    }

    const { data, error } = await q;
    if (error) throw new Error(`Export failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Row & { id: string }>;
    if (rows.length === 0) break;
    out.push(...rows);
    opts.onProgress?.(out.length);
    if (rows.length < pageSize) break;
    const last = rows[rows.length - 1];
    cursorTs = String(last.created_at);
    cursorId = String(last.id);
  }

  return out;
}

/** Serialize rows to a CSV string with the canonical column order. */
export function rowsToCsv(rows: Row[]): string {
  const header = COLUMNS.join(',');
  const body = rows
    .map((r) => COLUMNS.map((c) => csvCell((r as Record<string, unknown>)[c])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

/** Convenience wrapper — fetch + serialize in one call. */
export async function exportLpFunnelCsv(
  opts: LpFunnelExportOptions,
): Promise<LpFunnelExportResult> {
  const rows = await fetchLpFunnelRows(opts);
  return { rowCount: rows.length, csv: rowsToCsv(rows) };
}

/** Trigger a browser download of the given CSV string under `filename`. */
export function downloadCsv(csv: string, filename: string): void {
  // Prepend a UTF-8 BOM so Excel auto-detects the encoding for EU users.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}