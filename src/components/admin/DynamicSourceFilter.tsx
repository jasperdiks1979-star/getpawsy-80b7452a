import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CANONICAL_SOURCES,
  SOURCE_META,
  getSourceMeta,
  resolveCanonicalSource,
  type CanonicalSource,
  type SourceInput,
} from "@/lib/canonicalSource";

export type DynamicSourceValue = "all" | CanonicalSource;

export interface DynamicSourceOption {
  value: DynamicSourceValue;
  label: string;
  color?: string;
  count: number;
  active: boolean;
}

/** Pure helper — count canonical sources in a row set. Exported for tests. */
export function computeSourceCounts(rows: SourceInput[]): Record<CanonicalSource, number> {
  const counts = Object.fromEntries(
    CANONICAL_SOURCES.map((s) => [s, 0]),
  ) as Record<CanonicalSource, number>;
  for (const r of rows) {
    const c = resolveCanonicalSource(r);
    counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

/** Build the option list: "All Sources" first, rest alphabetical. */
export function buildSourceOptions(
  counts: Record<CanonicalSource, number>,
  opts: { showInactive: boolean },
): DynamicSourceOption[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sources: DynamicSourceOption[] = CANONICAL_SOURCES
    .map((s) => {
      const meta = getSourceMeta(s);
      const count = counts[s] ?? 0;
      return { value: s as DynamicSourceValue, label: meta.label, color: meta.color, count, active: count > 0 };
    })
    .filter((o) => opts.showInactive || o.active)
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    { value: "all", label: "All Sources", count: total, active: true },
    ...sources,
  ];
}

interface Props {
  value: DynamicSourceValue;
  onChange: (v: DynamicSourceValue) => void;
  rows: SourceInput[];
  showInactive: boolean;
  onShowInactiveChange: (v: boolean) => void;
  className?: string;
}

export function DynamicSourceFilter({
  value,
  onChange,
  rows,
  showInactive,
  onShowInactiveChange,
  className,
}: Props) {
  const counts = useMemo(() => computeSourceCounts(rows), [rows]);
  const options = useMemo(() => buildSourceOptions(counts, { showInactive }), [counts, showInactive]);
  const activeMeta = value !== "all" ? SOURCE_META[value] : null;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Select value={value} onValueChange={(v) => onChange(v as DynamicSourceValue)}>
        <SelectTrigger
          className={`w-[180px] h-9 ${activeMeta ? "border-2" : ""}`}
          style={activeMeta ? { borderColor: activeMeta.color } : undefined}
          data-testid="dynamic-source-filter"
        >
          <Target className="w-4 h-4 mr-2" />
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} data-testid={`source-option-${o.value}`}>
              <div className="flex items-center gap-2">
                {o.color && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />
                )}
                <span>{o.label}</span>
                <span className="text-xs text-muted-foreground ml-1">({o.count})</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch
          id="show-inactive-sources"
          checked={showInactive}
          onCheckedChange={onShowInactiveChange}
          data-testid="show-inactive-sources"
        />
        <Label htmlFor="show-inactive-sources" className="cursor-pointer">
          Show inactive
        </Label>
      </div>
    </div>
  );
}

export default DynamicSourceFilter;