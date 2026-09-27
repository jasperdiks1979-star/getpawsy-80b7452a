# xlsx 0.18.5 upgrade audit (read-only, no changes)

## Verdict: SAFE_TO_UPGRADE_ISOLATED
The upgrade should need no code changes, because every function the app calls exists unchanged in 0.20.x. One practical caveat: the newer versions are not published on the npm registry (see "What changes in the package files").

## Exposure NOW: not reachable by attackers
- Only 2 files import xlsx. Both are admin pages that load only when opened:
  - `src/pages/admin/AdminSmokeTestEventsPage.tsx:12`
  - `src/pages/admin/TikTokCtaCtrPage.tsx:20`
- Both pages are nested under the `/admin` route (`src/App.tsx:1822`, shell `LazyAdminShell`) and loaded on demand (`App.tsx:377`, `App.tsx:708`), so shopper pages never load xlsx.
- `vite.config.ts` has no manual bundle rule for xlsx, so it only ships inside those admin page bundles.
- The earlier assumption about excelExport, styledExcelExport and googleAdsExport was wrong. They matched my search only for the word "xlsx"; they build files with **JSZip** and do not use xlsx.
- Nothing parses a spreadsheet: no `read`, `readFile` or `sheet_to_json` anywhere in `src`. Both pages only *generate* exports from data already loaded from the database for a signed-in admin.

## Functions used
| File | Calls | Input |
|---|---|---|
| AdminSmokeTestEventsPage | `utils.book_new`, `json_to_sheet` (x5), `book_append_sheet` (x4), `decode_range`, `encode_cell` (x2, lines 226–238, adds hyperlinks to cells), `sheet_to_csv` (line 301), `writeFile` (line 252) | Admin-loaded smoke-test rows |
| TikTokCtaCtrPage | `utils.book_new`, `aoa_to_sheet` (x2), `book_append_sheet` (x2), `writeFile` (line 432) | Admin-loaded TikTok CTR stats |

## The two advisories (standard SheetJS records)
1. **Prototype pollution.** CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6.
   - Affects versions below 0.19.3.
   - Triggered by *reading* a crafted file.
   - Prerequisite: parsing an untrusted spreadsheet. The app does not do this.
2. **ReDoS (slowdown via crafted input).** CVE-2024-22363 / GHSA-5pgg-2g8v-p4x9.
   - Affects versions below 0.20.2.
   - Triggered by *reading* crafted input.
   - Same prerequisite; not met.
- **Fixed version:** 0.20.2 fixes both. It matches the scan's "fixed in" column.
- **Not re-checked online this turn:** I took the CVE and GHSA IDs from the known SheetJS records.

## Compatibility for these calls only (0.18.5 to 0.20.x)
- All the listed utils plus `writeFile` are unchanged. `import * as XLSX from 'xlsx'` still works in Vite.
- TypeScript types still ship with the package. License stays Apache-2.0.
- These exports use no cell styling (the free edition never supported it), so styling cannot change.
- Dates: 0.20.x differs slightly on dates stored as text. Here, dates come in as strings or numbers from JSON, so the effect is none or cosmetic.

## What changes in the package files later (nothing edited now)
- `package.json:94` currently has `"xlsx": "^0.18.5"`. The lockfile resolves `xlsx@0.18.5` from the registry cache, together with adler-32, cfb, codepage, crc-32, ssf, wmf and word.
- 0.19 and later are **only distributed from cdn.sheetjs.com**, not the npm registry. The upgrade would change that one line to a tarball web address: `https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz`, or a later 0.20.x.
- The lockfile entry would then point to that web address. 0.20.x bundles its helper packages, so some of the extra lockfile entries would drop out.
- Risk: installs now depend on the SheetJS website, and the sandbox install cache must be able to fetch from it. Confirm this during the upgrade task.

## Tests
- **Existing:** none cover xlsx exports. `smoke-routes.test.tsx` only renders routes.
- **Minimal set to add with the upgrade:**
  1. A test that builds a workbook the way TikTokCtaCtrPage does (aoa_to_sheet, then book_append_sheet) and checks `XLSX.write(wb, {type: 'array'})` returns data with the expected sheet names.
  2. A test of the smoke-test export path: json_to_sheet, then decode_range, encode_cell hyperlink, sheet_to_csv. It checks the CSV header and that the link cell exists.
  3. The normal code check and build, then confirm xlsx still appears only in the two admin page bundles.

## Smallest safe next step (not done; needs approval)
Separate task:
1. Point xlsx at the official 0.20.2 (or later 0.20.x) SheetJS tarball.
2. Add the 2 small tests above.
3. Run the code check and build.
4. Re-run the dependency scan and confirm the 2 advisories are gone.
5. Publish.

This is dependency hygiene (defense in depth), not a fix for any live exposure.

Cleanup is still off. Nothing was changed.
