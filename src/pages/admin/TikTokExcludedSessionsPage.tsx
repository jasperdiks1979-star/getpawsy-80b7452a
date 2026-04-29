/**
 * TikTokExcludedSessionsPage — admin overview of TikTok-tagged sessions that
 * the performance reports filter out, with the exact rule(s) responsible.
 *
 * Backed by the `get_tiktok_excluded_sessions` RPC. Mirrors the same exclusion
 * logic used in `get_tiktok_hook_performance` and `get_tiktok_bio_split` so a
 * dropped session here matches what's missing in those dashboards.
 */
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

type RuleKey = 'is_internal' | 'country=NL' | 'admin_route' | 'bot_heuristic';

interface ExcludedRow {
  session_id: string;
  first_seen: string;
  last_seen: string;
  event_count: number;
  hook: string;
  utm_content: string;
  country: string;
  browser: string;
  screen_width: number;
  rules: RuleKey[];
  is_excluded?: boolean;
}

interface Summary {
  is_internal: number;
  country_nl: number;
  admin_route: number;
  bot_heuristic: number;
  any_excluded: number;
  total_sessions: number;
}

interface Payload {
  window_days: number;
  total: number;
  limit: number;
  offset: number;
  rule_filter: string | null;
  include_excluded?: boolean;
  summary: Summary;
  rows: ExcludedRow[];
}

const RULE_LABEL: Record<RuleKey, string> = {
  is_internal: 'Internal / Founder',
  'country=NL': 'NL traffic',
  admin_route: 'Admin route visit',
  bot_heuristic: 'Bot heuristic',
};

const RULE_TONE: Record<RuleKey, string> = {
  is_internal: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  'country=NL': 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  admin_route: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
  bot_heuristic: 'bg-destructive/15 text-destructive border-destructive/40',
};

const PAGE_SIZE = 100;
const WINDOW_OPTIONS = [1, 7, 14, 30, 90];
const RULE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All rules' },
  { value: 'is_internal', label: 'Internal / Founder' },
  { value: 'country=NL', label: 'NL traffic' },
  { value: 'admin_route', label: 'Admin route visit' },
  { value: 'bot_heuristic', label: 'Bot heuristic' },
];

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function TikTokExcludedSessionsPage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [rule, setRule] = useState<string>('all');
  const [offset, setOffset] = useState<number>(0);
  // Admin override: when ON, the RPC returns ALL TikTok sessions (including
  // ones that would normally be kept), so admins can validate exactly which
  // sessions the dashboard counts vs. drops.
  const [includeExcluded, setIncludeExcluded] = useState<boolean>(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase.rpc('get_tiktok_excluded_sessions', {
        p_window_days: windowDays,
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_rule: rule === 'all' ? null : rule,
        p_include_excluded: includeExcluded,
      });
      if (cancelled) return;
      if (error) { setError(error.message); setData(null); }
      else setData(data as unknown as Payload);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [windowDays, rule, offset, includeExcluded]);

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const exclusionRate = useMemo(() => {
    if (!summary || summary.total_sessions === 0) return 0;
    return Math.round((summary.any_excluded / summary.total_sessions) * 1000) / 10;
  }, [summary]);

  return (
    <div className="space-y-6">
      <Helmet>
        <title>TikTok Excluded Sessions — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TikTok Excluded Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Sessions tagged as TikTok traffic that were filtered out of the performance
            reports, with the exact rule that caused the exclusion. Mirrors the
            session-level exclusion logic used in the hook and bio dashboards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(windowDays)} onValueChange={(v) => { setOffset(0); setWindowDays(Number(v)); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Window" /></SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>{d === 1 ? 'Last 24h' : `Last ${d} days`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={rule} onValueChange={(v) => { setOffset(0); setRule(v); }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Rule" /></SelectTrigger>
            <SelectContent>
              {RULE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 pl-2 border-l border-border/60">
            <Switch
              id="tiktok-excl-show-all"
              checked={includeExcluded}
              onCheckedChange={(v) => { setOffset(0); setIncludeExcluded(Boolean(v)); }}
              aria-label="Show all sessions including kept ones"
            />
            <Label htmlFor="tiktok-excl-show-all" className="text-xs whitespace-nowrap cursor-pointer">
              Show all sessions
            </Label>
          </div>
        </div>
      </div>

      {includeExcluded && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
          <strong>Admin override:</strong> showing every TikTok session in the window — kept rows
          appear with an empty rules list. Use to verify exactly what each performance report
          would and would not include.
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">Excluded sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.any_excluded ?? 0}<div className="text-xs text-muted-foreground font-normal mt-1">{exclusionRate}% of TikTok sessions</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">Internal / Founder</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.is_internal ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">NL traffic</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.country_nl ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">Admin route</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.admin_route ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">Bot heuristic</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.bot_heuristic ?? 0}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">
            Sessions {total > 0 ? <span className="text-muted-foreground font-normal">({total.toLocaleString()})</span> : null}
          </CardTitle>
          {loading ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-sm text-destructive py-4">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No excluded TikTok sessions in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Last seen</th>
                    <th className="py-2 pr-3 font-medium">Session</th>
                    <th className="py-2 pr-3 font-medium">Hook</th>
                    <th className="py-2 pr-3 font-medium">Content</th>
                    <th className="py-2 pr-3 font-medium">Country</th>
                    <th className="py-2 pr-3 font-medium">Browser</th>
                    <th className="py-2 pr-3 font-medium text-right">Events</th>
                    <th className="py-2 pr-3 font-medium">Excluded by</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.session_id} className="border-b border-border/30 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(r.last_seen)}</td>
                      <td className="py-2 pr-3 font-mono max-w-[180px] truncate" title={r.session_id}>{r.session_id}</td>
                      <td className="py-2 pr-3"><Badge variant="outline" className="font-mono text-[11px]">{r.hook}</Badge></td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.utm_content || '—'}</td>
                      <td className="py-2 pr-3">{r.country || '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.browser || '—'}
                        {r.screen_width === 0 ? <span className="ml-1 text-destructive">·0px</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.event_count}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {r.rules.map((k) => (
                            <span key={k} className={`inline-block px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wide ${RULE_TONE[k]}`}>
                              {RULE_LABEL[k]}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span>Page {currentPage} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={offset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total || loading}
                    onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
