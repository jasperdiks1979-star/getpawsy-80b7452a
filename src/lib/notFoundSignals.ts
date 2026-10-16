/**
 * Not-found crawler signals.
 *
 * index.html ships a static `index, follow` robots meta and a self-referencing
 * canonical. Helmet adds its own `noindex` tag next to them instead of
 * replacing them, so a 404 page carried two conflicting robots tags plus a
 * self-canonical. This normalises every robots/googlebot meta to
 * `noindex, nofollow` and drops the canonical href so the page is unambiguous.
 */
export function applyNotFoundSignals(doc: Document = document): void {
  doc
    .querySelectorAll('meta[name="robots"], meta[name="googlebot"]')
    .forEach((m) => m.setAttribute('content', 'noindex, nofollow'));
  doc.querySelectorAll('link[rel="canonical"]').forEach((l) => l.removeAttribute('href'));
}
