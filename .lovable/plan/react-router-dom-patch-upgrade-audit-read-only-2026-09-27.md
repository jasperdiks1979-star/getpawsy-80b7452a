# react-router-dom patch upgrade audit (read-only)

## Verdict: SAFE_TO_UPGRADE_ISOLATED

Recommended future target: **react-router-dom 6.30.4**, an exact patch-level change within 6.30.x. Nothing was installed or changed during this audit.

## 1. Advisory facts (from the dependency scan and the npm advisory database)

| Advisory | Severity | Package | Affected versions | Fixed in | Shown by our dependency scan |
|---|---|---|---|---|---|
| GHSA-2w69-qvjg-hvjx: XSS via open redirects | High | @remix-run/router | up to and including 1.23.1 | 1.23.2 (react-router-dom 6.30.3) | Yes, fixed "@remix-run/router >1.23.1" |
| GHSA-2j2x-hqr9-3h42: same-origin redirect starting with // causes an open redirect | Moderate | @remix-run/router 1.3.0 up to (not including) 1.23.3; react-router 6.7.0 up to (not including) 6.30.4 | | 1.23.3 / 6.30.4 | Listed with the moderates |
| GHSA-9jcx-v3wj-wh4m: unexpected external redirect | Moderate | react-router 6.0.0 up to (not including) 6.30.2 | | 6.30.2 | Listed with the moderates |
| GHSA-wrjc-x8rr-h8h6: backslash in Link/useNavigate (CVE-2025-68470 bypass) | Moderate | react-router 6.0.0 up to (not including) 7.18.0 | | Only in 7.18.0 | Not fixed anywhere in 6.x |
| GHSA-337j-9hxr-rhxg: deserializeErrors constructor injection | Moderate | react-router 6.4.0 up to (not including) 7.18.0 | | Only in 7.18.0 | Not fixed anywhere in 6.x |

The smallest version that removes the High is 6.30.3. **6.30.4** is the smallest version that also removes the two related redirect moderates (the // path and the external redirect). Two moderates stay on every 6.x version.

## 2. Current and candidate versions (lockfile and official npm listing)

| Package | Now | Candidate 6.30.4 |
|---|---|---|
| react-router-dom (package.json `^6.30.1`) | 6.30.1 | 6.30.4 |
| react-router | 6.30.1 | 6.30.4 |
| @remix-run/router | 1.23.0 | 1.23.3 |

- react-router-dom depends on exact versions of react-router and @remix-run/router; react-router depends on an exact @remix-run/router.
- The required React version is unchanged at 16.8 or later.
- @remix-run/router has no dependencies of its own.
- Other 6.x releases exist: 6.30.5 (router 1.23.3) and 6.30.6 (router 1.23.4, the current "version-6" tag). I did not read their release notes, so I'm not recommending them.

## 3. Expected package file changes

- package.json: one line, react-router-dom set to `6.30.4`.
- bun.lock: only the three entries above change version and checksum.
- No new packages are added or removed, and nothing else should change. This is inferred from the official version listing and must be confirmed with a lockfile comparison when the upgrade is done.

## 4. Release notes, 6.30.1 to 6.30.4 (as documented)

- **react-router-dom and react-router:** each release only updates its dependencies.
- **@remix-run/router 1.23.1:** normalizes double slashes when resolving paths.
- **@remix-run/router 1.23.2:** validates redirect locations.
- **@remix-run/router 1.23.3:** normalizes double slashes in redirect paths, and moves a path-decoding step out of route matching for speed.
- No breaking changes are listed.

What these changes mean for GetPawsy (my reading, not stated in the notes): only paths containing `//`, or redirects to other websites, behave differently. GetPawsy's normal links don't contain either.

## 5. How GetPawsy uses the router (from the code)

- The site uses the simple router setup: `BrowserRouter`, `Routes` and `Route` in `src/App.tsx:9` and `:887`. It doesn't use the newer data-router features (no `createBrowserRouter`, `RouterProvider`, loaders, `redirect()` or fetchers), so the `redirect()` and deserializeErrors changes don't apply.
- Features in use: Link (~237 files), useNavigate (36), useLocation (34), useSearchParams (23), Navigate (20), useParams (19), NavLink (5), and MemoryRouter in tests.
- **Navigation points to re-check after the upgrade:**
  - **Sign-in page:** `?next=` through `safeNextPath` (`src/pages/Auth.tsx:35`).
  - **Admin guard:** AdminRouteGuard sends signed-out visitors to /auth with `next` set to the current page.
  - **Redirects in `src/App.tsx`:** `lp/:slug`, GuideSlugRedirect, CategorySlugRedirect and LegacyClusterRedirect.
  - **Other internal redirects:** GuidePage:200, BlogPost:268 and SeoCollection:484.
  - **Checkout:** Checkout.tsx:881 sends the browser to the payment address our backend creates.
  - **Product links:** ProductCard.tsx:172 and CartContext.tsx:355.
  - **Reloads:** the cache-bust and current-page reloads in App.tsx, build-version-guard and boot-diagnostics.
  - **Admin connection pages:** these send the browser to addresses from our backend, which bypasses the router.
- Browser address changes like checkout, reloads and admin connection pages bypass the router entirely, so the upgrade can't change them.
- Expected risk: low. The only expected behavior change is double slashes being cleaned up in resolved paths.

## 6. Tests that must pass after the upgrade (unchanged test files)

- `src/test/safe-next-path.test.ts`: 22 tests. `safeNextPath` stays in place because the package fix doesn't validate return links the app handles itself.
- `src/test/smoke-routes.test.tsx`: 12 tests.
- `src/test/pinterest-legacy-redirects.test.tsx`
- `src/test/bcghi-routes-truth-monitoring.test.ts`
- `src/pages/__tests__/LinkInBio.utm-funnel.test.tsx` and `tiktok-funnel.e2e.test.tsx`, which use MemoryRouter.
- The full test run, compared against the current baseline.

## 7. Hard gates for a future implementation

1. Change only react-router-dom to exactly 6.30.4. The lockfile comparison must show only the three router entries changed.
2. The tests in section 6 all pass.
3. Code check: 0 errors.
4. The production build succeeds.
5. The dependency scan reads the lockfile, the GHSA-2w69-qvjg-hvjx High is gone, and no new critical or high warnings appear. The remaining 17 highs should stay unchanged.
6. In the preview, signed out:
   - /auth renders normally;
   - `/auth?next=/products` keeps its safe return path (checked by reading the code; no real login);
   - `/auth?next=//evil.example` falls back to "/", without visiting any outside site;
   - /admin/tiktok-cta-ctr redirects to `/auth?next=...`;
   - one legacy guide or category redirect and one product page load.
7. No publishing without separate approval.
8. Rollback point: the current version from History.

## Limits

- The changes in 6.30.5 and 6.30.6 are unknown because I didn't read their release notes.
- The two remaining moderates (backslash links and deserializeErrors) are fixed only in 7.18.0, a major upgrade that is out of scope. The backslash case in our one visitor-controlled return link is already blocked by `safeNextPath`.
- Cleanup is still off. Nothing was installed, edited, marked or published.
