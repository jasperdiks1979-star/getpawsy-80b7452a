/**
 * Import/export helpers for job_retry_policies.
 *
 * Supports two interchange formats:
 *  - JSON: full structured payload with envelope metadata.
 *  - CSV : flat spreadsheet-friendly format (RFC-4180 compliant).
 *
 * Both formats are loss-less for the configuration columns:
 *   provider, job_type, max_attempts, backoff_minutes, enabled, notes
 *
 * `id`, `created_at`, `updated_at` are intentionally NOT re-imported — new IDs
 * are generated on insert so the same export can be re-applied to a different
 * environment without UUID collisions.
 */

export interface ExportablePolicy {
  provider: string | null;
  job_type: string | null;
  max_attempts: number | null;
  backoff_minutes: number[] | null;
  enabled: boolean;
  notes: string | null;
}

export interface PolicyRowLike extends ExportablePolicy {
  id?: string;
  created_at?: string;
  updated_at?: string;
}

const JSON_SCHEMA_VERSION = 1;
const CSV_HEADERS = [
  'provider',
  'job_type',
  'max_attempts',
  'backoff_minutes',
  'enabled',
  'notes',
] as const;

function pickExport(row: PolicyRowLike): ExportablePolicy {
  return {
    provider: row.provider ?? null,
    job_type: row.job_type ?? null,
    max_attempts: row.max_attempts ?? null,
    backoff_minutes: Array.isArray(row.backoff_minutes) ? row.backoff_minutes : null,
    enabled: !!row.enabled,
    notes: row.notes ?? null,
  };
}

/* ---------------------------------------------------------------- JSON --- */

export function buildPoliciesJson(rows: PolicyRowLike[]): string {
  const payload = {
    schema: 'getpawsy.job_retry_policies',
    version: JSON_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    count: rows.length,
    policies: rows.map(pickExport),
  };
  return JSON.stringify(payload, null, 2);
}

export interface ParseResult {
  valid: ExportablePolicy[];
  errors: string[];
}

/** Validate one raw record. Returns either a normalised policy or an error string. */
function normalisePolicy(raw: unknown, rowLabel: string): ExportablePolicy | string {
  if (!raw || typeof raw !== 'object') return `${rowLabel}: niet een object`;
  const r = raw as Record<string, unknown>;

  const provider =
    r.provider === '' || r.provider === null || r.provider === undefined
      ? null
      : String(r.provider).trim();
  const job_type =
    r.job_type === '' || r.job_type === null || r.job_type === undefined
      ? null
      : String(r.job_type).trim();

  if (!provider && !job_type) {
    return `${rowLabel}: provider OF job_type vereist`;
  }
  const idRe = /^[a-z0-9_-]+$/i;
  if (provider && !idRe.test(provider)) {
    return `${rowLabel}: provider "${provider}" bevat ongeldige tekens`;
  }
  if (job_type && !idRe.test(job_type)) {
    return `${rowLabel}: job_type "${job_type}" bevat ongeldige tekens`;
  }

  let max_attempts: number | null = null;
  if (r.max_attempts !== null && r.max_attempts !== undefined && r.max_attempts !== '') {
    const n = Number(r.max_attempts);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      return `${rowLabel}: max_attempts moet 1–20 zijn`;
    }
    max_attempts = n;
  }

  let backoff_minutes: number[] | null = null;
  const rawBackoff = r.backoff_minutes;
  if (Array.isArray(rawBackoff)) {
    if (rawBackoff.length > 20) return `${rowLabel}: backoff_minutes max 20 stappen`;
    const parsed: number[] = [];
    for (const v of rawBackoff) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 10080) {
        return `${rowLabel}: backoff waarde "${v}" buiten 0–10080`;
      }
      parsed.push(n);
    }
    backoff_minutes = parsed.length > 0 ? parsed : null;
  } else if (typeof rawBackoff === 'string' && rawBackoff.trim() !== '') {
    const parts = rawBackoff.split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (parts.length > 20) return `${rowLabel}: backoff_minutes max 20 stappen`;
    const parsed: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0 || n > 10080) {
        return `${rowLabel}: backoff waarde "${p}" buiten 0–10080`;
      }
      parsed.push(n);
    }
    backoff_minutes = parsed.length > 0 ? parsed : null;
  }

  let enabled = true;
  if (r.enabled !== undefined && r.enabled !== null && r.enabled !== '') {
    if (typeof r.enabled === 'boolean') enabled = r.enabled;
    else {
      const s = String(r.enabled).trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'aan', 'on'].includes(s)) enabled = true;
      else if (['false', '0', 'no', 'n', 'uit', 'off'].includes(s)) enabled = false;
      else return `${rowLabel}: enabled "${r.enabled}" niet herkend (true/false)`;
    }
  }

  const notes =
    r.notes === '' || r.notes === null || r.notes === undefined
      ? null
      : String(r.notes).slice(0, 500);

  return { provider, job_type, max_attempts, backoff_minutes, enabled, notes };
}

export function parsePoliciesJson(text: string): ParseResult {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { valid: [], errors: [`Ongeldige JSON: ${(e as Error).message}`] };
  }
  // Accept either bare array OR enveloped { policies: [...] }.
  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).policies)) {
    list = (parsed as any).policies;
  } else {
    return { valid: [], errors: ['JSON moet een array zijn of een { policies: [...] } object'] };
  }

  const valid: ExportablePolicy[] = [];
  list.forEach((row, i) => {
    const result = normalisePolicy(row, `policy[${i}]`);
    if (typeof result === 'string') errors.push(result);
    else valid.push(result);
  });
  return { valid, errors };
}

/* ----------------------------------------------------------------- CSV --- */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildPoliciesCsv(rows: PolicyRowLike[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(csvCell).join(','));
  for (const row of rows) {
    const e = pickExport(row);
    lines.push(
      [
        e.provider ?? '',
        e.job_type ?? '',
        e.max_attempts ?? '',
        e.backoff_minutes ? e.backoff_minutes.join(' ') : '',
        e.enabled ? 'true' : 'false',
        e.notes ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

/** Minimal RFC-4180 CSV parser supporting quoted fields, escaped quotes, and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing empty rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parsePoliciesCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { valid: [], errors: ['CSV is leeg'] };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const required = ['provider', 'job_type'];
  for (const col of required) {
    if (!header.includes(col)) {
      return { valid: [], errors: [`CSV mist kolom "${col}"`] };
    }
  }
  const idx = (name: string) => header.indexOf(name);
  const valid: ExportablePolicy[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const raw: Record<string, unknown> = {
      provider: r[idx('provider')] ?? '',
      job_type: r[idx('job_type')] ?? '',
      max_attempts: idx('max_attempts') >= 0 ? r[idx('max_attempts')] : '',
      // Backoff in CSV is space- or comma-separated inside one cell.
      backoff_minutes:
        idx('backoff_minutes') >= 0
          ? (r[idx('backoff_minutes')] ?? '').replace(/\s+/g, ',')
          : '',
      enabled: idx('enabled') >= 0 ? r[idx('enabled')] : 'true',
      notes: idx('notes') >= 0 ? r[idx('notes')] : '',
    };
    const result = normalisePolicy(raw, `rij ${i + 1}`);
    if (typeof result === 'string') errors.push(result);
    else valid.push(result);
  }
  return { valid, errors };
}

/* ---------------------------------------------------------- Downloader --- */

export function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([mime.startsWith('text/csv') ? '\uFEFF' + content : content], {
    type: `${mime};charset=utf-8;`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}