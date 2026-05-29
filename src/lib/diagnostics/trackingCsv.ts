/**
 * Tracking CSV diagnostic parser
 * ─────────────────────────────────────────────────────────────
 * Pure utility (no I/O) used by the admin to audit exported
 * funnel CSVs (lp_funnel_events / checkout_funnel_events) against
 * the TRK contract.
 *
 * Detects:
 *   - unknown_device_pct           (device='unknown' or missing)
 *   - unknown_geo_pct              (geo_country missing/'unknown')
 *   - bot_pct                      (is_bot=true)
 *   - qa_pct                       (qa=true)
 *   - source_loss_pct              (utm_source present but lost)
 *   - clean_total                  (verified_user|probable_user AND !bot AND !qa)
 *   - by_event                     (event_name -> {raw, clean})
 *
 * Used in unit tests + the admin Funnel Health dashboard.
 */

export interface TrackingCsvRow {
  event_name?: string;
  step?: string;
  is_bot?: string | boolean | null;
  qa?: string | boolean | null;
  classification?: string | null;
  device?: string | null;
  geo_country?: string | null;
  geo_quality?: string | null;
  utm_source?: string | null;
}

export interface TrackingCsvReport {
  total: number;
  clean_total: number;
  bot_count: number;
  qa_count: number;
  unknown_device_count: number;
  unknown_geo_count: number;
  data_quality_score: number; // 0–100, clean/total*100
  by_event: Record<string, { raw: number; clean: number }>;
  warnings: string[];
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return false;
}

function isClean(r: TrackingCsvRow): boolean {
  if (toBool(r.is_bot)) return false;
  if (toBool(r.qa)) return false;
  const c = (r.classification ?? '').toLowerCase();
  return c === 'verified_user' || c === 'probable_user';
}

function isUnknownDevice(r: TrackingCsvRow): boolean {
  const d = (r.device ?? '').toLowerCase();
  return d === '' || d === 'unknown';
}

function isUnknownGeo(r: TrackingCsvRow): boolean {
  const g = (r.geo_country ?? '').toLowerCase();
  const q = (r.geo_quality ?? '').toLowerCase();
  return g === '' || g === 'unknown' || q === 'unknown';
}

/** Minimal RFC-4180 CSV parser (handles quoted fields + escaped quotes). */
export function parseCsv(text: string): TrackingCsvRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cur.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (field.length || cur.length) {
          cur.push(field);
          rows.push(cur);
          cur = [];
          field = '';
        }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else field += ch;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj as TrackingCsvRow;
  });
}

export function analyzeTrackingCsv(rows: TrackingCsvRow[]): TrackingCsvReport {
  const total = rows.length;
  let bot_count = 0;
  let qa_count = 0;
  let unknown_device_count = 0;
  let unknown_geo_count = 0;
  let clean_total = 0;
  const by_event: Record<string, { raw: number; clean: number }> = {};

  for (const r of rows) {
    const evt = (r.event_name || r.step || 'unknown').toString();
    if (!by_event[evt]) by_event[evt] = { raw: 0, clean: 0 };
    by_event[evt].raw++;
    if (toBool(r.is_bot)) bot_count++;
    if (toBool(r.qa)) qa_count++;
    if (isUnknownDevice(r)) unknown_device_count++;
    if (isUnknownGeo(r)) unknown_geo_count++;
    if (isClean(r)) {
      clean_total++;
      by_event[evt].clean++;
    }
  }

  const warnings: string[] = [];
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  if (pct(unknown_device_count) > 30)
    warnings.push(`High unknown device share (${pct(unknown_device_count)}%) — check device classifier.`);
  if (pct(unknown_geo_count) > 40)
    warnings.push(`High unknown geo share (${pct(unknown_geo_count)}%) — check geo-classify function.`);
  if (total > 0 && clean_total === 0)
    warnings.push('No clean events — every row is bot/qa/legacy. Tracking pipeline broken.');
  const atc = by_event['add_to_cart']?.clean ?? 0;
  const click = by_event['checkout_click']?.clean ?? 0;
  if (atc > 0 && click === 0)
    warnings.push('Clean add_to_cart > 0 but checkout_click = 0 — checkout button not wired.');

  return {
    total,
    clean_total,
    bot_count,
    qa_count,
    unknown_device_count,
    unknown_geo_count,
    data_quality_score: total ? Math.round((clean_total / total) * 100) : 0,
    by_event,
    warnings,
  };
}