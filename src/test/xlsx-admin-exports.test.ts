import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { createWorkbook, addSheet, jsonToAoa, aoaToCsv, buildZip, type SheetLink } from '@/utils/excelExport';

async function open(wb: ReturnType<typeof createWorkbook>) {
  const buf = await (await buildZip(wb)).generateAsync({ type: 'uint8array' });
  return JSZip.loadAsync(buf);
}
const text = (z: JSZip, p: string) => z.file(p)!.async('string');

describe('admin spreadsheet exports (JSZip writer, replaces xlsx)', () => {
  it('TikTok pattern: sheet names, widths, typed cells, no bold title row', async () => {
    const wb = createWorkbook();
    addSheet(wb, 'Summary', [['TikTok CTA CTR Export'], [], ['Placement', 'CTR %'], ['hero', 12.34]], [16, 28], { headerRow: false });
    const long = 'a/b?c*d[e]f:g\\h-very-long-placement-name-xyz'.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
    addSheet(wb, long, [['Metric', 'Value'], ['Clicks', 7]], [28, 14], { headerRow: false });
    const z = await open(wb);
    const book = await text(z, 'xl/workbook.xml');
    expect(book).toContain('name="Summary"');
    expect(book).toContain(`name="${long}"`);
    expect(long.length).toBe(31);
    const s1 = await text(z, 'xl/worksheets/sheet1.xml');
    expect(s1).toContain('<col min="1" max="1" width="16" customWidth="1"/>');
    expect(s1).toContain('<c r="B4" s="0"><v>12.34</v></c>');
    expect(s1).not.toContain('s="1"');
    expect(await text(z, 'xl/sharedStrings.xml')).toContain('TikTok CTA CTR Export');
  });

  it('smoke-test pattern: 4 ordered sheets and deep_link hyperlink with tooltip', async () => {
    const dup = jsonToAoa([{ key: 'k1', deep_link: 'https://getpawsy.pet/admin/x?a=1&b=2' }]);
    const col = dup[0].indexOf('deep_link');
    const links: SheetLink[] = [{ r: 1, c: col, target: String(dup[1][col]), tooltip: 'Open in admin: session + idempotency key' }];
    dup[1][col] = 'Open in admin →';
    const wb = createWorkbook();
    for (const n of ['Filters', 'Summary']) addSheet(wb, n, jsonToAoa([{ a: 1 }]), undefined, { headerRow: false });
    addSheet(wb, 'Duplicates', dup, undefined, { headerRow: false, links });
    addSheet(wb, 'All Events', jsonToAoa([{ step: 'x' }]), undefined, { headerRow: false });
    const z = await open(wb);
    const names = [...(await text(z, 'xl/workbook.xml')).matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['Filters', 'Summary', 'Duplicates', 'All Events']);
    const s3 = await text(z, 'xl/worksheets/sheet3.xml');
    expect(s3).toContain('<hyperlink ref="B2" r:id="rId1" tooltip="Open in admin: session + idempotency key"/>');
    const rels = await text(z, 'xl/worksheets/_rels/sheet3.xml.rels');
    expect(rels).toContain('Target="https://getpawsy.pet/admin/x?a=1&amp;b=2" TargetMode="External"');
    expect(await text(z, 'xl/sharedStrings.xml')).toContain('Open in admin →');
    expect(z.file('xl/worksheets/_rels/sheet1.xml.rels')).toBeNull();
  });

  it('Duplicates fallback row', () => {
    expect(jsonToAoa([{ note: 'No duplicates detected' }])).toEqual([['note'], ['No duplicates detected']]);
  });

  it('jsonToAoa unions keys across rows in first-seen order', () => {
    expect(jsonToAoa([{ a: 1 }, { b: 'x', a: 2 }])).toEqual([['a', 'b'], [1, null], [2, 'x']]);
  });

  it('aoaToCsv matches xlsx 0.18.5 sheet_to_csv output (recorded)', () => {
    const rows = [
      { a: 'plain', b: 1.5, c: null, d: 'x,y' },
      { a: 'q"t', b: 0, c: 'line\nbreak', d: true, e: 'extra' },
      { a: '', b: -2 },
    ];
    // Recorded from xlsx@0.18.5: sheet_to_csv(json_to_sheet(rows))
    const expected = 'a,b,c,d,e\nplain,1.5,,"x,y",\n"q""t",0,"line\nbreak",TRUE,extra\n,-2,,,';
    expect(aoaToCsv(jsonToAoa(rows))).toBe(expected);
  });
});
