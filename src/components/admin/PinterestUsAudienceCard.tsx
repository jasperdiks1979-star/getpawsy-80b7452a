import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BoardRow { board: string; clicks: number; }
interface CountryRow { country: string; clicks: number; }
interface StateRow { state: string; clicks: number; }
interface ProductRow { product_name: string; clicks: number; }

interface Stats {
  totalClicks: number;
  usClicks: number;
  usPct: number;
  conversionPct: number;
  topBoards: BoardRow[];
  topCountries: CountryRow[];
  topUsStates: StateRow[];
  topProducts: ProductRow[];
  windowDays: number;
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function PinterestUsAudienceCard() {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
      const { data, error: qErr } = await supabase
        .from("visitor_activity")
        .select("country, city, utm_content, product_name, activity_type, order_id")
        .eq("utm_source", "pinterest")
        .eq("is_internal", false)
        .gte("created_at", since)
        .limit(5000);
      if (qErr) throw qErr;
      const rows = data || [];

      const totalClicks = rows.length;
      const usRows = rows.filter((r: any) => (r.country || "").toLowerCase() === "us" || (r.country || "").toLowerCase() === "united states");
      const usClicks = usRows.length;
      const purchases = rows.filter((r: any) => r.order_id || r.activity_type === "purchase").length;

      const tally = <T extends string>(arr: any[], key: (r: any) => T | null | undefined) => {
        const m = new Map<T, number>();
        for (const r of arr) {
          const k = key(r);
          if (!k) continue;
          m.set(k, (m.get(k) || 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      };

      const topBoards: BoardRow[] = tally(rows, (r) => {
        const c = r.utm_content as string | null;
        if (!c) return null;
        return c.startsWith("board_") ? c.replace(/^board_/, "") : c;
      }).map(([board, clicks]) => ({ board, clicks }));

      const topCountries: CountryRow[] = tally(rows, (r) => r.country || null)
        .map(([country, clicks]) => ({ country, clicks }));

      const topUsStates: StateRow[] = tally(usRows, (r) => r.city || null)
        .map(([state, clicks]) => ({ state, clicks }));

      const topProducts: ProductRow[] = tally(rows, (r) => r.product_name || null)
        .map(([product_name, clicks]) => ({ product_name, clicks }));

      setStats({
        totalClicks,
        usClicks,
        usPct: pct(usClicks, totalClicks),
        conversionPct: pct(purchases, totalClicks),
        topBoards,
        topCountries,
        topUsStates,
        topProducts,
        windowDays,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load Pinterest US analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [windowDays]);

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4" /> Pinterest — US Audience
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Traffic from Pinterest in the last {windowDays} days. Board attribution via <code>utm_content=board_&lt;id&gt;</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={windowDays === 7 ? "default" : "outline"} onClick={() => setWindowDays(7)}>7d</Button>
          <Button size="sm" variant={windowDays === 30 ? "default" : "outline"} onClick={() => setWindowDays(30)}>30d</Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!stats && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Pinterest clicks" value={stats.totalClicks.toString()} />
              <Stat label="US clicks" value={stats.usClicks.toString()} highlight={stats.usPct >= 60} />
              <Stat label="US share" value={`${stats.usPct}%`} highlight={stats.usPct >= 60} />
              <Stat label="Conv. rate" value={`${stats.conversionPct}%`} />
            </div>

            {stats.totalClicks === 0 && (
              <p className="text-sm text-muted-foreground">
                Collecting data — no Pinterest visits with UTM tracking in this window yet. New pins started carrying <code>utm_content=board_&lt;id&gt;</code> after Phase 2 deploy.
              </p>
            )}

            <RankList title="Top countries" rows={stats.topCountries.map((r) => ({ label: r.country, value: r.clicks }))} />
            <RankList title="Top US cities / regions" rows={stats.topUsStates.map((r) => ({ label: r.state, value: r.clicks }))} />
            <RankList title="Top boards (by attributed clicks)" rows={stats.topBoards.map((r) => ({ label: r.board, value: r.clicks }))} />
            <RankList title="Top products" rows={stats.topProducts.map((r) => ({ label: r.product_name, value: r.clicks }))} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/60 bg-primary/5" : "border-border"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex items-center gap-2">
            <div className="flex-1 truncate text-sm">{r.label}</div>
            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            <Badge variant="secondary" className="text-xs">{r.value}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
