/**
 * Card-only display tidy-up for supplier titles. Never changes product
 * identity, slug or SEO metadata — it only fixes spacing around dashes and
 * trims trailing spec lists so cards read cleanly.
 */
export function cardTitle(name: string, max = 64): string {
  let t = (name ?? '')
    .replace(/\s*[–—]\s*/g, ' – ')
    .replace(/\s+-\s*|\s*-\s+/g, ' – ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s–,]+|[\s–,]+$/g, '')
    .trim();
  if (t.length <= max) return t;
  // Prefer cutting at a natural separator before the limit.
  const head = t.slice(0, max);
  const cut = Math.max(head.lastIndexOf(' – '), head.lastIndexOf(', '), head.lastIndexOf(' with '));
  t = cut > 24 ? head.slice(0, cut) : head.slice(0, head.lastIndexOf(' ')) ;
  return t.replace(/[\s–,]+$/g, '').trim();
}
