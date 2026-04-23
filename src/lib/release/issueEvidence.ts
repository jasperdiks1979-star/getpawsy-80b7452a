/**
 * Maps a `release_report_issues.issue_key` to the concrete evidence the
 * admin needs to act on it: the affected feed field, a link to the source
 * (live merchant feed + per-item product PDP / image URL), and short
 * snippets pulled from the validation `sampleResults` payload.
 *
 * The validate-merchant-feed edge function emits one entry per sampled
 * item with booleans + an `issues: string[]` (e.g. `image_invalid:404:text/html`).
 * We re-derive the failed field per reason so each issue card can show
 * "which products tripped this and why".
 */

export interface SampleResult {
  id: string;
  title: boolean;
  price: boolean;
  availability: boolean;
  image_link: boolean;
  image_status: number | null;
  shipping_weight: boolean;
  weight_value: string | null;
  issues: string[];
}

export interface IssueEvidence {
  /** Human label for the failing Google Shopping feed attribute. */
  feedField: string;
  /** Tag name as it appears in the XML feed (`<g:image_link>`, etc.). */
  feedTag: string;
  /** Short why-it-matters note for reviewers. */
  hint: string;
  /** Live merchant-feed URL — always linkable. */
  feedUrl: string;
  /** Up to N affected items with snippets. */
  items: Array<{
    productId: string;
    snippet: string;
    productAdminUrl: string;
  }>;
  /** Total affected count (may exceed `items.length` due to display cap). */
  totalAffected: number;
}

const FEED_URL = 'https://getpawsy.pet/merchant-feed.xml';

/**
 * Per-reason metadata. Keys match the strings emitted by
 * `validate-merchant-feed` in `failReasons` / per-item `issues[]`
 * (prefix-matched, since some include `:status:content-type` suffixes).
 */
const REASON_META: Record<string, { feedField: string; feedTag: string; hint: string }> = {
  missing_title: {
    feedField: 'title',
    feedTag: '<g:title>',
    hint: 'GMC vereist een unieke, beschrijvende producttitel (≤150 tekens).',
  },
  missing_price: {
    feedField: 'price',
    feedTag: '<g:price>',
    hint: 'Prijs moet aanwezig zijn met ISO valutacode (bv. "29.99 USD").',
  },
  missing_availability: {
    feedField: 'availability',
    feedTag: '<g:availability>',
    hint: 'Verplicht: in_stock / out_of_stock / preorder / backorder.',
  },
  missing_shipping_weight: {
    feedField: 'shipping_weight',
    feedTag: '<g:shipping_weight>',
    hint: 'Voor US-shipping moet elk product een gewicht in kg of lb hebben.',
  },
  weight_out_of_range: {
    feedField: 'shipping_weight',
    feedTag: '<g:shipping_weight>',
    hint: 'Gewicht ligt buiten 1–25 kg. Normaliseer in merchant-sync.',
  },
  image_invalid: {
    feedField: 'image_link',
    feedTag: '<g:image_link>',
    hint: 'Image URL gaf geen 200 + Content-Type: image/*. Vaak 404 of HTML-redirect.',
  },
  image_fetch_failed: {
    feedField: 'image_link',
    feedTag: '<g:image_link>',
    hint: 'HEAD-request faalde (timeout / DNS / TLS). Check CDN / fallback placeholder.',
  },
  missing_or_invalid_image_url: {
    feedField: 'image_link',
    feedTag: '<g:image_link>',
    hint: 'Geen https:// image_link aanwezig. Voeg minimaal 1 hoofdafbeelding toe.',
  },
};

/**
 * Best-effort mapping of `issue_key` ("validation_fail:image_invalid") to
 * one of the canonical reason buckets. Custom issues return null.
 */
function reasonFromIssueKey(issueKey: string): string | null {
  if (!issueKey.startsWith('validation_fail:')) return null;
  const raw = issueKey.slice('validation_fail:'.length).trim().toLowerCase();
  if (REASON_META[raw]) return raw;
  // Some failreasons may carry suffix info — match by prefix.
  for (const k of Object.keys(REASON_META)) {
    if (raw.startsWith(k)) return k;
  }
  return null;
}

/** Decide whether a sampleResult tripped a given reason bucket. */
function itemMatchesReason(item: SampleResult, reason: string): string | null {
  const issues = Array.isArray(item.issues) ? item.issues : [];
  for (const raw of issues) {
    const lower = raw.toLowerCase();
    if (lower === reason || lower.startsWith(`${reason}:`)) {
      return raw; // return the raw token so the snippet keeps suffix detail
    }
  }
  return null;
}

/**
 * Build the evidence bundle for one issue. Returns null when the issue
 * isn't a known validation_fail reason (e.g. custom issue) — callers
 * should fall back to "no automated evidence" UX in that case.
 */
export function buildIssueEvidence(
  issueKey: string,
  sampleResults: SampleResult[] | null | undefined,
  feedUrl: string = FEED_URL,
): IssueEvidence | null {
  const reason = reasonFromIssueKey(issueKey);
  if (!reason) return null;
  const meta = REASON_META[reason];
  const samples = Array.isArray(sampleResults) ? sampleResults : [];

  const matched = samples
    .map((item) => ({ item, raw: itemMatchesReason(item, reason) }))
    .filter((x): x is { item: SampleResult; raw: string } => x.raw !== null);

  const items = matched.map(({ item, raw }) => {
    // Snippet shows: feed tag + observed value/state (e.g. status code,
    // content-type, weight). For weight reasons we surface the raw value
    // to make "why is this out of range" obvious without a second click.
    let snippet = `${meta.feedTag}: ${raw}`;
    if (reason === 'weight_out_of_range' && item.weight_value) {
      snippet = `${meta.feedTag}${item.weight_value} (out of 1–25 kg)`;
    } else if (reason === 'image_invalid' && item.image_status != null) {
      snippet = `${meta.feedTag} → HTTP ${item.image_status}`;
    } else if (reason === 'missing_or_invalid_image_url') {
      snippet = `${meta.feedTag} ontbreekt of niet https://`;
    }
    return {
      productId: item.id,
      snippet,
      productAdminUrl: `/admin/products?focus=${encodeURIComponent(item.id)}`,
    };
  });

  return {
    feedField: meta.feedField,
    feedTag: meta.feedTag,
    hint: meta.hint,
    feedUrl,
    items,
    totalAffected: matched.length,
  };
}