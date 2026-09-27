# Reachability audit: the 18 high dependency warnings (read-only)

## Verdict: NO_REACHABLE_HIGH_FOUND

None of the 18 high warnings can be reached by visitor-controlled input in GetPawsy today. The evidence comes from reading the source code, the dependency tree in the lockfile, the installed package code, and the live production files (build-mukeg2ey-rw7i). No changes were made.

## Status counts

| Status | Count |
|---|---|
| DEV_BUILD_ONLY | 12 (commitlint 10, lint-staged 1, rollup-plugin-visualizer 1) |
| PRESENT_NOT_REACHABLE | 5 (tiptap 3, ws 1, lodash 1) |
| MITIGATED_APP_LEVEL | 1 (react-router-dom) |
| REACHABLE_REMEDIATE | 0 |
| INCONCLUSIVE | 0 |

## All 18 warnings

In the "Fixed in" column, the versions are the ones the dependency scan reports for the flagged sub-package. The scan does not name a fixed version for the top-level package ("-"). GHSA and CVE numbers are not shown by the scan, except where listed.

| # | Parent package, then flagged sub-package (installed version) | Advisory | Where it runs | Evidence | Status | Fixed in |
|---|---|---|---|---|---|---|
| 1–7 | @commitlint/cli 20.3.1, then @commitlint/config-validator, then ajv 8, then fast-uri 3.1.0 | fast-uri host confusion x5, path traversal, SSRF via IPv6 | Developer git hook only | Used only by `.husky/commit-msg` and `commitlint.config.js`. It is never imported in `src/` or `supabase/functions/`. It checks commit messages on a developer's machine; no web request or stored data can reach it. | DEV_BUILD_ONLY | fast-uri 3.1.6 (covers all 7) |
| 8–10 | @commitlint/cli 20.3.1, then cosmiconfig 9.0.0, then js-yaml 4.1.0 | Three js-yaml CPU warnings: !!omap resolution (CVE-2026-59870), merge-key chains, maxTotalMergeKeys | Developer git hook only | cosmiconfig only reads the local commitlint config file. | DEV_BUILD_ONLY | js-yaml 4.3.2 (covers all 3) |
| 11 | lint-staged 16.2.7, then micromatch, then picomatch | picomatch extglob ReDoS | Developer git hook only | Run only by `.husky/pre-commit` (`npx lint-staged`) against file patterns in the repo. Never imported by app or backend code. | DEV_BUILD_ONLY | picomatch 4.0.4 (scan) |
| 12 | rollup-plugin-visualizer 7.0.0, then picomatch 4.0.3 | picomatch extglob ReDoS | Build time only | `vite.config.ts:123` enables it only for production builds, and it writes `audits/bundle-report.html`. It runs inside the build tool; the code never ships to the site or runs when pages are served. | DEV_BUILD_ONLY | picomatch 4.0.4 |
| 13 | @tiptap/starter-kit 3.15.3, then @tiptap/core 3.15.3 | Quadratic ReDoS in Markdown attribute parsing | Admin editor only | The code with the flaw (the Markdown helpers `parseAttributes`, `createBlockMarkdownSpec` and `createInlineMarkdownSpec` in `@tiptap/core`) is defined but never called: no installed extension references it, and the Markdown extension (`@tiptap/markdown`) isn't installed. The only editor, `src/components/ui/rich-text-editor.tsx`, loads HTML (`setContent`, `getHTML`), not Markdown. It's used only by BlogPostsManager, EmailCampaignManager and AutoNewsletterDialog, all inside the admin area (`src/pages/Admin.tsx`). | PRESENT_NOT_REACHABLE | @tiptap/core 3.30.5 |
| 14–15 | @tiptap/starter-kit 3.15.3, then @tiptap/pm, then prosemirror-markdown 1.13.2, then markdown-it 14.1.0, then linkify-it 5.0.0 | linkify-it quadratic scan loop; `mailto:` validator DoS | Not loaded | Nothing in `src/` or `supabase/functions/` imports prosemirror-markdown, markdown-it or linkify-it. The editor's Link extension uses a different library (linkifyjs), not linkify-it. | PRESENT_NOT_REACHABLE | linkify-it later than 5.0.1 |
| 16 | @supabase/supabase-js 2.90.1, then @supabase/realtime-js 2.90.1, then ws 8.19.0 | ws memory exhaustion DoS | Not loaded | realtime-js lists ws as a dependency but never imports it: "ws" appears only inside two error-message strings (`websocket-factory.js:63`, `RealtimeClient.js:146`). Browsers and the Deno backend functions use their built-in WebSocket. No `ws` import exists in `src/` or `supabase/functions/`. The live supabase file (supabase-BOCL3uOH.js) contains no ws import. | PRESENT_NOT_REACHABLE | ws 8.21.0 |
| 17 | react-router-dom 6.30.1, then @remix-run/router 1.23.0 | XSS via open redirects | Shopper browser | Re-checked this turn. The only address parameter visitors control that reaches navigation is `?next=` in `src/pages/Auth.tsx:35`, which goes through `safeNextPath` (22 tests, confirmed live). No other `redirect`/`returnTo`/`url`/`continue` parameter, and no `location.state` value, is passed to `navigate` or `<Navigate>`. Other browser address changes use fixed paths, the current page, product addresses built by our own code, or addresses returned by our own backend on admin-only pages. The flaw in the package itself remains. | MITIGATED_APP_LEVEL | @remix-run/router later than 1.23.1 (react-router 6.30.2 / 6.30.4 per the earlier scan) |
| 18 | recharts 2.15.4, then lodash 4.17.21 | `_.template` code injection | Charts in shopper and admin pages | recharts never imports `lodash/template`; nothing in `src/` or `supabase/functions/` imports lodash. The live chart files (AreaChart, BarChart, LineChart, chart, generateCategoricalChart) contain no `templateSettings`, so the template code isn't shipped. | PRESENT_NOT_REACHABLE | lodash later than 4.17.23 |

## Suggested order of work (by real exposure, not by how many warnings there are)

1. **react-router-dom**: upgrade to a fixed 6.30.x. It's the only flagged package that ships to shoppers and handles navigation. The app-level fix already covers the known path; the upgrade adds a second layer of protection. After upgrading, still re-run the `safeNextPath` tests and the redirect code check.
2. **@supabase/supabase-js**: upgrade to a version whose resolved ws is 8.21.0 or newer. The code ships to shoppers but ws never runs. Change risk is moderate, because it touches the login and database connections everywhere.
3. **recharts**: resolve lodash to a version later than 4.17.23, ideally by pinning lodash rather than upgrading recharts to a new major version.
4. **@tiptap/*** (starter-kit, core, pm and extensions together): upgrade to a version where @tiptap/core is 3.30.5 or newer and linkify-it is later than 5.0.1. This affects the admin editor only.
5. **Development tooling** (commitlint, lint-staged, rollup-plugin-visualizer): move them to devDependencies, then upgrade them or pin their sub-packages. This is housekeeping. Moving them should also drop 12 of the 18 warnings from the production-dependency scan, because it skips devDependencies.

I haven't checked which exact top-level versions include each fix. That needs a registry and lockfile resolution check during the upgrade itself; I didn't guess versions.

## Upgrade alone versus upgrade plus app check

- **Upgrade alone closes the warning:** items 1–16 and 18 (tooling, tiptap, ws, lodash).
- **Upgrade plus app-code check:** react-router-dom (17). Re-verify every navigation point and keep `safeNextPath`, because the package fix doesn't validate return links the app builds itself.

## Coverage limits
- The scan doesn't show GHSA numbers; only CVE-2026-59870 is named.
- I didn't search the live admin editor file directly; the tiptap conclusion rests on source code and installed-package evidence.
- The husky git hooks run only on a developer's machine.
- The deep scan's status is still "unknown", and the connector scan is "incomplete" (last run 24 Aug). Neither was touched.
- Cleanup is still off. Nothing was changed, installed, marked or published.
