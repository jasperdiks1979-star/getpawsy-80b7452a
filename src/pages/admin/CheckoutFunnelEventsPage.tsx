import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface Row {
  id: string;
  created_at: string;
  session_id: string | null;
  user_id: string | null;
  stripe_session_id: string | null;
  step: string;
  value: number | null;
  currency: string | null;
  payment_method: string | null;
  is_klarna: boolean | null;
  metadata: unknown;
  source: string | null;
}

const STEP_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  ViewContent: "secondary",
  AddToCart: "secondary",
  InitiateCheckout: "outline",
  CheckoutCreated: "outline",
  Purchase: "default",
  Abandoned: "destructive",
};

const STEPS = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "CheckoutCreated",
  "Purchase",
  "Abandoned",
];

interface Group {
  key: string;
  stripeSessionId: string | null;
  sessionId: string | null;
  events: Row[];
  steps: Set<string>;
  lastAt: string;
  total: number;
  currency: string;
  isKlarna: boolean;
  paymentMethod: string | null;
}

export default function CheckoutFunnelEventsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stepFilter, setStepFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("checkout_funnel_events")
      .select(
        "id, created_at, session_id, user_id, stripe_session_id, step, value, currency, payment_method, is_klarna, metadata, source",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data) setRows(data as unknown as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.step, (counts.get(r.step) ?? 0) + 1);
    return STEPS.map((s) => ({ step: s, count: counts.get(s) ?? 0 })).filter(
      (s) => s.count > 0,
    );
  }, [rows]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      const key =
        r.stripe_session_id ?? r.session_id ?? `orphan:${r.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.events.push(r);
        existing.steps.add(r.step);
        if (r.created_at > existing.lastAt) existing.lastAt = r.created_at;
        if (r.value && r.value > existing.total) existing.total = Number(r.value);
        if (r.is_klarna) existing.isKlarna = true;
        if (r.payment_method && !existing.paymentMethod)
          existing.paymentMethod = r.payment_method;
      } else {
        map.set(key, {
          key,
          stripeSessionId: r.stripe_session_id,
          sessionId: r.session_id,
          events: [r],
          steps: new Set([r.step]),
          lastAt: r.created_at,
          total: Number(r.value ?? 0),
          currency: r.currency ?? "usd",
          isKlarna: !!r.is_klarna,
          paymentMethod: r.payment_method,
        });
      }
    }
    let list = Array.from(map.values()).sort((a, b) =>
      b.lastAt.localeCompare(a.lastAt),
    );
    if (stepFilter !== "all") {
      list = list.filter((g) => g.steps.has(stepFilter));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (g) =>
          g.key.toLowerCase().includes(q) ||
          (g.stripeSessionId ?? "").toLowerCase().includes(q) ||
          (g.sessionId ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, stepFilter, search]);

  return (
    <div className="container mx-auto py-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Checkout Funnel Events</h1>
        <p className="text-muted-foreground text-sm">
          Grouped per order (Stripe session). Use the filter to find orders that
          stopped at a given step (e.g.{" "}
          <code>InitiateCheckout</code> with no <code>Purchase</code>).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step counts (latest 500 events)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {summary.length === 0 && (
            <p className="text-sm text-muted-foreground">No funnel events yet.</p>
          )}
          {summary.map((s) => (
            <Badge key={s.step} variant={STEP_VARIANT[s.step] ?? "secondary"}>
              {s.step}: {s.count}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={stepFilter} onValueChange={setStepFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter by step" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All steps</SelectItem>
            {STEPS.map((s) => (
              <SelectItem key={s} value={s}>
                Contains {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-[280px]"
          placeholder="Search session id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {groups.length} order{groups.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {groups.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No orders match this filter.
          </p>
        )}
        {groups.map((g) => {
          const isOpen = expanded === g.key;
          const reachedPurchase = g.steps.has("Purchase");
          const reachedInit = g.steps.has("InitiateCheckout") || g.steps.has("CheckoutCreated");
          return (
            <div key={g.key} className="rounded-lg border bg-card">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : g.key)}
                className="w-full p-3 text-left flex items-center gap-3 flex-wrap"
              >
                <Badge
                  variant={
                    reachedPurchase
                      ? "default"
                      : reachedInit
                        ? "outline"
                        : "secondary"
                  }
                >
                  {reachedPurchase
                    ? "Purchased"
                    : reachedInit
                      ? "Started"
                      : "Browsing"}
                </Badge>
                <span className="font-mono text-xs truncate max-w-[260px]">
                  {g.stripeSessionId ?? g.sessionId ?? g.key}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {STEPS.filter((s) => g.steps.has(s)).map((s) => (
                    <Badge
                      key={s}
                      variant={STEP_VARIANT[s] ?? "secondary"}
                      className="text-[10px]"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
                {g.isKlarna && (
                  <Badge variant="outline" className="text-[10px]">
                    Klarna
                  </Badge>
                )}
                {g.paymentMethod && !g.isKlarna && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {g.paymentMethod}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {g.total
                    ? `${g.currency.toUpperCase()} ${g.total.toFixed(2)} · `
                    : ""}
                  {new Date(g.lastAt).toLocaleString()}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {g.events
                    .slice()
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((e) => (
                      <div
                        key={e.id}
                        className="rounded border bg-muted/30 p-2 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge
                            variant={STEP_VARIANT[e.step] ?? "secondary"}
                          >
                            {e.step}
                          </Badge>
                          <span className="font-mono">
                            {new Date(e.created_at).toLocaleString()}
                          </span>
                          {e.value !== null && (
                            <span className="font-mono">
                              {(e.currency ?? "usd").toUpperCase()}{" "}
                              {Number(e.value).toFixed(2)}
                            </span>
                          )}
                          {e.source && (
                            <span className="text-muted-foreground">
                              source={e.source}
                            </span>
                          )}
                        </div>
                        <pre className="text-[11px] overflow-x-auto">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}