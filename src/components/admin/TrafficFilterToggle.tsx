import { useEffect, useState } from "react";

export type TrafficFilter = "human" | "all" | "bot" | "prefetch" | "crawler";
const KEY = "gp_traffic_filter_v1";

export function getTrafficFilter(): TrafficFilter {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "human" || v === "all" || v === "bot" || v === "prefetch" || v === "crawler") return v;
  } catch {}
  return "human";
}

export function setTrafficFilter(v: TrafficFilter) {
  try { localStorage.setItem(KEY, v); window.dispatchEvent(new CustomEvent("gp:traffic-filter", { detail: v })); } catch {}
}

export function useTrafficFilter(): [TrafficFilter, (v: TrafficFilter) => void] {
  const [v, setV] = useState<TrafficFilter>(() => getTrafficFilter());
  useEffect(() => {
    const h = (e: Event) => setV((e as CustomEvent).detail as TrafficFilter);
    window.addEventListener("gp:traffic-filter", h);
    return () => window.removeEventListener("gp:traffic-filter", h);
  }, []);
  return [v, (n) => { setTrafficFilter(n); setV(n); }];
}

export default function TrafficFilterToggle() {
  const [v, setV] = useTrafficFilter();
  const opts: TrafficFilter[] = ["human", "all", "bot", "prefetch", "crawler"];
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => setV(o)}
          className={`px-2.5 py-1 rounded-sm capitalize ${
            v === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}