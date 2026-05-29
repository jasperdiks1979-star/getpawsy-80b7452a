/**
 * /admin/degraded-events — Inspect degraded funnel events.
 *
 * Lists rows from lp_funnel_events where degraded = true.
 * Filters by device, geo_tier, and degraded_reason (extracted from raw_payload).
 * QA events are always excluded.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';

type Range = '24h' | '7d' | '30d';
type GeoTier = 'all' | 'verified_us' | 'probable_us' | 'non_us' | 'unknown';
type Device = 'all' | 'mobile' | 'desktop' | 'tablet' | 'unknown';

interface EventRow {
  id: string;
  created_at: string;
  event_name: string;
  session_id: string;
  device: string | null;
  geo_tier: string | null;
  classification: string | null;
  degraded_reason: string | null;
  source_component: string | null;
  product_id: string | null;
  product_name: string | null;
  page_path: string | null;
  validation_status: string | null;
  is_bot: boolean | null;
}

const REASON_OPTIONS = [
  { v: 'all', l: 'All reasons' },
  { v: 'no_product_id', l: 'No product_id' },
  { v: 'no_product_id_or_slug', l: 'No product_id or slug' },
  { v: 'no_cart_id', l: 'No cart_id' },
  { v: 'no_item_count', l: 'No item_count' },
  { v: 'no_cart_or_items', l: 'No cart or items' },
  { v: 'unknown', l: 'Unknown / other' },
];

function rangeStart(r: Range): string {
  const days = r === '24h' ? 1 : r === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 3600e3).toISOString();
}

export default function DegradedEventsPage() {
  const [range, setRange] = useState<Range>('7d');
  const [geoTier, setGeoTier] = useState<GeoTier>('all');
  const [device, setDevice] = useState<Device>('all');
  const [reason, setReason] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('lp_funnel_events')
      .select(
        'id, created_at, event_name, session_id, device, geo_tier, classification, source_component, product_id, product_name, page_path, validation_status, is_bot, raw_payload->>degraded_reason as degraded_reason'
      )
      .eq('degraded', true)
      .eq('qa', false)
      .gte('created_at', rangeStart(range))
      .order('created_at', { ascending: false })
      .limit(500);

    if (geoTier !== 'all') {
      query = query.eq('geo_tier', geoTier);
    }
    if (device !== 'all') {
      query = query.eq('device', device);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as EventRow[]);
    }
    setLoading(false);
  }, [range, geoTier, device]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (reason === 'all') return rows;
    if (reason === 'unknown') {
      return rows.filter((r) => !r.degraded_reason || r.degraded_reason === 'null');
    }
    return rows.filter((r) => r.degraded_reason === reason);
  }, [rows, reason]);

  const summary = useMemo(() => {
    const byReason: Record<string, number> = {};
    for (const r of rows) {
      const k = r.degraded_reason || 'unknown';
      byReason[k] = (byReason[k] || 0) + 1;
    }
    return { total: rows.length, byReason };
  }, [rows]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <>
      <Helmet>
        <title>Degraded Events | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Degraded Events
            </h1>
            <p className="text-sm text-muted-foreground">
              Funnel events that fired with missing metadata but preserved envelope (classification, geo_tier, device).
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FilterSelect label="Range" value={range} onChange={(v) => setRange(v as Range)} options={[
              { v: '24h', l: 'Last 24h' }, { v: '7d', l: 'Last 7d' }, { v: '30d', l: 'Last 30d' },
            ]} />
            <FilterSelect label="Geo tier" value={geoTier} onChange={(v) => setGeoTier(v as GeoTier)} options={[
              { v: 'all', l: 'All' },
              { v: 'verified_us', l: 'Verified US' },
              { v: 'probable_us', l: 'Probable US' },
              { v: 'non_us', l: 'Non-US' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <FilterSelect label="Device" value={device} onChange={(v) => setDevice(v as Device)} options={[
              { v: 'all', l: 'All' },
              { v: 'mobile', l: 'Mobile' },
              { v: 'desktop', l: 'Desktop' },
              { v: 'tablet', l: 'Tablet' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <FilterSelect label="Degraded reason" value={reason} onChange={(v) => setReason(v)} options={REASON_OPTIONS} />
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total degraded</p>
              <p className="text-2xl font-bold mt-1">{summary.total}</p>
            </CardContent>
          </Card>
          {Object.entries(summary.byReason).slice(0, 3).map(([k, n]) => (
            <Card key={k}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground truncate">{k.replace(/_/g, ' ')}</p>
                <p className="text-2xl font-bold mt-1">{n}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Query failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Degraded events ({filtered.length} shown)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Geo tier</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Bot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                        {loading ? 'Loading…' : 'No degraded events match the current filters.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(r.created_at)}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{r.event_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {(r.degraded_reason || 'unknown').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.device ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.geo_tier ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.session_id.slice(0, 12)}…
                        </TableCell>
                        <TableCell className="text-xs">{r.source_component ?? '—'}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={r.product_id ?? ''}>
                          {r.product_id ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={r.page_path ?? ''}>
                          {r.page_path ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.is_bot ? <Badge variant="destructive" className="text-[10px]">Bot</Badge> : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
