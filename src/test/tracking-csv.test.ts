import { describe, it, expect } from 'vitest';
import { parseCsv, analyzeTrackingCsv } from '@/lib/diagnostics/trackingCsv';

const CSV = `event_name,is_bot,qa,classification,device,geo_country,geo_quality,utm_source
add_to_cart,false,false,verified_user,mobile,US,high,pinterest
add_to_cart,false,false,verified_user,mobile,US,high,pinterest
pdp_view,false,false,probable_user,desktop,unknown,unknown,direct
add_to_cart,true,false,bot_like,unknown,,unknown,
add_to_cart,false,true,qa,mobile,US,high,qa
checkout_click,false,false,legacy_unknown,unknown,unknown,unknown,
`;

describe('trackingCsv', () => {
  it('parses a CSV with quoted + plain fields', () => {
    const rows = parseCsv('a,b\n"hello, world",2\nplain,"q""uote"');
    expect(rows).toHaveLength(2);
    expect((rows[0] as Record<string, string>).a).toBe('hello, world');
    expect((rows[1] as Record<string, string>).b).toBe('q"uote');
  });

  it('analyzes a realistic funnel CSV', () => {
    const rows = parseCsv(CSV);
    const r = analyzeTrackingCsv(rows);
    expect(r.total).toBe(6);
    expect(r.bot_count).toBe(1);
    expect(r.qa_count).toBe(1);
    expect(r.unknown_device_count).toBe(2);
    expect(r.unknown_geo_count).toBe(3);
    // clean = 2 verified + 1 probable = 3
    expect(r.clean_total).toBe(3);
    expect(r.by_event['add_to_cart'].raw).toBe(4);
    expect(r.by_event['add_to_cart'].clean).toBe(2);
    expect(r.data_quality_score).toBe(50);
    // warning: clean ATC > 0 but clean checkout_click = 0
    expect(r.warnings.some((w) => w.includes('checkout_click = 0'))).toBe(true);
  });

  it('emits no warnings on a clean run', () => {
    const csv = `event_name,is_bot,qa,classification,device,geo_country,geo_quality
add_to_cart,false,false,verified_user,mobile,US,high
checkout_click,false,false,verified_user,mobile,US,high
`;
    const r = analyzeTrackingCsv(parseCsv(csv));
    expect(r.warnings).toHaveLength(0);
    expect(r.data_quality_score).toBe(100);
  });
});