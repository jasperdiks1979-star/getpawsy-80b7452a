import { Radio } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CANONICAL_SOURCES, SOURCE_META, type CanonicalSource } from "@/lib/canonicalSource";
import { ANALYTICS_WINDOWS } from "@/lib/analyticsWindows";

export type ProTimeRange = "live" | "1h" | "24h" | "7d" | "14d" | "30d" | "90d";
export type ProSourceFilter = "all" | CanonicalSource;
export type ProActivityFilter = "all" | "browsing" | "cart" | "checkout";

export interface ProToolbarState {
  timeRange: ProTimeRange;
  source: ProSourceFilter;
  activity: ProActivityFilter;
  usOnly: boolean;
  excludeInternal: boolean;
}

// Every non-live option maps 1:1 onto a precomputed/warmed canonical window
// (see `src/lib/analyticsWindows.ts`). No ad-hoc hour values here — an
// un-warmed window would force a slow synchronous full-window scan.
const WINDOW_LABELS: Record<string, string> = {
  "1h": "Last 1 h",
  "24h": "Last 24 h",
  "7d": "Last 7 d",
  "14d": "Last 14 d",
  "30d": "Last 30 d",
  "90d": "Last 90 d",
};

export const PRO_TIME_RANGES: { value: ProTimeRange; label: string; hours: number }[] = [
  // live mode; hours only used for the canonical KPI query fallback
  { value: "live", label: "Live now", hours: 1 },
  ...ANALYTICS_WINDOWS.map((w) => ({
    value: w.id as ProTimeRange,
    label: WINDOW_LABELS[w.id] ?? w.id,
    hours: w.hours,
  })),
];

export function proHoursForRange(range: ProTimeRange): number {
  return PRO_TIME_RANGES.find((o) => o.value === range)?.hours ?? 24;
}

export const PRO_ACTIVITY_OPTIONS: { value: ProActivityFilter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "browsing", label: "Browsing" },
  { value: "cart", label: "Add to cart" },
  { value: "checkout", label: "Checkout" },
];

export interface ProToolbarProps {
  state: ProToolbarState;
  onChange: (next: ProToolbarState) => void;
}

export function ProToolbar({ state, onChange }: ProToolbarProps) {
  const patch = (partial: Partial<ProToolbarState>) => onChange({ ...state, ...partial });
  const isLive = state.timeRange === "live";
  return (
    <div
      role="toolbar"
      aria-label="Visitor World Map Pro toolbar"
      data-testid="vwm-pro-toolbar"
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="vwm-pro-period" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Period
        </Label>
        <Select
          value={state.timeRange}
          onValueChange={(v) => patch({ timeRange: v as ProTimeRange })}
        >
          <SelectTrigger id="vwm-pro-period" className="h-9 w-[160px]" data-testid="vwm-pro-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRO_TIME_RANGES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.value === "live" ? (
                  <span className="inline-flex items-center gap-2">
                    <Radio className="h-3 w-3 text-red-500" /> {o.label}
                  </span>
                ) : (
                  o.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="vwm-pro-source" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Source
        </Label>
        <Select
          value={state.source}
          onValueChange={(v) => patch({ source: v as ProSourceFilter })}
        >
          <SelectTrigger id="vwm-pro-source" className="h-9 w-[160px]" data-testid="vwm-pro-source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {CANONICAL_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {SOURCE_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="vwm-pro-activity" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Activity
        </Label>
        <Select
          value={state.activity}
          onValueChange={(v) => patch({ activity: v as ProActivityFilter })}
        >
          <SelectTrigger id="vwm-pro-activity" className="h-9 w-[160px]" data-testid="vwm-pro-activity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRO_ACTIVITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 self-center pt-4">
        <Switch
          id="vwm-pro-us"
          checked={state.usOnly}
          onCheckedChange={(v) => patch({ usOnly: !!v })}
          data-testid="vwm-pro-us-only"
        />
        <Label htmlFor="vwm-pro-us" className="text-xs">US only</Label>
      </div>

      <div className="flex items-center gap-2 self-center pt-4">
        <Switch
          id="vwm-pro-internal"
          checked={state.excludeInternal}
          onCheckedChange={(v) => patch({ excludeInternal: !!v })}
          data-testid="vwm-pro-exclude-internal"
        />
        <Label htmlFor="vwm-pro-internal" className="text-xs">
          Exclude internal / test
        </Label>
      </div>

      {isLive && (
        <div
          role="status"
          data-testid="vwm-pro-live-banner"
          className="ml-auto self-center rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400"
        >
          Live presence · realtime only · not canonical KPI
        </div>
      )}
    </div>
  );
}
