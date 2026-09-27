import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

describe('xlsx admin export patterns', () => {
  it('resolves the pinned SheetJS version', () => {
    expect(XLSX.version).toBe('0.18.5');
  });

  it('TikTokCtaCtrPage pattern: aoa_to_sheet + book_append_sheet + serialize', () => {
    const wb = XLSX.utils.book_new();
    const summary = XLSX.utils.aoa_to_sheet([
      ['Metric', 'Value'],
      ['Impressions', 1200],
      ['CTR', 0.034],
    ]);
    const rows = XLSX.utils.aoa_to_sheet([
      ['Variant', 'Clicks'],
      ['A', 12],
    ]);
    XLSX.utils.book_append_sheet(wb, summary, 'Summary');
    XLSX.utils.book_append_sheet(wb, rows, 'Variants');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(out.byteLength).toBeGreaterThan(0);

    const back = XLSX.read(out, { type: 'array' });
    expect(back.SheetNames).toEqual(['Summary', 'Variants']);
    expect(back.Sheets.Summary.B2.v).toBe(1200);
    expect(back.Sheets.Variants.A2.v).toBe('A');
  });

  it('AdminSmokeTestEventsPage pattern: json_to_sheet + decode_range + encode_cell link + sheet_to_csv', () => {
    const ws = XLSX.utils.json_to_sheet([
      { event: 'pdp_view', count: 3, link: 'https://getpawsy.pet/products/x' },
      { event: 'add_to_cart', count: 1, link: 'https://getpawsy.pet/products/y' },
    ]);
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    expect(range.e.r).toBe(2);
    let linkCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (ws[XLSX.utils.encode_cell({ r: 0, c })]?.v === 'link') linkCol = c;
    }
    expect(linkCol).toBe(2);
    for (let r = 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: linkCol });
      ws[addr].l = { Target: String(ws[addr].v) };
    }
    expect(ws.C2.l?.Target).toBe('https://getpawsy.pet/products/x');

    const csv = XLSX.utils.sheet_to_csv(ws);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('event,count,link');
    expect(lines[1]).toBe('pdp_view,3,https://getpawsy.pet/products/x');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Duplicates');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const back = XLSX.read(out, { type: 'array' });
    expect(back.Sheets.Duplicates.C2.l?.Target).toBe('https://getpawsy.pet/products/x');
  });
});
