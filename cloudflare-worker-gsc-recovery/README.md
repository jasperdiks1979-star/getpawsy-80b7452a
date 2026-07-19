# getpawsy-gsc-recovery — Cloudflare Worker Package

**Purpose.** Emit real HTTP `410 Gone` and `301 Moved` status codes for the exact
331 URLs in the Google Search Console "Soft 404" cohort exported on
**2026-07-19**, so Google will re-crawl, dequeue, and drop them from the
coverage report.

**Scope.** Only URLs listed in [`data/cohort-manifest.json`](./data/cohort-manifest.json).
Every other URL passes through the worker to the origin unchanged.

**Runtime footprint.** ~7 KB compiled. One `Set` lookup + one object lookup
per request. No fetch to the origin for intercepted URLs.

## Cohort breakdown (exact-match, no wildcards)

| Bucket         | Count | Meaning                                                    |
| -------------- | -----:| ---------------------------------------------------------- |
| `gone_410`     |   166 | Removed product/collection/api URL — return `410 Gone`     |
| `redirect_301` |     2 | `/product/<uuid>` where UUID is still an active PDP        |
| `preserve_200` |   163 | URL still resolves in the SPA — worker leaves it alone     |
| **Total**      | **331** | Matches the source ZIP exactly                          |

Identity resolution against Lovable Cloud (2026-07-19):

- 249 unique `/products/<slug>` candidates checked against `products_public` +
  `product_slug_history`. Only **4** are still active PDPs — those are moved
  to `preserve_200`.
- 14 `/product/<uuid>` candidates checked. **2** resolve to active PDPs and
  get `301` redirects to `/products/<current-slug>`. The remaining 12 are `410`.
- 128 `/product/<numeric-shopify-id>` candidates: 100% orphaned → `410`.
- 15 `/c/*`, 2 `/pages/*`, 1 `/api/*`: 100% deprecated prefixes → `410`.
- Content routes (`/dogs`, `/guides/*`, `/legal/*`, `/blog*`, `/collections`,
  `/bestseller`, `/new-arrivals`, `/lp`, `/accessories`, `/partners`,
  `/shipping-returns`, `/return-policy`, `/privacy-policy`) → `preserve_200`.

See [`data/cohort-manifest.json`](./data/cohort-manifest.json) for the
per-URL classification with reason codes.

## Files

```
cloudflare-worker-gsc-recovery/
├── README.md              ← this file
├── DEPLOYMENT.md          ← step-by-step manual deployment
├── ROLLBACK.md            ← how to instantly disable the worker
├── VERIFICATION.md        ← post-deploy proof gate
├── wrangler.toml          ← Cloudflare route + env config (edit account_id)
├── package.json           ← wrangler + TS dev deps
├── tsconfig.json
├── src/
│   └── worker.ts          ← the entire runtime — fail-open, exact-match only
├── data/
│   ├── cohort-manifest.json   ← full per-URL classification + reasons
│   ├── cohort-source.csv      ← verbatim copy of GSC export (Tabel.csv)
│   └── worker-rules.json      ← compact runtime lookup tables
└── test/
    ├── smoke-test.sh          ← curl-based post-deploy verification
    └── expected-responses.json
```

## Non-goals (explicitly excluded)

- **No wildcards.** A rule that says "410 everything under `/product/*`" would
  break tomorrow's new products. The worker only recognises the 331 exact
  paths in the manifest.
- **No body rewriting.** The worker never touches HTML on `preserve_200`
  routes — the previously shipped shell fix (`index.html markDead()`) still
  handles `noindex` for those.
- **No writes.** Read-only lookups. No KV, no D1, no Durable Objects.
- **No auth/POST handling.** All non-GET/HEAD requests pass through untouched
  so Stripe/checkout/webhooks are unaffected.

## Safety

The worker is designed to fail open:

1. If `new URL(request.url)` throws → passthrough.
2. If host is not `getpawsy.pet` / `www.getpawsy.pet` → passthrough.
3. If method is not `GET`/`HEAD` → passthrough.
4. If the path is not in the exact-match manifest → passthrough.

In the worst case (bug in worker), disable the route in the Cloudflare
dashboard (see [`ROLLBACK.md`](./ROLLBACK.md)) — origin traffic resumes in
seconds.