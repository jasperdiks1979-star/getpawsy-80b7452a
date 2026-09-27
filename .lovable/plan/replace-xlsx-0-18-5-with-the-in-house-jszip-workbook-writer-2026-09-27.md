# Replace xlsx 0.18.5 with the in-house JSZip workbook writer

## Verdict: REPLACE_WITH_EXISTING_DEPENDENCY

The project already has `src/utils/excelExport.ts`, a small .xlsx writer built on `jszip` (^3.10.1, already installed). JSZip has no advisories in the current dependency scan (88 packages checked). It already supports several sheets, column widths, and number, text and yes/no cells, and it offers the same call style as xlsx (`utils.book_new`, `json_to_sheet`, `aoa_to_sheet`, `book_append_sheet`, `writeFile`). What's missing: clickable links, a switch to turn off the bold first row, and one CSV helper. All three are small additions inside that file. No new dependency is needed.

## 1. What must keep working (confirmed by reading the code)

**TikTokCtaCtrPage.tsx** (import on line 20; export on lines 340–432)
- One "Summary" sheet built from a table of rows (`aoa_to_sheet`): a title row, meta rows, an empty row, a header row, then one row per placement (numbers stay numbers, rounded to 2 decimals). Column widths: 16, 28, 12, 10, 10, 12, 12, 14, 14, 18.
- One sheet per placement. Sheet names have `\/?*[]:` replaced with `_` and are cut to 31 characters. Column widths: 28, 14, 12, 10, 12, 12, 14, 14, 18.
- File name: `tiktok-cta-ctr_{YYYY-MM-DD}_{days}d_{slug}.xlsx`.
- No cell styling today (the free edition of 0.18.5 ignores styles).

**AdminSmokeTestEventsPage.tsx** (import on line 12)
- Workbook export (lines 218–252) has four sheets in this order: Filters, Summary, Duplicates, All Events, each built from records (`json_to_sheet`).
- In Duplicates, the `deep_link` column is found from the header row. Each non-empty string in it becomes a link to its URL, shows the text "Open in admin →", and has the tooltip "Open in admin: session + idempotency key". The `cell.s` font colour is ignored by 0.18.5 today.
- If there are no duplicates, the Duplicates sheet holds a single row: `note: No duplicates detected`.
- File name: `smoke-test-duplicates-{ISO stamp}.xlsx`.
- CSV export (lines 300–311): records go through `json_to_sheet` and then `sheet_to_csv`. The file is saved as UTF-8 with no BOM, named `smoke-test-summary-{stamp}.csv`.

## 2. Libraries already installed
- `jszip` ^3.10.1: in use; no scan advisories.
- `src/utils/excelExport.ts`: the JSZip writer described above.
- `src/utils/styledExcelExport.ts`: JSZip writer with styling, used by the 5 period-comparison admin reports. It has no links.
- `src/lib/lpFunnelExport.ts`: has its own CSV helpers, tied to one fixed column list.
- ExcelJS, file-saver, papaparse and write-excel-file are not in package.json.

## 3–4. Options compared
- **A. Existing JSZip writer (recommended):** no new package, the scanner stays able to read the lockfile, and the size added to admin pages is small (JSZip is already bundled). Needs about 60 lines of additions plus tests.
- **B. ExcelJS (latest 4.4.x from npm):** it is technically able to do all of this, but it's a large new package (hundreds of KB) with its own chain of dependencies. It adds attack surface to fix a warning that isn't reachable by attackers. Not recommended while A exists.
- **C. CSV-only:** rejected, because it loses the multi-sheet workbooks and links.

## 5. Mapping each call (preferred option A)

| xlsx call | Replacement | Behavior change |
|---|---|---|
| `utils.book_new` | `excelExport.utils.book_new` | none |
| `aoa_to_sheet` + `!cols` | `addSheet(wb, name, aoa, widths)` | none (widths are passed directly) |
| `json_to_sheet` | `jsonToSheet`, extended to take header keys from **all** rows in order (as xlsx does) | none after the extension |
| `book_append_sheet` | `addSheet` (sheet name already cleaned and cut to 31 characters) | none |
| `decode_range` / `encode_cell` loop | Find the `deep_link` column index in the header list, then set link cells | none that users see |
| `cell.l` link | New optional `links` on the sheet: rows/columns mapped to `{target, tooltip}`, written as a sheet rels file plus `<hyperlinks>` | none; the link and tooltip are kept |
| `cell.s` style | Dropped | none (it was already ignored) |
| `sheet_to_csv` | New `aoaToCsv`: comma separator, quote only when a value contains a comma, quote mark or line break, `\n` line endings, empty for null | none; confirmed by a test against 0.18.5 output taken before removal |
| `writeFile` (sync) | `await writeFile` (async, JSZip blob download) | the download starts after one tick, which users don't notice |

Required small additions to `excelExport.ts`:
- a `headerRow` option (default true, which keeps today's behavior for other users). The two migrated pages pass false, so TikTok's title row doesn't turn bold;
- links;
- `aoaToCsv`;
- the all-row header keys in `jsonToSheet`.

Dates are text today in both pages, so nothing changes. JSZip picks the zip timestamp, which doesn't matter.

## 6. Removing the packages
- In bun.lock, the helper packages adler-32, cfb, codepage, crc-32, frac, ssf, wmf and word are used only by xlsx itself, or by cfb and ssf, which are in turn only pulled in by xlsx. Nothing else uses them.
- Running `bun remove xlsx` should remove xlsx and these eight entries, and change nothing else. I'll confirm by comparing the lockfile before and after.

## 7. Implementation and test plan (not started)

**Files expected to change**
- `src/utils/excelExport.ts`: the additions listed above.
- `src/pages/admin/TikTokCtaCtrPage.tsx`: swap the import and the calls.
- `src/pages/admin/AdminSmokeTestEventsPage.tsx`: swap the import, the link loop and the CSV call.
- `src/test/xlsx-admin-exports.test.ts`: rewrite against the new writer.
- `package.json` and `bun.lock`: produced by `bun remove xlsx` only.

**Tests**
1. Before removing xlsx, record the 0.18.5 CSV and cell output for sample data as fixed expected values.
2. New tests:
   - TikTok pattern: sheet names, cell values and types, column widths, and a name longer than 31 characters with special characters;
   - smoke-test pattern: four sheet names in order, and the `deep_link` cell's display text, link target and tooltip in the sheet XML and rels file;
   - the Duplicates fallback row;
   - `aoaToCsv` matches the recorded fixed values (commas, quote marks, line breaks, nulls, numbers);
   - `jsonToSheet` with rows that have different keys.
   - Tests open the generated zip with JSZip.
3. The existing tests for page routes (smoke-routes) and the login redirect fix still pass.

**Gates, in order**
- Tests pass.
- Code check finds 0 errors.
- The site builds.
- `rg "from 'xlsx'"` finds nothing.
- The lockfile comparison shows only xlsx and its 8 helpers removed.
- The dependency scan still reads the lockfile, no longer lists xlsx or its two high warnings, and all other findings are unchanged.
- In the build output there is no separate xlsx file, and the writer code only appears in admin page files, not the main shopper file.

**Publish:** only with your separate approval after all gates pass, then check the live version and that the storefront and /auth respond.

**Rollback point:** the current version (xlsx ^0.18.5, scanner working, 3/3 tests passing), which can be restored from History.

## Out of scope
No other dependency changes, no auto-fix, and no database, security-policy or findings changes. Cleanup stays off. No Pinterest, products, supplier, analytics, Stripe or order changes.
