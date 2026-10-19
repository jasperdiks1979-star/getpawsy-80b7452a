/** Read-time removal of specific unsupported supplier health claims.
 * Catalog records and product URLs are deliberately unchanged.
 */
export function neutralProductCopy(raw: string): string {
  return raw
    .replace(/\b(?:with\s+)?cervical\s+vertebra(?:e)?\s+protection(?:\s+for\s+cats)?\b/gi, '')
    .replace(/\bprotects?\s+(?:the\s+)?cervical\s+vertebra(?:e)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—,:;]\s*$/g, '')
    .trim();
}

export function neutralProductRecord<T extends { name?: string | null; name_clean?: string | null; description?: string | null }>(p: T): T {
  return {
    ...p,
    ...(typeof p.name === 'string' ? { name: neutralProductCopy(p.name) } : {}),
    ...(typeof p.name_clean === 'string' ? { name_clean: neutralProductCopy(p.name_clean) } : {}),
    ...(typeof p.description === 'string' ? { description: neutralProductCopy(p.description) } : {}),
  };
}