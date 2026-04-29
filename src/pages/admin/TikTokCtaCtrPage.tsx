/**
 * TikTokCtaCtrPage — focused CTR-per-placement dashboard for the /go landing
 * page. Compares the three CTA placements (bio_primary, bio_secondary,
 * bio_sticky) side-by-side and ties each one to its downstream PDP views and
 * add-to-cart events through the same `get_lp_funnel_report` RPC used by the
 * full funnel report. This is the "which CTA is winning" view.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Loader2, Trophy, MousePointerClick, ShoppingCart, Eye, Download, SlidersHorizontal, FileSpreadsheet, CalendarIcon, Users, UserCheck, UserPlus } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { DateRange } from 'react-day-picker';
import { TikTokVariantKpis } from '@/components/admin/TikTokVariantKpis';
import { UtmCampaignFunnelMatching } from '@/components/admin/UtmCampaignFunnelMatching';
import { ConversionVariantHeatmapCompare } from '@/components/admin/ConversionVariantHeatmapCompare';

type RawRow = {
  placement: string | null;
  utm_campaign: string | null;
  lp_view: number;
  lp_cta_impression: number;
  lp_cta_click: number;
  pdp_view: number;
  add_to_cart: number;
};

type Aggregated = {
  placement: string;
  lp_view: number;
  lp_cta_impression: number;
  lp_cta_click: number;
  pdp_view: number;
  add_to_cart: number;
  ctr: number; // click / impression
  click_to_pdp: number; // pdp / click
  pdp_to_atc: number; // atc / pdp
  end_to_end: number; // atc / impression
};

const PLACEMENTS = ['bio_primary', 'bio_secondary', 'bio_sticky'] as const;

const PLACEMENT_LABELS: Record<string, string> = {
  bio_primary: 'Primary (above the fold)',
  bio_secondary: 'Secondary (final CTA)',
  bio_sticky: 'Sticky (mobile bar)',
};

function pct(n: number, d: number): number {
  if (!d) return 0;
  return (n / d) * 100;
}

function fmtPct(value: number, denominator: number): string {
  if (!denominator) return '—';
  return `${value.toFixed(1)}%`;
}

export default function TikTokCtaCtrPage() {
  // Range mode: 'preset' (last N days) OR 'custom' (explicit from/to via DayPicker).
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset');
  const [days, setDays] = useState(14);
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 13),
    to: new Date(),
  });
  const [campaign, setCampaign] = useState<string>('all');
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Export selection — defaults to "everything visible". When the dashboard
  // filter is set to a single campaign we still want users to optionally narrow
  // the export further (e.g. only bio_primary across two specific campaigns).
  const [exportPlacements, setExportPlacements] = useState<Set<string>>(
    () => new Set(PLACEMENTS),
  );
  const [exportCampaigns, setExportCampaigns] = useState<Set<string> | null>(null); // null = all

  // Returning visitor stats for the same date window — answers "how many of
  // the people we saw are coming back vs. brand-new?". Uses persistent
  // visitor_id (localStorage), so it only counts hits since that ID was added.
  type ReturningStats = {
    total_visitors: number;
    returning_visitors: number;
    new_visitors: number;
    total_sessions: number;
    returning_visitor_pct: number;
  };
  const [returningStats, setReturningStats] = useState<ReturningStats | null>(null);
  const [returningLoading, setReturningLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const useCustom = rangeMode === 'custom' && customRange?.from && customRange?.to;
    const promise = useCustom
      ? supabase.rpc('get_lp_funnel_report_range', {
          p_start: startOfDay(customRange!.from!).toISOString(),
          p_end: endOfDay(customRange!.to!).toISOString(),
          p_campaign: campaign === 'all' ? null : campaign,
          p_include_internal: false,
        })
      : supabase.rpc('get_lp_funnel_report', {
          p_days: days,
          p_campaign: campaign === 'all' ? null : campaign,
          p_include_internal: false,
        });
    promise
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows((data ?? []) as RawRow[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeMode, days, customRange?.from?.getTime(), customRange?.to?.getTime(), campaign]);

  // Fetch returning-visitor stats for the active window. Independent of the
  // funnel RPC so a slow analytics query never blocks the CTR cards.
  useEffect(() => {
    let cancelled = false;
    const useCustom = rangeMode === 'custom' && customRange?.from && customRange?.to;
    const start = useCustom
      ? startOfDay(customRange!.from!).toISOString()
      : startOfDay(subDays(new Date(), days - 1)).toISOString();
    const end = useCustom
      ? endOfDay(customRange!.to!).toISOString()
      : endOfDay(new Date()).toISOString();
    setReturningLoading(true);
    supabase
      .rpc('get_returning_visitor_stats', {
        p_start: start,
        p_end: end,
        p_include_internal: false,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setReturningStats(null);
        } else {
          setReturningStats(data[0] as ReturningStats);
        }
        setReturningLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeMode, days, customRange?.from?.getTime(), customRange?.to?.getTime()]);

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.utm_campaign && set.add(r.utm_campaign));
    return Array.from(set).sort();
  }, [rows]);

  // When the underlying campaign list changes (filter change / new data),
  // reset the export campaign selection so it stays in sync and never targets
  // campaigns that no longer exist in the current dataset.
  useEffect(() => {
    setExportCampaigns(null);
  }, [campaigns.join('|')]);

  /** Aggregate raw rows (which are split by placement × campaign) into a single
   *  row per placement so we can directly compare bio_primary vs secondary vs sticky. */
  const aggregated = useMemo<Aggregated[]>(() => {
    const map = new Map<string, Aggregated>();
    for (const placement of PLACEMENTS) {
      map.set(placement, {
        placement,
        lp_view: 0,
        lp_cta_impression: 0,
        lp_cta_click: 0,
        pdp_view: 0,
        add_to_cart: 0,
        ctr: 0,
        click_to_pdp: 0,
        pdp_to_atc: 0,
        end_to_end: 0,
      });
    }
    rows.forEach((r) => {
      const key = r.placement ?? '';
      if (!map.has(key)) return;
      const agg = map.get(key)!;
      agg.lp_view += r.lp_view;
      agg.lp_cta_impression += r.lp_cta_impression;
      agg.lp_cta_click += r.lp_cta_click;
      agg.pdp_view += r.pdp_view;
      agg.add_to_cart += r.add_to_cart;
    });
    const out = Array.from(map.values()).map((a) => ({
      ...a,
      ctr: pct(a.lp_cta_click, a.lp_cta_impression),
      click_to_pdp: pct(a.pdp_view, a.lp_cta_click),
      pdp_to_atc: pct(a.add_to_cart, a.pdp_view),
      end_to_end: pct(a.add_to_cart, a.lp_cta_impression),
    }));
    return out;
  }, [rows]);

  const winnerPlacement = useMemo(() => {
    const eligible = aggregated.filter((a) => a.lp_cta_impression > 0);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => (a.ctr >= b.ctr ? a : b));
  }, [aggregated]);

  const maxCtr = Math.max(1, ...aggregated.map((a) => a.ctr));

  /** Build a CSV containing both the per-placement aggregate (one row per
   *  placement with totals + CTRs) and the per-placement × campaign breakdown.
   *  The two sections are separated by a blank line so the file opens cleanly
   *  in Excel / Google Sheets while still being a single download. */
  function togglePlacement(p: string) {
    setExportPlacements((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleCampaign(c: string) {
    setExportCampaigns((prev) => {
      const base = prev ?? new Set(campaigns);
      const next = new Set(base);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function handleExportCsv() {
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmtNum = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '');

    const placementsToExport = aggregated.filter((a) => exportPlacements.has(a.placement));
    const campaignFilter = (utm: string | null): boolean => {
      if (exportCampaigns === null) return true;
      return exportCampaigns.has(utm ?? '');
    };

    const lines: string[] = [];
    const placementSummary = Array.from(exportPlacements).join('+') || 'none';
    const campaignSummary =
      exportCampaigns === null ? 'all' : Array.from(exportCampaigns).join('+') || 'none';
    lines.push(`# TikTok CTA CTR export — last ${days} days — view filter: ${campaign}`);
    lines.push(`# Export placements: ${placementSummary}`);
    lines.push(`# Export campaigns: ${campaignSummary}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');

    const headerCols = [
      'Section', 'Placement', 'Campaign',
      'Impressions', 'Clicks', 'CTR %',
      'PDP Views', 'Add to Cart',
      'Click→PDP %', 'PDP→ATC %', 'Impression→ATC %',
    ];

    // One section per selected placement: aggregate row + per-campaign rows.
    placementsToExport.forEach((agg, idx) => {
      if (idx > 0) lines.push('');
      lines.push(`## Placement: ${agg.placement} — ${PLACEMENT_LABELS[agg.placement] ?? ''}`);
      lines.push(headerCols.join(','));
      // Aggregate row first
      lines.push([
        'Aggregate', agg.placement, 'all',
        agg.lp_cta_impression, agg.lp_cta_click, fmtNum(agg.ctr),
        agg.pdp_view, agg.add_to_cart,
        fmtNum(agg.click_to_pdp), fmtNum(agg.pdp_to_atc), fmtNum(agg.end_to_end),
      ].map(escape).join(','));
      // Per-campaign rows for this placement
      const placementRows = rows
        .filter((r) => r.placement === agg.placement)
        .filter((r) => campaignFilter(r.utm_campaign));
      if (placementRows.length === 0) {
        lines.push(['Per campaign', agg.placement, '(no campaigns in selection)', '', '', '', '', '', '', '', ''].map(escape).join(','));
      } else {
        placementRows.forEach((r) => {
          const ctr = pct(r.lp_cta_click, r.lp_cta_impression);
          const c2p = pct(r.pdp_view, r.lp_cta_click);
          const p2a = pct(r.add_to_cart, r.pdp_view);
          const e2e = pct(r.add_to_cart, r.lp_cta_impression);
          lines.push([
            'Per campaign', r.placement ?? '', r.utm_campaign ?? '',
            r.lp_cta_impression, r.lp_cta_click, fmtNum(ctr),
            r.pdp_view, r.add_to_cart,
            fmtNum(c2p), fmtNum(p2a), fmtNum(e2e),
          ].map(escape).join(','));
        });
      }
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = `${placementSummary}_${campaignSummary}`.replace(/[^a-z0-9_+-]+/gi, '-').slice(0, 60);
    a.href = url;
    a.download = `tiktok-cta-ctr_${stamp}_${days}d_${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Build a multi-sheet XLSX workbook: a Summary sheet that compares all
   *  selected placements, plus one dedicated tab per placement containing both
   *  the aggregate totals and the per-campaign breakdown. */
  function handleExportXlsx() {
    const round2 = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(2)) : '');
    const placementsToExport = aggregated.filter((a) => exportPlacements.has(a.placement));
    const campaignFilter = (utm: string | null): boolean => {
      if (exportCampaigns === null) return true;
      return exportCampaigns.has(utm ?? '');
    };

    const wb = XLSX.utils.book_new();

    // ---------- Summary sheet ----------
    const windowLabel = rangeMode === 'custom' && customRange?.from && customRange?.to
      ? `${format(customRange.from, 'yyyy-MM-dd')} → ${format(customRange.to, 'yyyy-MM-dd')}`
      : `Last ${days} days`;
    const summaryAoa: (string | number)[][] = [
      ['TikTok CTA CTR Export'],
      ['Generated', new Date().toISOString()],
      ['Window', windowLabel],
      ['View filter (campaign)', campaign],
      ['Export placements', Array.from(exportPlacements).join(', ') || '(none)'],
      ['Export campaigns', exportCampaigns === null ? 'All' : (Array.from(exportCampaigns).join(', ') || '(none)')],
      [],
      ['Placement', 'Label', 'Impressions', 'Clicks', 'CTR %', 'PDP Views', 'Add to Cart', 'Click→PDP %', 'PDP→ATC %', 'Impression→ATC %'],
    ];
    placementsToExport.forEach((a) => {
      summaryAoa.push([
        a.placement,
        PLACEMENT_LABELS[a.placement] ?? '',
        a.lp_cta_impression,
        a.lp_cta_click,
        round2(a.ctr),
        a.pdp_view,
        a.add_to_cart,
        round2(a.click_to_pdp),
        round2(a.pdp_to_atc),
        round2(a.end_to_end),
      ]);
    });
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
    summarySheet['!cols'] = [
      { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ---------- One tab per placement ----------
    placementsToExport.forEach((agg) => {
      const placementRows = rows
        .filter((r) => r.placement === agg.placement)
        .filter((r) => campaignFilter(r.utm_campaign));

      const aoa: (string | number)[][] = [
        [`Placement: ${agg.placement}`],
        [PLACEMENT_LABELS[agg.placement] ?? ''],
        [],
        ['Aggregate (across selected campaigns)'],
        ['Metric', 'Value'],
        ['Impressions', agg.lp_cta_impression],
        ['Clicks', agg.lp_cta_click],
        ['CTR %', round2(agg.ctr)],
        ['PDP Views', agg.pdp_view],
        ['Add to Cart', agg.add_to_cart],
        ['Click→PDP %', round2(agg.click_to_pdp)],
        ['PDP→ATC %', round2(agg.pdp_to_atc)],
        ['Impression→ATC %', round2(agg.end_to_end)],
        [],
        ['Per campaign breakdown'],
        ['Campaign', 'Impressions', 'Clicks', 'CTR %', 'PDP Views', 'Add to Cart', 'Click→PDP %', 'PDP→ATC %', 'Impression→ATC %'],
      ];
      if (placementRows.length === 0) {
        aoa.push(['(no campaign data in current selection)']);
      } else {
        placementRows.forEach((r) => {
          aoa.push([
            r.utm_campaign ?? '(none)',
            r.lp_cta_impression,
            r.lp_cta_click,
            round2(pct(r.lp_cta_click, r.lp_cta_impression)),
            r.pdp_view,
            r.add_to_cart,
            round2(pct(r.pdp_view, r.lp_cta_click)),
            round2(pct(r.add_to_cart, r.pdp_view)),
            round2(pct(r.add_to_cart, r.lp_cta_impression)),
          ]);
        });
      }
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet['!cols'] = [
        { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      ];
      // Excel sheet names: max 31 chars, no special chars
      const sheetName = agg.placement.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const placementSummary = Array.from(exportPlacements).join('+') || 'none';
    const campaignSummary = exportCampaigns === null ? 'all' : (Array.from(exportCampaigns).join('+') || 'none');
    const slug = `${placementSummary}_${campaignSummary}`.replace(/[^a-z0-9_+-]+/gi, '-').slice(0, 60);
    XLSX.writeFile(wb, `tiktok-cta-ctr_${stamp}_${days}d_${slug}.xlsx`);
  }

  const canExport =
    !loading &&
    !error &&
    exportPlacements.size > 0 &&
    (exportCampaigns === null || exportCampaigns.size > 0) &&
    (aggregated.some((a) => a.lp_cta_impression > 0) || rows.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">TikTok CTA CTR Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Click-through rate per /go CTA placement, tied to downstream PDP views and add-to-cart conversions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Range mode toggles between preset "Last N days" and a custom date range */}
          <Select
            value={rangeMode === 'preset' ? `preset:${days}` : 'custom'}
            onValueChange={(v) => {
              if (v === 'custom') {
                setRangeMode('custom');
              } else {
                setRangeMode('preset');
                setDays(Number(v.replace('preset:', '')));
              }
            }}
          >
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="preset:1">Last 1 day</SelectItem>
              <SelectItem value="preset:7">Last 7 days</SelectItem>
              <SelectItem value="preset:14">Last 14 days</SelectItem>
              <SelectItem value="preset:30">Last 30 days</SelectItem>
              <SelectItem value="preset:90">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom range…</SelectItem>
            </SelectContent>
          </Select>
          {rangeMode === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('gap-2 font-normal', !customRange?.from && 'text-muted-foreground')}
                >
                  <CalendarIcon className="w-4 h-4" />
                  {customRange?.from && customRange?.to
                    ? `${format(customRange.from, 'MMM d')} – ${format(customRange.to, 'MMM d, yyyy')}`
                    : 'Pick range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={customRange}
                  onSelect={setCustomRange}
                  defaultMonth={customRange?.from}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          )}
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All campaigns" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!canExport}
            className="gap-1"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXlsx}
            disabled={!canExport}
            className="gap-1"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export XLSX
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" aria-label="Export options">
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Placements
                </p>
                <div className="space-y-2">
                  {PLACEMENTS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={exportPlacements.has(p)}
                        onCheckedChange={() => togglePlacement(p)}
                      />
                      <span className="font-mono text-xs">{p}</span>
                      <span className="text-muted-foreground text-xs">— {PLACEMENT_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Campaigns
                  </p>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      setExportCampaigns((prev) => (prev === null ? new Set() : null))
                    }
                  >
                    {exportCampaigns === null ? 'Customize' : 'All'}
                  </button>
                </div>
                {campaigns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No campaigns in current data.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {campaigns.map((c) => {
                      const checked =
                        exportCampaigns === null ? true : exportCampaigns.has(c);
                      return (
                        <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCampaign(c)}
                          />
                          <span className="text-xs truncate">{c}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground border-t pt-2">
                Aggregates and per-campaign rows in the CSV are filtered by these selections.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading CTR data…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Returning visitors KPI — uses persistent localStorage visitor_id.
              Only counts visitors seen since the visitor_id rollout, so early
              data may show 0% returning until the cohort accumulates. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  <Users className="w-3.5 h-3.5" /> Unique visitors
                </div>
                <p className="text-2xl font-bold">
                  {returningLoading ? '—' : (returningStats?.total_visitors ?? 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  <UserCheck className="w-3.5 h-3.5" /> Returning visitors
                </div>
                <p className="text-2xl font-bold">
                  {returningLoading ? '—' : (returningStats?.returning_visitors ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {returningLoading || !returningStats || returningStats.total_visitors === 0
                    ? '—'
                    : `${Number(returningStats.returning_visitor_pct).toFixed(1)}% of unique`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  <UserPlus className="w-3.5 h-3.5" /> New visitors
                </div>
                <p className="text-2xl font-bold">
                  {returningLoading ? '—' : (returningStats?.new_visitors ?? 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
                  <Eye className="w-3.5 h-3.5" /> Sessions
                </div>
                <p className="text-2xl font-bold">
                  {returningLoading ? '—' : (returningStats?.total_sessions ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {returningLoading || !returningStats || returningStats.total_visitors === 0
                    ? '—'
                    : `${(returningStats.total_sessions / Math.max(returningStats.total_visitors, 1)).toFixed(2)} per visitor`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Per-variant KPI widget — impressions / CTR / CVR / CPA per
              utm_campaign (the 3 TikTok video variants + bio hooks).
              Shares the same date window as the rest of the page. */}
          <TikTokVariantKpis
            startIso={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? startOfDay(customRange.from).toISOString()
                : startOfDay(subDays(new Date(), days - 1)).toISOString()
            }
            endIso={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? endOfDay(customRange.to).toISOString()
                : endOfDay(new Date()).toISOString()
            }
            windowLabel={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? `${format(customRange.from, 'MMM d')} → ${format(customRange.to, 'MMM d')}`
                : `Last ${days} days`
            }
          />

          {/* UTM campaign matching health — shows per-campaign funnel counts
              and flags orphan events, impossible sequences, dropoff cliffs. */}
          <UtmCampaignFunnelMatching
            startIso={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? startOfDay(customRange.from).toISOString()
                : startOfDay(subDays(new Date(), days - 1)).toISOString()
            }
            endIso={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? endOfDay(customRange.to).toISOString()
                : endOfDay(new Date()).toISOString()
            }
            windowLabel={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? `${format(customRange.from, 'MMM d')} → ${format(customRange.to, 'MMM d')}`
                : `Last ${days} days`
            }
          />

          {/* Conversion variant heatmap compare — side-by-side cards for the
              3 conv_* variants with deeplinks into Clarity heatmaps filtered
              on utm_campaign tag. */}
          <ConversionVariantHeatmapCompare
            startIso={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? startOfDay(customRange.from).toISOString()
                : startOfDay(subDays(new Date(), days - 1)).toISOString()
            }
            endIso={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? endOfDay(customRange.to).toISOString()
                : endOfDay(new Date()).toISOString()
            }
            windowLabel={
              rangeMode === 'custom' && customRange?.from && customRange?.to
                ? `${format(customRange.from, 'MMM d')} → ${format(customRange.to, 'MMM d')}`
                : `Last ${days} days`
            }
          />

          {/* Side-by-side placement comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aggregated.map((a) => {
              const isWinner = winnerPlacement?.placement === a.placement && a.lp_cta_impression > 0;
              const barWidth = Math.max(2, (a.ctr / maxCtr) * 100);
              return (
                <Card key={a.placement} className={isWinner ? 'border-primary shadow-md' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{PLACEMENT_LABELS[a.placement]}</CardTitle>
                        <Badge variant="outline" className="mt-1 font-mono text-[10px]">{a.placement}</Badge>
                      </div>
                      {isWinner && (
                        <Badge className="gap-1"><Trophy className="w-3 h-3" /> Winner</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">CTR (click / impression)</p>
                      <p className="text-3xl font-bold">
                        {a.lp_cta_impression ? `${a.ctr.toFixed(2)}%` : '—'}
                      </p>
                      <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border p-2">
                        <Eye className="w-3 h-3 mx-auto text-muted-foreground" />
                        <p className="text-[10px] uppercase text-muted-foreground mt-1">Impr.</p>
                        <p className="text-sm font-semibold">{a.lp_cta_impression.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <MousePointerClick className="w-3 h-3 mx-auto text-muted-foreground" />
                        <p className="text-[10px] uppercase text-muted-foreground mt-1">Clicks</p>
                        <p className="text-sm font-semibold">{a.lp_cta_click.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md border p-2">
                        <ShoppingCart className="w-3 h-3 mx-auto text-muted-foreground" />
                        <p className="text-[10px] uppercase text-muted-foreground mt-1">ATC</p>
                        <p className="text-sm font-semibold">{a.add_to_cart.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Click → PDP</span>
                        <span className="font-medium">{fmtPct(a.click_to_pdp, a.lp_cta_click)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PDP → Add-to-Cart</span>
                        <span className="font-medium">{fmtPct(a.pdp_to_atc, a.pdp_view)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Impression → ATC</span>
                        <span className="font-semibold">{fmtPct(a.end_to_end, a.lp_cta_impression)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detail table per placement × campaign */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per placement × campaign</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">No funnel events recorded in this window yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Placement</th>
                        <th className="py-2 pr-4">Campaign</th>
                        <th className="py-2 pr-4 text-right">Impr.</th>
                        <th className="py-2 pr-4 text-right">Clicks</th>
                        <th className="py-2 pr-4 text-right">CTR</th>
                        <th className="py-2 pr-4 text-right">PDP</th>
                        <th className="py-2 pr-4 text-right">ATC</th>
                        <th className="py-2 pr-4 text-right">Click→PDP</th>
                        <th className="py-2 pr-4 text-right">PDP→ATC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows
                        .filter((r) => r.placement && PLACEMENTS.includes(r.placement as typeof PLACEMENTS[number]))
                        .map((r, idx) => {
                          const ctr = pct(r.lp_cta_click, r.lp_cta_impression);
                          const c2p = pct(r.pdp_view, r.lp_cta_click);
                          const p2a = pct(r.add_to_cart, r.pdp_view);
                          return (
                            <tr key={`${r.placement}-${r.utm_campaign}-${idx}`}>
                              <td className="py-2 pr-4">
                                <Badge variant="outline" className="font-mono text-[10px]">{r.placement}</Badge>
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">{r.utm_campaign ?? '—'}</td>
                              <td className="py-2 pr-4 text-right">{r.lp_cta_impression.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right">{r.lp_cta_click.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right font-semibold">
                                {r.lp_cta_impression ? `${ctr.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-2 pr-4 text-right">{r.pdp_view.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right">{r.add_to_cart.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right">{fmtPct(c2p, r.lp_cta_click)}</td>
                              <td className="py-2 pr-4 text-right">{fmtPct(p2a, r.pdp_view)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}