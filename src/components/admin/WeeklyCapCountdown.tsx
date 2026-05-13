import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle2 } from "lucide-react";

const WEEK_MS = 7 * 24 * 3600 * 1000;

function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatLocal(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WeeklyCapCountdown({ weeklyLimit = 15 }: { weeklyLimit?: number }) {
  const [now, setNow] = useState<number>(Date.now());
  const notifiedSlots = useRef<Set<string>>(new Set());
  const initialMount = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    for (const s of upcoming) {
      const remaining = s.freesAtMs - now;
      const key = `${s.freesAtMs}-${s.productSlug ?? s.productName}`;
      if (remaining <= 0 && !notifiedSlots.current.has(key)) {
        notifiedSlots.current.add(key);
        toast.success(`Weekly cap slot freed up! "${s.productName}" is now available again.`, {
          description: `You have room to publish another pin (currently using ${used}/${weeklyLimit}).`,
          duration: 8000,
        });
      }
    }
  }, [now, upcoming, used, weeklyLimit]);

  const { data, isLoading } = useQuery({
    queryKey: ["pinterest-weekly-cap-timeline"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - WEEK_MS).toISOString();
      const { data, error } = await supabase
        .from("pinterest_pin_queue")
        .select("posted_at,pinterest_pin_id,pin_external_id,product_name,product_slug")
        .eq("status", "posted")
        .gte("posted_at", since)
        .order("posted_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      const seen = new Set<string>();
      const rows = (data ?? []).filter((r: any) => {
        const id = r.pinterest_pin_id || r.pin_external_id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return !!r.posted_at;
      });
      return rows;
    },
  });

  const used = data?.length ?? 0;
  const usedPct = Math.min(100, Math.round((used / Math.max(1, weeklyLimit)) * 100));
  const atCap = used >= weeklyLimit;

  // Slots that will free up: each posted pin "expires" 7 days after posted_at
  const slots = (data ?? []).map((r: any) => ({
    freesAtMs: new Date(r.posted_at).getTime() + WEEK_MS,
    productName: r.product_name || "—",
    productSlug: r.product_slug || null,
  }));
  const nextReset = slots[0]?.freesAtMs ?? null;
  const upcoming = slots.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Weekly cap reset countdown</CardTitle>
            <CardDescription>
              Rolling 7-day publish window. Each posted pin frees its slot exactly 7 days after publication — there is no fixed weekly reset.
            </CardDescription>
          </div>
          <Badge variant={atCap ? "destructive" : used >= weeklyLimit * 0.8 ? "secondary" : "default"}>
            {used}/{weeklyLimit} used
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Weekly budget consumed</span>
            <span className="font-mono">{usedPct}%</span>
          </div>
          <Progress value={usedPct} />
        </div>

        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
            <Clock className="h-3.5 w-3.5" />
            Next slot frees in
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !nextReset ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>No pins in the rolling window — full {weeklyLimit}-pin budget available now.</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-3xl font-bold font-mono tabular-nums">
                {formatDuration(nextReset - now)}
              </div>
              <div className="text-xs text-muted-foreground">
                Frees at <span className="font-medium text-foreground">{formatLocal(nextReset)}</span>
              </div>
            </div>
          )}
        </div>

        {upcoming.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Slot timeline (next {upcoming.length})
            </div>
            <div className="space-y-1.5">
              {upcoming.map((s, i) => {
                const remaining = s.freesAtMs - now;
                const freed = remaining <= 0;
                return (
                  <div
                    key={`${s.freesAtMs}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-muted-foreground w-6 text-right">#{i + 1}</span>
                      <span className="truncate font-medium">{s.productName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground hidden sm:inline">{formatLocal(s.freesAtMs)}</span>
                      <Badge variant={freed ? "default" : "outline"} className="font-mono">
                        {freed ? "FREE" : formatDuration(remaining)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}