/**
 * Session measurement evidence — reporting-only surface.
 *
 * Renders the authoritative repaired measurement fields exactly as the
 * analytics truth envelope (`analytics-canonical` → `canonical_sessions`)
 * produces them. No recomputation, no synthesis, no rounding of values that
 * the pipeline already decided. Missing values render as "—" (NULL stays
 * NULL). Effective duration is a lower-bound, evidence-based value — it is
 * deliberately NOT labelled "true duration".
 */
import { useMemo, useState } from "react";
import { useAnalyticsTruth, type TruthSession } from "@/hooks/useAnalyticsTruth";

interface Props {
  hours?: 1 | 5 | 10 | 24;
  geo?: "US" | "all";
  /** Optional narrowing, e.g. the Pinterest paid test cohort. */
  utmCampaign?: string;
  limit?: number;
}

const dash = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

function DurationCell({ s }: { s: TruthSession }) {
  const eff = s.effective_duration_seconds;
  const raw = s.reported_duration_seconds;
  return (
    <div className="leading-tight">
      <div className="font-semibold tabular-nums">
        {eff === null || eff === undefined ? "—" : `${eff}s effective`}
      </div>
      <div className="text-[10px] text-muted-foreground">
        raw: {raw === null || raw === undefined ? "—" : `${raw}s`}
        {s.duration_evidence_source ? ` · ${s.duration_evidence_source}` : ""}
      </div>
    </div>
  );
}

export function SessionEvidencePanel({
  hours = 24,
  geo = "all",
  utmCampaign,
  limit = 50,
}: Props) {
  const truth = useAnalyticsTruth({ hours, geo });
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const all = truth.data?.sessions ?? [];
    const filtered = utmCampaign
      ? all.filter((s) => s.utm_campaign === utmCampaign)
      : all;
    return [...filtered].sort(
      (a, b) =>
        (b.effective_duration_seconds ?? 0) - (a.effective_duration_seconds ?? 0),
    );
  }, [truth.data, utmCampaign]);

  const visible = showAll ? rows : rows.slice(0, limit);

  return (
    <section
      aria-label="Session measurement evidence"
      data-testid="session-evidence-panel"
      className="rounded-lg border bg-card p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide">
          Session measurement evidence · last {hours}h
          {utmCampaign ? ` · ${utmCampaign}` : ""}
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {rows.length} sessions · values as produced by the analytics pipeline
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[11px]">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Session</th>
              <th className="py-1 pr-2 font-medium">Duration</th>
              <th className="py-1 pr-2 font-medium">Interactions</th>
              <th className="py-1 pr-2 font-medium">Engagement (ms)</th>
              <th className="py-1 pr-2 font-medium">Class v3</th>
              <th className="py-1 pr-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-muted-foreground">
                  {truth.isLoading ? "Loading…" : "No sessions in this window."}
                </td>
              </tr>
            )}
            {visible.map((s) => (
              <tr key={s.session_id} className="border-b last:border-0 align-top">
                <td className="py-1.5 pr-2 font-mono text-[10px]">
                  {s.session_id.slice(0, 12)}…
                </td>
                <td className="py-1.5 pr-2">
                  <DurationCell s={s} />
                </td>
                <td className="py-1.5 pr-2 tabular-nums">{dash(s.interaction_count)}</td>
                <td className="py-1.5 pr-2 tabular-nums">{dash(s.engagement_ms)}</td>
                <td className="py-1.5 pr-2">{dash(s.traffic_quality_class_v3)}</td>
                <td className="py-1.5 pr-2 text-muted-foreground">
                  {dash(s.classification_reason)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-[11px] underline text-muted-foreground"
        >
          {showAll ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

export default SessionEvidencePanel;
