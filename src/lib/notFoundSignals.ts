/**
 * Not-found crawler signals.
 *
 * index.html ships a static `index, follow` robots meta and a self-referencing
 * canonical. Helmet adds its own `noindex` tag next to them instead of
 * replacing them, so a 404 page carried two conflicting robots tags plus a
 * self-canonical. This normalises every robots/googlebot meta to
 * `noindex, nofollow` and drops the canonical href so the page is unambiguous.
 * Returns a restore function so client-side navigation away from the 404
 * does not leave the next page with a stale noindex.
 */
export function applyNotFoundSignals(doc: Document = document): () => void {
  const saved: Array<() => void> = [];
  doc.querySelectorAll('meta[name="robots"], meta[name="googlebot"]').forEach((m) => {
    if (m.hasAttribute('data-rh')) return; // Helmet manages its own tag
    const prev = m.getAttribute('content');
    m.setAttribute('content', 'noindex, nofollow');
    saved.push(() => (prev === null ? m.removeAttribute('content') : m.setAttribute('content', prev)));
  });
  doc.querySelectorAll('link[rel="canonical"]').forEach((l) => {
    const prev = l.getAttribute('href');
    if (prev === null) return;
    l.removeAttribute('href');
    saved.push(() => {
      if (!l.hasAttribute('href')) l.setAttribute('href', prev);
    });
  });
  return () => saved.forEach((r) => r());
}
