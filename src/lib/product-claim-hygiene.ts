/** Read-time removal of specific unsupported supplier health claims.
 * Catalog records and product URLs are deliberately unchanged.
 */
export function neutralProductCopy(raw: string): string {
  return raw
    .replace(/\b(?:with\s+)?cervical\s+vertebra(?:e)?\s+protection(?:\s+for\s+cats)?\b/gi, '')
    .replace(/\bprotects?\s+(?:the\s+)?cervical\s+vertebra(?:e)?\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*[-–—,:;]\s*$/g, '')
    .trim();
}

export function neutralProductRecord<T extends { name?: string | null; name_clean?: string | null; description?: string | null }>(p: T): T {
  // This exact SKU's stored description consists of unevidenced posture,
  // digestion, regurgitation and bloating promises. Retain only documented
  // elevated bowl design; no material, health or performance assertions.
  const bowl = (p as T & { id?: string }).id === '6ba6b3c8-d055-46df-8e6a-e6ee9ff98272';
  return {
    ...p,
    ...(typeof p.name === 'string' ? { name: neutralProductCopy(p.name) } : {}),
    ...(typeof p.name_clean === 'string' ? { name_clean: neutralProductCopy(p.name_clean) } : {}),
    ...(bowl ? { description: 'An elevated cat feeding bowl. Check the selected option and product images before ordering.' } : typeof p.description === 'string' ? { description: neutralProductCopy(p.description) } : {}),
  };
}