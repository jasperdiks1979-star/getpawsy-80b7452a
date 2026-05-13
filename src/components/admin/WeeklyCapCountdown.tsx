import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, CheckCircle2, Sparkles, X } from "lucide-react";

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

export function WeeklyCapCountdown({ weeklyLimit = 15, capStatus }: { weeklyLimit?: number; capStatus?: any }) {
  const [now, setNow] = useState<number>(Date.now());
  const notifiedSlots = useRef<Set<string>>(new Set());
  const initialMount = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const effectiveLimit = Number(capStatus?.effective_weekly_limit ?? capStatus?.weekly_limit ?? weeklyLimit);
  const used = Number(capStatus?.effective_weekly_usage ?? data?.length ?? 0);
  const expiredPins = Number(capStatus?.expired_pins_awaiting_cleanup ?? 0);
  const pausedPins = Number(capStatus?.paused_product_pins ?? 0);
  const discountedRunawayPins = Number(capStatus?.discounted_runaway_pins ?? 0);
  const recoverySlots = Number(capStatus?.recovery_slots_available ?? 0);
  const pressurePct = Math.round(Number(capStatus?.actual_scheduler_pressure ?? used / Math.max(1, effectiveLimit)) * 100);
  const usedPct = Math.min(100, Math.round((used / Math.max(1, effectiveLimit)) * 100));
  const atCap = used >= effectiveLimit && recoverySlots <= 0;

  // Slots that will free up: each posted pin "expires" 7 days after posted_at
  const diagnosticSlots = Array.isArray(capStatus?.rolling_slots) ? capStatus.rolling_slots : null;
  const slots = diagnosticSlots ? diagnosticSlots.map((r: any) => ({
    freesAtMs: new Date(r.expires_at).getTime(),
    productName: r.product_name || "—",
    productSlug: null,
  })) : (data ?? []).map((r: any) => ({
    freesAtMs: new Date(r.posted_at).getTime() + WEEK_MS,
    productName: r.product_name || "—",
    productSlug: r.product_slug || null,
  }));
  const nextReset = slots[0]?.freesAtMs ?? null;
  const upcoming = slots.slice(0, 10);

  // Hypothetical "what if I publish now" simulation
  const [simulating, setSimulating] = useState(false);
  const [simAtMs, setSimAtMs] = useState<number | null>(null);
  const [simNInput, setSimNInput] = useState<string>("3");
  const simN = Math.max(1, Math.min(50, Number(simNInput) || 1));
  const available = Math.max(0, effectiveLimit - used);
  const immediateCount = Math.min(simN, available);
  const blockedCount = Math.max(0, simN - available);
  // Sorted existing slot free times (earliest first)
  const sortedFreeTimes = [...slots]
    .map((s) => s.freesAtMs)
    .sort((a, b) => a - b);
  // For each blocked pin (1..blockedCount), the earliest it could be published
  // is when the (k-1)-th existing slot frees (0-indexed).
  const blockedSchedule = Array.from({ length: blockedCount }).map((_, k) => {
    const freesAt = sortedFreeTimes[k] ?? null;
    return { index: immediateCount + k + 1, publishAtMs: freesAt };
  });
  const fullyClearedAtMs = blockedSchedule.length
    ? blockedSchedule[blockedSchedule.length - 1].publishAtMs
    : (simAtMs ?? now);
  const simulatedUsed = Math.min(effectiveLimit, used + immediateCount);
  const simulatedAtCap = simulatedUsed >= effectiveLimit;
  const wouldBlock = used >= effectiveLimit && recoverySlots <= 0;

  function runSimulation() {
    const t = Date.now();
    setSimAtMs(t);
    setSimulating(true);
    toast.info(`Simulated publishing ${simN} pin${simN > 1 ? "s" : ""} now`, {
      description: blockedCount > 0
        ? `${immediateCount} would publish, ${blockedCount} blocked by weekly cap.`
        : `All ${simN} would publish — slots free 7d later.`,
    });
  }
  function clearSimulation() {
    setSimulating(false);
    setSimAtMs(null);
  }

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
          description: `You have room to publish another pin (currently using ${used}/${effectiveLimit}).`,
          duration: 8000,
        });
      }
    }
  }, [now, upcoming, used, effectiveLimit]);

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
          <Badge variant={atCap ? "destructive" : used >= effectiveLimit * 0.8 ? "secondary" : "default"}>
            {used}/{effectiveLimit} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">Scenario: publish N pins now</div>
            <div>Simulates batch cap impact, blocked pins, and when each slot frees.</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-muted-foreground">N =</label>
            <Input
              type="number"
              min={1}
              max={50}
              value={simNInput}
              onChange={(e) => setSimNInput(e.target.value)}
              className="h-8 w-16 font-mono text-sm"
            />
            {simulating && (
              <Button size="sm" variant="ghost" onClick={clearSimulation}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={runSimulation}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Simulate
            </Button>
          </div>
        </div>

        {simulating && simAtMs && (
          <div className="rounded-lg border p-4 bg-accent/30 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                Simulation result — publish {simN} pin{simN > 1 ? "s" : ""} now
              </div>
              <Badge variant={blockedCount === simN ? "destructive" : blockedCount > 0 ? "secondary" : "default"}>
                {blockedCount === simN
                  ? `BLOCKED — all ${simN} rejected`
                  : blockedCount > 0
                    ? `${immediateCount} OK · ${blockedCount} BLOCKED`
                    : `OK — all ${simN} would publish`}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 text-xs">
              <div className="rounded-md bg-background border p-2">
                <div className="text-muted-foreground">Publish immediately</div>
                <div className="font-mono text-base font-semibold">{immediateCount}/{simN}</div>
              </div>
              <div className="rounded-md bg-background border p-2">
                <div className="text-muted-foreground">Blocked by cap</div>
                <div className="font-mono text-base font-semibold">{blockedCount}/{simN}</div>
              </div>
              <div className="rounded-md bg-background border p-2">
                <div className="text-muted-foreground">Cap after publish</div>
                <div className="font-mono text-base font-semibold">{simulatedUsed}/{effectiveLimit}</div>
              </div>
            </div>
            {immediateCount > 0 && (
              <div className="text-xs text-muted-foreground">
                {immediateCount} pin{immediateCount > 1 ? "s" : ""} would publish at{" "}
                <span className="font-medium text-foreground">{formatLocal(simAtMs)}</span> and free{" "}
                {immediateCount > 1 ? "their slots" : "its slot"} at{" "}
                <span className="font-medium text-foreground">{formatLocal(simAtMs + WEEK_MS)}</span>.
              </div>
            )}
            {blockedCount > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Blocked pins — earliest publish window
                </div>
                <div className="space-y-1">
                  {blockedSchedule.map((b) => {
                    const remaining = b.publishAtMs ? b.publishAtMs - now : null;
                    return (
                      <div
                        key={b.index}
                        className="flex items-center justify-between rounded-md border bg-background p-2 text-xs"
                      >
                        <span className="font-mono text-muted-foreground">Pin #{b.index}</span>
                        <div className="flex items-center gap-2">
                          {b.publishAtMs ? (
                            <>
                              <span className="text-muted-foreground hidden sm:inline">
                                {formatLocal(b.publishAtMs)}
                              </span>
                              <Badge variant="outline" className="font-mono">
                                in {formatDuration(remaining ?? 0)}
                              </Badge>
                            </>
                          ) : (
                            <Badge variant="destructive" className="font-mono">no slot data</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {fullyClearedAtMs && (
                  <div className="text-xs text-muted-foreground pt-1">
                    All {simN} pins cleared by{" "}
                    <span className="font-medium text-foreground">{formatLocal(fullyClearedAtMs)}</span>{" "}
                    (in {formatDuration(fullyClearedAtMs - now)}).
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Actual scheduler pressure</span>
            <span className="font-mono">{pressurePct}%</span>
          </div>
          <Progress value={usedPct} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Active rolling pins", `${used}/${effectiveLimit}`],
            ["Expired awaiting cleanup", expiredPins],
            ["Paused-product pins", pausedPins],
            ["Discounted runaway pins", discountedRunawayPins],
            ["Recovery slots", recoverySlots],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="font-mono text-lg font-semibold">{String(value)}</div>
            </div>
          ))}
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
              <span>No pins in the rolling window — full {effectiveLimit}-pin budget available now.</span>
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