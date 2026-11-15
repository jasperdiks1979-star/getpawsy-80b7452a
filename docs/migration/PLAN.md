# GetPawsy independent migration preparation

Evidence date: 2026-11-15. Source: PR #62, head `d80a758e172e8a9d4f253ccdd88ac02ad7fa35ab`.
Status: **PREPARATION ONLY — NOT A RELEASE CANDIDATE**. No target project, production export or hosted preview has been created. Production has not been changed. Checkpoint 317/773 is historical and has not been remeasured.

## Decision

Cloudflare Pages plus an independently owned Supabase Free project is the preferred provisional route for the shop's essential commerce features. A complete unchanged deployment of all existing functions is not feasible on Supabase Free: the repository has 1,035 function entrypoints, while the current published limit is 100. Do not delete those functions or their data; retain the source archive and defer optional operations. Determine actual usage from production logs and cron configuration when access returns. A missing static reference does not prove a function is unused.

The source has React 18, Vite 5, TypeScript and React Router, not TanStack Start. A static frontend migration is possible without rebuilding the UI. Database/Auth/Storage/Edge Functions remain necessary. Merely moving the frontend would retain Lovable dependence.

## Verified access and inventory

- Full single-branch Git clone and history obtained; 5,564 tracked files at the source commit.
- PR #62 is open, draft, unmerged; 28 changed files and 28 commits according to GitHub metadata.
- 1,035 `supabase/functions/*/index.ts` entrypoints; 946 SQL files in `supabase/migrations`; another 19 SQL files in `drizzle/migrations`. Do not run both migration histories blindly.
- 111 function directories directly reference Lovable AI credentials/gateway. Shared modules can add more dependencies.
- Static scan found old project-ID references in 77 tracked code/config/SQL/HTML files and cron scheduling statements in 25 Supabase migration files. Runtime frontend references occur in 8 source files. Build plugins and `_redirects` also contain production fallbacks.
- Both connected Supabase accounts return zero projects. The Getpawsy connection can see organization `Getp`. No destination was provisioned; organization selection remains required by the project-creation API.
- Lovable reports the backend enabled, but a read-only database-size query returns `400 query_error: Database is possibly not accessible at the moment`.
- Browser project page says private project / no access / Log in. Export controls cannot currently be reached.
- No Cloudflare plugin was found by provider discovery. No account or deployment access has been established.

The generated `source-inventory.json` contains per-function environment variable names, table references, literal function targets, reference paths and old-backend reference locations. It contains no credential values or database records. It is a static regex inventory, not a complete dependency graph or evidence of deployed activity. Regenerate from repository root using `python3 scripts/migration-inventory.py`.

## Component migration map

| Component | Source evidence | Destination/preparation | Outstanding gate |
|---|---|---|---|
| Frontend | `package.json`, `vite.config.ts` | Cloudflare Pages static `dist`, Node with adequate heap | Full SEO build must succeed against restored target catalog |
| Catalog/prices | products, products_public and SQL views; customerUnitPrice/order-state guards | Preserve IDs, variants, prices, stock semantics, RLS, triggers | Source counts, totals and row hashes; compare target |
| Database | Two migration families; many historical cron/data operations | Restore reviewed schema/data to isolated Supabase | Consistent full export, exact size, managed schema compatibility |
| Authentication/admin | Supabase client, user_roles and role guards | Restore users and roles; reconfigure sign-in providers/URLs/SMTP | Real admin login and negative authorization tests |
| Storage/images | Database URLs, frontend image overrides | Inventory buckets and copy bytes; preserve paths; remap old origin | Object counts, byte sizes, SHA-256, policies and rendering |
| Checkout | create-checkout + shared Stripe key selector | Separate test backend and Stripe test credentials only | Currency, shipping, totals, idempotency, order persistence |
| Payments/orders | stripe-webhook invokes create-cj-order and confirmation emails | Initially mocked provider calls; explicit test-event handling | Signature/replay tests; verify no CJ/email/live-payment side effects |
| CJ stock | sync-stock, watchdog/deferred SQL and shared contracts | Preserve checkpoint and queue; one bounded owner/lease | Valid target secrets, no duplicate scheduler, source snapshot |
| Shipping/tracking | sync-cj-tracking, send-shipping-notification, lookup-guest-order | Preserve order identity and guest access authorization | Country/rate, invalid tokens and tracking tests |
| Transactional email | RESEND_API_KEY references | No delivery credentials in initial test environment | Test sink, then provider/domain setup when authorized |
| SEO | sitemap/prerender plugins, indexability policies, public redirects | Regenerate using target data; keep canonical getpawsy.pet for future release | Route/HTML/sitemap parity; Pages redirect syntax |
| Jobs | cron migration files; daily/nightly authentication incident in PR history | Prefer target pg_cron for leases/checkpoints; external trigger optional | Actual cron inventory, disabled restore, verified execution |
| Marketing/AI/video | Lovable AI and numerous Pinterest/Runway/ElevenLabs functions | Archive; not enabled in initial shop migration | Separate scope/usage/cost approval before activation |

### Candidate commerce function set (not a deploy allowlist)

`create-checkout`, `stripe-webhook`, `create-cj-order`, `send-order-confirmation`, `send-shipping-notification`, `sync-cj-tracking`, `lookup-guest-order`, `geo-classify`, `sync-stock`, `api-health`, `merchant-feed-full`, `pinterest-redirect`, `pinterest-feed`, `product-prerender`, `resolve-product-slug`, `sitemap-products`, `sitemap-guides`.

All 17 names exist. This is only the initial review set: follow shared imports, RPCs, triggers, client calls and dynamic invocations before declaring it complete. Analytics, admin, shipping and public-read endpoints may expand it. Keep Pinterest publishing/OAuth outside commerce acceptance, but preserve existing inbound links and feeds where needed. Do not deploy create-cj-order or live outbound email in the initial test stack.

## Free capacity and alternatives

Limits checked in official documentation on the evidence date, not confirmed account entitlements:

| Service | Published free allowance | Implication |
|---|---|---|
| Cloudflare Pages | 500 builds/month, one concurrent build, 20-minute build limit, 20,000 files, 25 MiB/file | Good fit for Vite static output if generated artifact passes size/route checks |
| Supabase Free | 500 MB database, 1 GB files, 5 GB egress + 5 GB cached egress, 50,000 MAU, 500,000 function invocations | Actual fit unknown until source sizes/traffic are measured |
| Supabase Functions | 100 functions, 150s worker duration, 2s CPU/request, 256 MB RAM | Select essential functions; small resumable stock batches |
| Supabase Free operations | Two active free projects; inactivity pause after a week; no automatic backups/PITR included | Export externally and test restoration; do not promise always-on production SLA |
| Cloudflare Workers Free | 100,000 requests/day, 10ms CPU, 5 cron triggers/account | Suitable as a thin authenticated trigger, not a direct drop-in Deno backend |
| Resend | Published free transactional allowance 3,000 emails/month, 100/day | Provider account and domain verification still required; no customer mail during tests |

At a proposed 10-minute trigger interval there are 4,320 invocations per 30 days; two additional daily runs add 60. This is a scenario, not measured shop consumption. Internal function calls/retries, analytics and customer traffic add usage. Daily/nightly sync plus a watchdog must not independently process the same cursor. Database and media sizes, egress, active functions and cron load are unknown. Therefore **$0 ongoing hosting has not been proven**. Domain renewal, Stripe transaction fees, supplier purchases and optional AI/video are outside free hosting.

Alternatives: Cloudflare Workers Static Assets is another frontend option but does not remove the backend migration. Workers + D1 would require rewriting PostgreSQL/Auth/RLS/Edge behavior and is higher risk. Plain PostgreSQL/Neon similarly leaves auth/storage/functions to rebuild. Self-hosted Supabase requires an operating server and backups, so is not a verified free solution. Vercel Hobby is restricted to personal/non-commercial use and is not suitable for this shop. GitHub Actions is not chosen as the stock scheduler: scheduled workflows are not a reliable lease owner, and execution quota must be checked before any run. No paid service was started.

## Data protection and restore sequence

1. Sign into the original Lovable project with authorized access. Obtain an active database or provider-assisted export. Current official documentation says export requires a running database; do not buy credits or resume paid services automatically.
2. Request a database export through Database > Manage > Settings > Export project data. Official limit: database up to 15 GB, archive up to 5 GB, one export per 24 hours. This is not yet requested or downloaded.
3. Download the `.backup` archive; preserve privately outside the public repository. It contains user password hashes and may contain sensitive data. Record SHA-256, size, export timestamp and archive table-of-contents. Do not print row contents, secrets, session tokens or hashes into reports.
4. Export storage bytes separately with bucket policies and metadata. A database export does not contain object bytes, runtime secrets or identity-provider configuration. Compare object count, bytes and checksums; do not rely on public image URLs as a backup.
5. Obtain read-only source manifest: table counts, database size, storage totals, users/role counts, orders and line totals by currency/status, products/variants, exact sync_progress, deferred rows, leases, cron definitions and relevant settings. Do not SELECT decrypted Vault values. Bound cron.job_run_details by indexed runid as required by AGENTS.md.
6. Create the selected free destination only after confirming organization and a $0 quote. Restore to a quarantined target with schedules disabled, no external provider secrets and no public frontend. Inspect pg_restore TOC; review managed auth/storage schemas, owners, extensions, RLS and triggers. Never blindly replay historical migrations or restore cron jobs with production URLs. Avoid --clean over an initialized destination.
7. Restore the required application data and selected auth data preserving user/order/product IDs and sequence values. Reconcile migration seed rows. Preserve checkpoint, deferred retry state and attempts exactly; do not reset to zero or advance the cursor from stale evidence. Expired leases require the established recovery procedure, not arbitrary deletion.
8. Verify row counts, relationships, unique constraints, aggregate order amounts, catalog prices and storage hashes. Restore and test another isolated copy to prove backup recovery. Measure total size against free limits before any production traffic decision.
9. Configure destination auth URLs/providers, test SMTP and runtime secrets separately. A database export does not supply them. Existing sessions will require sign-in again. Never put service-role/Stripe/CJ secrets into VITE variables.
10. Only after explicit final approval: coordinate a short write freeze/final delta, stop old stock ownership and enable new ownership without overlap, update webhook routing safely, switch domain and monitor. The old system stays intact. Rollback includes reconciling orders written after cutover; a DNS reversal alone is not sufficient.

## Test environment and release gates

The added `migration-preview-preflight.mjs` rejects the production backend origin, misplaced browser secrets, live Stripe keys, initial supplier/email/AI credentials and enabled schedules. It validates declared configuration only, not remote secret state or network isolation. It does not deploy or enable anything.

Before building a target preview: eliminate implicit old-backend fallbacks in the three build plugins; migrate stored image URLs and hard-coded frontend links; render `_redirects` for the target and replace unsupported external forced 200 proxy rules. Preserve product-to-canonical redirects and directory-index SEO output. Put admin-report redirects before SPA fallback. Give preview responses noindex and access protection. No indexable preview or real payment route should be exposed.

Required validation on the final candidate:
- Full npm production build and both TypeScript configurations, stock/checkout regressions and reviewed dependency audit.
- Actual PostgreSQL concurrent-claim tests, RLS for anon/authenticated/admin, RPC privileges, checkpoint behavior on failure/retry/crash. PGlite alone does not prove concurrency.
- Isolated mobile/desktop browser tests with outbound requests blocked; product/variant selection, missing data, cart reload, US/NL choice, $5.99 below $35 and free shipping at threshold, totals and invalid email.
- Signed test Stripe webhooks, invalid signature, replay, partial failures and idempotent order creation; no live keys, CJ orders, customer email, inventory changes or marketing events.
- Admin sign-in/role tests and unauthorized access rejection, guest-order token tests, storage policies.
- SEO canonical/noindex rules, sitemap coverage, legacy redirects, images and 404 behavior on actual Cloudflare hosting.
- Scheduled target calls must authenticate and log success; invalid credentials fail closed. Initially no stock mutation. One controlled batch requires a separate verified source/target ownership plan.
- Source/target counts and file hashes; restore drill; account free quotas and operational backup schedule.
- Required `scripts/release-validate.sh` including rollback evidence, then explicit user approval before merge, live publication or DNS cutover.

## Sources

- https://docs.lovable.dev/features/database-backups
- https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership
- https://supabase.com/pricing
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/changelog.md
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://resend.com/pricing
- https://www.resend.com/blog/new-free-tier
- https://vercel.com/docs/plans/hobby

Use TEST_RESULTS.md for executed results. Anything in the sequence or release checklist above remains planned unless that file explicitly records success.
