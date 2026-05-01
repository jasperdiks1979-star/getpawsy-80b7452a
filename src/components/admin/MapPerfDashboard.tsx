import { useEffect, useState } from "react";
import {
  subscribeMapPerf,
  type MapPerfMark,
  PHASE_LABELS,
  type MapPerfPhase,
  resetMapPerf,
  mapPerfMark,
} from "@/lib/map-perf-tracker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, X, RotateCw, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ORDER: MapPerfPhase[] = [
  "start",
  "chunk-loaded",
  "container-ready",
  "token-fetch-start",
  "token-fetch-end",
  "map-ctor",
  "style-load",
  "first-data-start",
  "first-data-end",
  "first-paint",
];

// Heuristic thresholds (ms) for color coding
function severity(deltaMs: number): "ok" | "warn" | "bad" {
  if (deltaMs < 250) return "ok";
  if (deltaMs < 1000) return "warn";
  return "bad";
}

const COLORS: Record<"ok" | "warn" | "bad", string> = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bad: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export const MapPerfDashboard = () => {
  const [marks, setMarks] = useState<MapPerfMark[]>([]);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("perf")) return true;
    return localStorage.getItem("map-perf-dashboard") === "1";
  });

  useEffect(() => {
    return subscribeMapPerf(setMarks);
  }, []);

  useEffect(() => {
    localStorage.setItem("map-perf-dashboard", open ? "1" : "0");
  }, [open]);

  // Build timeline rows
  const byPhase = new Map(marks.map((m) => [m.phase, m]));
  const rows = ORDER.map((phase, i) => {
    const m = byPhase.get(phase);
    const prev = i > 0 ? byPhase.get(ORDER[i - 1]) : undefined;
    const delta = m && prev ? m.t - prev.t : null;
    return { phase, mark: m, delta };
  });

  const total =
    byPhase.get("first-paint")?.t ??
    byPhase.get("first-data-end")?.t ??
    byPhase.get("style-load")?.t ??
    null;

  const copyJson = () => {
    const payload = {
      ua: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString(),
      total_ms: total,
      marks: marks.map((m) => ({ phase: m.phase, t_ms: m.t })),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast({ title: "Perf data gekopieerd", description: "Plak in een bug report." });
  };

  const restart = () => {
    resetMapPerf();
    mapPerfMark("start");
    mapPerfMark("chunk-loaded");
    toast({ title: "Perf timer gereset", description: "Refresh de pagina voor een schone meting." });
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="absolute top-2 left-2 z-30 h-8 gap-1.5 bg-background/90 backdrop-blur"
        title="Toon performance dashboard"
      >
        <Activity className="h-3.5 w-3.5" />
        <span className="text-xs">Perf {total ? `${total}ms` : "…"}</span>
      </Button>
    );
  }

  return (
    <div className="absolute top-2 left-2 z-30 w-[320px] max-w-[calc(100vw-1rem)] rounded-lg border bg-background/95 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Map Performance</span>
          {total !== null && (
            <Badge variant="secondary" className="text-xs">
              {total}ms total
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyJson} title="Copy JSON">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={restart} title="Reset timer">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} title="Sluit">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
        {rows.map(({ phase, mark, delta }) => {
          const sev = delta !== null ? severity(delta) : "ok";
          return (
            <div
              key={phase}
              className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${
                mark ? "bg-muted/40" : "opacity-40"
              }`}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{PHASE_LABELS[phase]}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{phase}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono">
                {delta !== null && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${COLORS[sev]}`}>
                    +{delta}ms
                  </span>
                )}
                <span className="text-muted-foreground">{mark ? `${mark.t}ms` : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        Tip: voeg <code className="font-mono bg-muted px-1 rounded">?perf=1</code> toe aan elke URL om dit standaard te tonen.
      </div>
    </div>
  );
};