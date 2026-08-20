import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, ShoppingCart, CreditCard } from "lucide-react";
import { PanelLoadingState } from "@/components/admin/PanelLoadingState";
import { derivePinterestTruthStats, type PinterestTruthRow } from "@/lib/pinterestTruthPanel";
import type { TruthSession } from "@/hooks/useAnalyticsTruth";

/**
 * Pinterest Traffic — DERIVED panel.
 *
 * Consumes the shared `analytics-canonical` payload already fetched for the
 * Visitor World Map. It performs NO request of its own: no supabase query,
 * no edge call, no independent timeout, no fallback path. State machine:
 *
 *   shared payload loading/erroring -> shared PanelLoadingState (retry = shared retry)
 *   shared payload present, 0 pins  -> DATA_AVAILABLE_ZERO (honest zero state)
 *   shared payload present, >0      -> derived metrics
 */
export interface PinterestTrafficPanelProps {
  sessions: TruthSession[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  attempt?: number;
  maxAttempts?: number;
  usOnly?: boolean;
  excludeInternal?: boolean;
  windowLabel?: string;
}

const PinIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
    <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0" />
  </svg>
);

function MiniRows({ title, rows }: { title: string; rows: PinterestTruthRow[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="truncate max-w-[190px]">{r.label}</span>
            <Badge variant="secondary" className="text-xs">{r.count}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PinterestTrafficPanel = ({
  sessions,
  isLoading,
  isError,
  error,
  onRetry,
  attempt,
  maxAttempts,
  usOnly,
  excludeInternal,
  windowLabel = "gedeeld tijdvenster",
}: PinterestTrafficPanelProps) => {
  const stats = useMemo(
    () => (sessions ? derivePinterestTruthStats(sessions, { usOnly, excludeInternal }) : null),
    [sessions, usOnly, excludeInternal],
  );

  const shell = (children: React.ReactNode, badge?: string) => (
    <Card data-testid="pinterest-traffic-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <PinIcon />
          Pinterest Traffic
          {badge && <Badge variant="outline" className="ml-auto text-xs">{badge}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );

  // DATA_UNAVAILABLE_ERROR / still warming — mirrors the shared canonical state.
  if (!stats) {
    return shell(
      <div data-testid="pinterest-traffic-state" data-state={isError ? "DATA_UNAVAILABLE_ERROR" : "DATA_LOADING"}>
        <PanelLoadingState
          isLoading={!!isLoading || (!isError && !sessions)}
          isError={!!isError}
          error={error}
          onRetry={onRetry}
          attempt={attempt}
          maxAttempts={maxAttempts}
          label="Pinterest traffic"
          testId="pinterest-traffic-loading"
          skeleton={<div className="h-24 animate-pulse rounded-md bg-muted/50" />}
        />
      </div>,
    );
  }

  if (stats.sessions === 0) {
    return shell(
      <p
        className="text-sm text-muted-foreground"
        data-testid="pinterest-traffic-state"
        data-state="DATA_AVAILABLE_ZERO"
      >
        Canonieke data geladen — geen Pinterest-sessies in dit tijdvenster met de actieve filters.
      </p>,
      windowLabel,
    );
  }

  return shell(
    <div className="space-y-4" data-testid="pinterest-traffic-state" data-state="DATA_AVAILABLE">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-xs">Sessies</span>
          </div>
          <p className="text-2xl font-bold" data-testid="pinterest-sessions">{stats.sessions}</p>
          <p className="text-[11px] text-muted-foreground">
            {stats.visitors} bezoekers · {stats.usSessions} US
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-xs">Winkelwagen</span>
          </div>
          <p className="text-2xl font-bold">{stats.addToCart}</p>
          <p className="text-[11px] text-muted-foreground">{stats.productViews} productviews</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            <span className="text-xs">Checkout</span>
          </div>
          <p className="text-2xl font-bold">{stats.checkout}</p>
          <p className="text-[11px] text-muted-foreground">{stats.purchases} aankopen</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">Conversie</span>
          </div>
          <p className="text-2xl font-bold">{stats.conversionRate.toFixed(2)}%</p>
        </div>
      </div>

      <MiniRows title="Top campagnes" rows={stats.campaigns} />
      <MiniRows title="Top landingspagina's" rows={stats.landingPages} />
      <MiniRows title="Top landen" rows={stats.countries} />
      <MiniRows title="Top steden" rows={stats.cities} />

      <p className="text-[11px] text-muted-foreground">
        Afgeleid van dezelfde canonical payload als de wereldkaart — geen extra backend-request.
      </p>
    </div>,
    windowLabel,
  );
};
