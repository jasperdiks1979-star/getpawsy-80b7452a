import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PreRow = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  pin_queue_id: string | null;
  overall_score: number | null;
  passed: boolean | null;
  product_occupancy_pct: number | null;
  blocking_reasons: string[] | null;
  vision_model: string | null;
  latency_ms: number | null;
  created_at: string;
};

type PinRow = {
  id: string;
  product_slug: string | null;
  product_name: string | null;
  status: string | null;
  retries: number | null;
  publish_attempts: number | null;
  approved_at: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  pinterest_pin_id: string | null;
  external_url: string | null;
  last_publish_error: string | null;
  rejection_reason: string | null;
  updated_at: string;
};

type MergedRow = {
  key: string;
  productSlug: string;
  productName: string | null;
  latestPre: PreRow | null;
  attempts: number;
  totalPreEvals: number;
  pin: PinRow | null;
  updatedAt: string;
};

const WINDOW_LIMIT = 200;

function scoreTone(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 95) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (score >= 80) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function statusVariant(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "posted" || s === "published") return "default" as const;
  if (s === "publishing" || s === "queued" || s === "approved") return "secondary" as const;
  if (s === "failed" || s === "rejected") return "destructive" as const;
  return "outline" as const;
}

function stageLabel(pin: PinRow | null): string {
  if (!pin) return "no_pin";
  if (pin.pinterest_pin_id) return "published";
  const s = (pin.status ?? "").toLowerCase();
  if (!s) return "pending";
  return s;
}

export default function PreWaveLivePage() {
  const [pre, setPre] = useState<PreRow[]>([]);
  const [pins, setPins] = useState<Record<string, PinRow>>({});
  const [loading, setLoading] = useState(true);
  const [lastEvent, setLastEvent] = useState<string>("—");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const { data: preData } = await supabase
        .from("pre_evaluations")
        .select(
          "id,product_id,product_slug,pin_queue_id,overall_score,passed,product_occupancy_pct,blocking_reasons,vision_model,latency_ms,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(WINDOW_LIMIT);
      if (cancelled) return;
      const preRows = (preData ?? []) as PreRow[];
      setPre(preRows);

      const queueIds = Array.from(
        new Set(preRows.map((r) => r.pin_queue_id).filter(Boolean) as string[]),
      );
      if (queueIds.length > 0) {
        const { data: pinData } = await supabase
          .from("pinterest_pin_queue")
          .select(
            "id,product_slug,product_name,status,retries,publish_attempts,approved_at,scheduled_at,posted_at,pinterest_pin_id,external_url,last_publish_error,rejection_reason,updated_at",
          )
          .in("id", queueIds);
        if (cancelled) return;
        const map: Record<string, PinRow> = {};
        (pinData ?? []).forEach((p: any) => {
          map[p.id] = p as PinRow;
        });
        setPins(map);
      }
      setLoading(false);
    }

    bootstrap();

    const preChan = supabase
      .channel("pre-wave-live-pre")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pre_evaluations" },
        (payload) => {
          setLastEvent(`pre ${payload.eventType} @ ${new Date().toLocaleTimeString()}`);
          const row = payload.new as PreRow | undefined;
          if (!row?.id) return;
          setPre((prev) => {
            const next = [row, ...prev.filter((r) => r.id !== row.id)];
            return next.slice(0, WINDOW_LIMIT);
          });
          if (row.pin_queue_id && !pins[row.pin_queue_id]) {
            supabase
              .from("pinterest_pin_queue")
              .select(
                "id,product_slug,product_name,status,retries,publish_attempts,approved_at,scheduled_at,posted_at,pinterest_pin_id,external_url,last_publish_error,rejection_reason,updated_at",
              )
              .eq("id", row.pin_queue_id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setPins((m) => ({ ...m, [data.id]: data as PinRow }));
              });
          }
        },
      )
      .subscribe();

    const pinChan = supabase
      .channel("pre-wave-live-pins")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pinterest_pin_queue" },
        (payload) => {
          const row = payload.new as PinRow | undefined;
          if (!row?.id) return;
          setLastEvent(`pin ${payload.eventType} @ ${new Date().toLocaleTimeString()}`);
          setPins((prev) => (prev[row.id] ? { ...prev, [row.id]: row } : prev));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(preChan);
      supabase.removeChannel(pinChan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merged: MergedRow[] = useMemo(() => {
    const byKey = new Map<string, MergedRow>();
    for (const evalRow of pre) {
      const key = evalRow.pin_queue_id ?? `slug:${evalRow.product_slug ?? evalRow.id}`;
      const pin = evalRow.pin_queue_id ? pins[evalRow.pin_queue_id] ?? null : null;
      const existing = byKey.get(key);
      if (existing) {
        existing.attempts += 1;
        existing.totalPreEvals += 1;
        continue;
      }
      byKey.set(key, {
        key,
        productSlug: evalRow.product_slug ?? pin?.product_slug ?? "—",
        productName: pin?.product_name ?? null,
        latestPre: evalRow,
        attempts: 1,
        totalPreEvals: 1,
        pin,
        updatedAt: pin?.updated_at ?? evalRow.created_at,
      });
    }
    return Array.from(byKey.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [pre, pins]);

  const stats = useMemo(() => {
    const total = merged.length;
    const passing = merged.filter((m) => (m.latestPre?.overall_score ?? 0) >= 95).length;
    const queued = merged.filter((m) => {
      const s = (m.pin?.status ?? "").toLowerCase();
      return s === "queued" || s === "approved" || s === "publishing";
    }).length;
    const published = merged.filter(
      (m) => !!m.pin?.pinterest_pin_id || (m.pin?.status ?? "").toLowerCase() === "posted",
    ).length;
    const failed = merged.filter((m) =>
      ["failed", "rejected"].includes((m.pin?.status ?? "").toLowerCase()),
    ).length;
    const avgScore =
      total === 0
        ? 0
        : Math.round(
            merged.reduce((sum, m) => sum + (m.latestPre?.overall_score ?? 0), 0) / total,
          );
    return { total, passing, queued, published, failed, avgScore };
  }, [merged]);

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PRE Wave — Live</h1>
          <p className="text-sm text-muted-foreground">
            Real-time PRE scores, retries, and publish status for the current adaptive wave.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">Last event: {lastEvent}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          { label: "Tracked", value: stats.total },
          { label: "PRE ≥ 95", value: stats.passing },
          { label: "Queued", value: stats.queued },
          { label: "Published", value: stats.published },
          { label: "Failed", value: stats.failed },
          { label: "Avg score", value: stats.avgScore },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-2xl font-semibold tabular-nums">
              {s.value}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Wave activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">PRE</TableHead>
                <TableHead className="text-right">Occ %</TableHead>
                <TableHead className="text-right">PRE tries</TableHead>
                <TableHead className="text-right">Pub attempts</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Blocker / error</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Loading live wave…
                  </TableCell>
                </TableRow>
              )}
              {!loading && merged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No PRE activity in the current window.
                  </TableCell>
                </TableRow>
              )}
              {merged.map((row) => {
                const score = row.latestPre?.overall_score ?? null;
                const occ = row.latestPre?.product_occupancy_pct ?? null;
                const stage = stageLabel(row.pin);
                const blocker =
                  row.pin?.last_publish_error ||
                  row.pin?.rejection_reason ||
                  (row.latestPre?.blocking_reasons ?? []).slice(0, 2).join(", ") ||
                  "—";
                return (
                  <TableRow key={row.key}>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium">
                        {row.productName ?? row.productSlug}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.productSlug}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex min-w-[3rem] justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(score)}`}
                      >
                        {score ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {occ != null ? `${Math.round(occ)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.totalPreEvals}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.pin?.publish_attempts ?? row.pin?.retries ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(stage)} className="capitalize">
                        {stage}
                      </Badge>
                      {row.pin?.pinterest_pin_id && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          pin {row.pin.pinterest_pin_id.slice(0, 10)}…
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {blocker}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(row.updatedAt).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}