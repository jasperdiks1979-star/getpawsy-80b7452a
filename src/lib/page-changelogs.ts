/**
 * Per-page short changelog entries for contact and policy pages.
 *
 * These are surfaced inline on each page via <PageChangelog /> so visitors,
 * Google Merchant reviewers, and the team can see exactly what was changed,
 * when, and which build/commit applied it.
 *
 * Build/commit references match the release recorded via the admin
 * "Report Release" flow (see useReleaseReport + release_reports table).
 */

export interface PageChangelogEntry {
  /** ISO date when the change went live */
  date: string;
  /** Build/release tag (matches release_reports.title where possible) */
  build: string;
  /** Short git commit reference */
  commit: string;
  /** Bullet list of human-readable changes */
  changes: string[];
}

export type PageChangelogKey =
  | 'contact'
  | 'about'
  | 'shipping'
  | 'returns'
  | 'privacy'
  | 'terms'
  | 'cookies';

export const PAGE_CHANGELOGS: Record<PageChangelogKey, PageChangelogEntry[]> = {
  contact: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Removed all EU/NL address lines; sole business address is now New York, NY · United States.',
        'Updated support email to support@getpawsy.pet across all contact surfaces.',
        'Hardened Organization JSON-LD to a single US PostalAddress (addressCountry: US).',
      ],
    },
  ],
  about: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Rewrote brand identity copy as "GetPawsy LLC, a US-based pet supply company in New York, NY".',
        'Removed legacy Dutch entity references and EU shipping language.',
        'Aligned shipping/returns mentions with US policy (free shipping $35+, 30-day returns).',
      ],
    },
  ],
  shipping: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Standardized US transit time to 5–10 business days and processing to 1–2 business days.',
        'Free shipping threshold confirmed at $35; flat rate $5.99 below threshold.',
        'Added "Orders ship directly to customers across the United States" fulfillment note (matches g:shipping feed).',
      ],
    },
  ],
  returns: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Confirmed 30-day return window and aligned with MerchantReturnPolicy schema in the product feed.',
        'Returns intake routed exclusively to support@getpawsy.pet (US support).',
      ],
    },
  ],
  privacy: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Removed EU/GDPR-specific data controller address; controller is now GetPawsy LLC, New York, NY.',
        'Updated all data subject contact references to support@getpawsy.pet.',
      ],
    },
  ],
  terms: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Governing entity updated to GetPawsy LLC (United States).',
        'Shipping & returns clauses re-anchored to US policy (5–10 business days, 30-day returns, $35 free-shipping threshold).',
      ],
    },
  ],
  cookies: [
    {
      date: '2026-04-23',
      build: 'v2026.04.23 — US identity rollout',
      commit: 'bcf6c8d',
      changes: [
        'Cookie controller updated to GetPawsy LLC (US).',
        'Removed EU-cookie-banner language that referenced an NL legal entity.',
      ],
    },
  ],
};
