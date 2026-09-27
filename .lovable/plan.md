# Read-only security review (no changes made)

## Priority summary
1. **Real but limited risk:** `xlsx` 0.18.5 is a direct package with two high-severity advisories: prototype pollution and ReDoS. Both are triggered by *reading* untrusted spreadsheets. The project uses it only in admin export files: excelExport, styledExcelExport and googleAdsExport. Customers never reach it. Practical risk is low, but it is the one direct fix available (0.20.2).
2. **Worth a look:** `react-router-dom` 6.30.1 carries open-redirect advisories. These only matter if the site passes user-supplied paths into navigate or Link. Not yet checked.
3. **Mostly noise:** most of the rest are build and dev tools that never ship to shoppers, or they need attacker-controlled input to a feature the shop does not expose.

## A) The 2 Info findings, "Exposed personal & sensitive data"
- My read-only security view shows no category named "Exposed personal & sensitive data".
- It does list 12 informational database findings, all marked "exposed data", mostly open-insert rules on logging tables such as `performance_metrics` and `utm_session_log`.
- I cannot tell which 2 of these the Security tab groups under that heading without guessing.
- **Unresolved.** A screenshot or the finding titles would let me answer exactly.

## B) The 1 ignored finding
- Ignored findings are not included in any result I can read. Its rule, table, date and reason are not visible to me.
- **Unresolved.** Need its title from the Security tab.

## C) Dependencies: "41 known issues"
- Counts: 20 high and 21 moderate advisories, arriving through 13 packages you install directly. The table below lists 12 of them; `ws` comes in through `@supabase/supabase-js`.
- Distinct underlying packages: about 18. Repeats inflate the count:
  - `picomatch` appears twice, via lint-staged and rollup-plugin-visualizer.
  - `dompurify` appears twice, directly and via jspdf.
  - The React Router open-redirect bug appears twice.

| Direct package | High / Mod | Real vulnerable piece | Ships to shoppers? |
|---|---|---|---|
| @commitlint/cli | 9 / 3 | js-yaml, fast-uri, ajv | No, git commit tool |
| lint-staged | 1 / 2 | picomatch, yaml | No, dev tool |
| rollup-plugin-visualizer | 1 / 1 | picomatch | No, build report |
| xlsx (direct) | 2 / 0 | sheetjs | Admin only; fix 0.20.2 |
| @tiptap/starter-kit | 3 / 3 | linkify-it, markdown-it, tiptap core | Admin editor only (likely) |
| react-router-dom | 1 / 5 | router, remix router | Yes; usage not checked |
| recharts | 1 / 2 | lodash `_.template`, `_.unset` | Charts; those lodash calls are not fed user input |
| @supabase/supabase-js | 1 / 1 | ws (Node websocket) | Browser uses native websocket; ws not used there |
| dompurify | 0 / 1 | only the IN_PLACE mode | IN_PLACE not used in code |
| jspdf | 0 / 2 | dompurify, fflate | Admin PDFs |
| mapbox-gl | 0 / 1 | protocol-buffers-schema | Map dashboard |

- **Verdict:** 41 advisories do not mean 41 exploitable holes. No evidence shows any of them can be exploited against the live shop.

## D) Deep scan failure
- The stored status says "unknown" and "not up to date" for the deep (agent) scan.
- The last deep app check completed on 4 Sep. No error message, timeout or log is stored.
- **No causal error is available.**

## E) Reconciling the numbers
- "Last scan 2 days ago" matches the stored database scan dated 25 Sep.
- The fresh scan I ran today returns results only to me. It evidently does not update the Quick Scan date on the Security tab.
- The 23 fresh findings and the UI's "2 findings" are grouped differently. The exact mapping cannot be proven from the data I can read.

## Smallest safe next actions (not done; each needs approval)
1. Send the titles, or a screenshot, of the 2 Info findings and the 1 ignored finding so A and B can be answered exactly.
2. Optional read-only check: does any page pass untrusted input into router redirects?
3. Later, as a separate approved task: upgrade `xlsx` to 0.20.2 (admin exports only).
4. Rerun the deep scan only when you explicitly ask for it.

Cleanup is still off. Nothing was changed.
