/**
 * stripMarkdown — removes common markdown formatting (bold, italic, headings,
 * inline links, images) from catalog text so crawler-facing meta descriptions
 * never show literal `**` or `#` characters in search snippets.
 * Pure + dependency-free (also loaded by the build config).
 */
export function stripMarkdown(value: string | null | undefined): string {
  return String(value || '')
    // Images: keep the alt text, drop the URL.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Inline links: keep the link text, drop the URL.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Bold / italic emphasis markers.
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\b_([^_]+)_\b/g, '$1')
    // ATX heading hashes.
    .replace(/^#{1,6}\s+/gm, '')
    // Collapse whitespace left behind by removed markers.
    .replace(/\s+/g, ' ')
    .trim();
}
