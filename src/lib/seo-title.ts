/**
 * Search-title hygiene for guides: removes testing/ranking/authority claims the
 * catalog cannot evidence ("Tested", "Ranked", "Vet-Backed", "Crash-Tested",
 * "Expert", "Proven", "Airline-Approved", "Safest"), drops filler and duplicate
 * brand/shipping suffixes, and keeps titles ≤ 65 chars. On-page H1s are untouched.
 * Pure + dependency-free (also loaded by the build config).
 */
const MAX = 65;
const BRAND = ' | GetPawsy';

export function sanitizeGuideSeoTitle(raw: string): string {
  let t = ` ${raw} `;
  // Trailing brand / shipping suffixes (re-added once below).
  t = t.replace(/\s*\|\s*(GetPawsy|Pawsy Guide|Free (US )?Shipping)\b/gi, ' ');
  t = t.replace(/\s*[—–-]\s*Complete Guide for Pet Parents/gi, ' ');
  t = t.replace(/\bCompared\s*(&amp;|&|and)\s*Ranked\b/gi, 'Compared');
  t = t.replace(/\s*[–—-]\s*Tested\s+for\b/gi, ' for');
  t = t.replace(/\bTested on [^–—|()]+/gi, ' ');
  t = t.replace(/\b[A-Za-z]+-Level Tested\b/gi, ' ');
  t = t.replace(/\bAirline-Approved\s*(&amp;|&|and)?\s*/gi, ' ');
  t = t.replace(/\b(Crash-Tested|Vet-Backed|Expert|Proven|Ranked|Tested)\b/gi, ' ');
  t = t.replace(/\bVet Solutions\b/gi, 'Solutions');
  t = t.replace(/\bSafest\s+/gi, '');
  // Tidy leftovers.
  t = t.replace(/\s*(&amp;|&)\s*(?=[)–—|]|$|\s*\()/g, ' ');
  t = t.replace(/\(\s*\)/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[–—-]\s*(?=\(|$)/g, ' ').replace(/^[–—-]\s*/, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*[–—]\s*[–—]\s*/g, ' – ');
  t = t.replace(/[–—:,&]\s*$/, '').trim();
  if (t.length + BRAND.length <= MAX) return t + BRAND;
  if (t.length <= MAX) return t;
  // Too long: drop the subtitle after the last dash separator, keep a (year).
  const year = (t.match(/\((20\d\d)\)/) || [])[0];
  const sep = Math.max(t.lastIndexOf(' – '), t.lastIndexOf(' — '));
  if (sep > 20) {
    let head = t.slice(0, sep).trim();
    if (year && !head.includes(year)) head = `${head} ${year}`;
    if (head.length + BRAND.length <= MAX) return head + BRAND;
    if (head.length <= MAX) return head;
    t = head;
  }
  const cut = t.slice(0, MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
