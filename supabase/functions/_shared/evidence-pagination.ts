// Bounded, fail-closed PostgREST evidence pagination.
// Pages MUST be sorted by a stable unique key (e.g. created_at, id).
// Concurrent modifications can shift offset pages: reject duplicate IDs and
// inconsistent exact counts instead of silently classifying partial evidence.
export interface EvidencePage<T> {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
}
export interface EvidencePaginationOptions {
  pageSize?: number;
  maxRows?: number;
  deadline?: number;
  now?: () => number;
}
export async function fetchEvidencePages<T extends { id: string }>(
  fetchPage: (offset: number, pageSize: number) => Promise<EvidencePage<T>>,
  label: string,
  options: EvidencePaginationOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 500;
  const maxRows = options.maxRows ?? 10000;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000 ||
      !Number.isSafeInteger(maxRows) || maxRows < pageSize) {
    throw new Error(`${label} invalid pagination limits`);
  }
  const rows: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | null = null;
  while (true) {
    if (options.deadline !== undefined && now() >= options.deadline) {
      throw new Error(`${label} evidence pagination deadline exceeded`);
    }
    const page = await fetchPage(rows.length, pageSize);
    if (page.error) throw new Error(`${label} evidence read: ${page.error.message}`);
    if (page.count === null || !Number.isSafeInteger(page.count) || page.count < 0) {
      throw new Error(`${label} exact evidence count unavailable`);
    }
    if (expectedCount === null) {
      expectedCount = page.count;
      if (expectedCount > maxRows) throw new Error(`${label} evidence exceeds safety limit ${maxRows}`);
    } else if (page.count !== expectedCount) {
      throw new Error(`${label} evidence count changed during pagination`);
    }
    const part = page.data ?? [];
    if (part.length === 0 && rows.length < expectedCount) {
      throw new Error(`${label} evidence pagination returned an incomplete page`);
    }
    if (part.length > pageSize || rows.length + part.length > expectedCount) {
      throw new Error(`${label} evidence page size inconsistent`);
    }
    for (const item of part) {
      if (!item.id || ids.has(item.id)) throw new Error(`${label} evidence duplicate/invalid ID`);
      ids.add(item.id);
      rows.push(item);
    }
    if (rows.length === expectedCount) return rows;
    if (part.length < pageSize) {
      throw new Error(`${label} evidence truncated before exact count`);
    }
  }
}
