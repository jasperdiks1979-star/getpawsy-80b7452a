import type { LiveConnectionDiagnostics } from "@/lib/liveVisitorTimeline";

export interface LiveDiagnosticsPanelProps {
  diagnostics: LiveConnectionDiagnostics;
  activeSessions: number;
  sessionsWithGeo: number;
  liveMarkers: number;
  liveCanonicalOverlap: number;
}

function dot(color: string) {
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />;
}

export function LiveDiagnosticsPanel({
  diagnostics,
  activeSessions,
  sessionsWithGeo,
  liveMarkers,
  liveCanonicalOverlap,
}: LiveDiagnosticsPanelProps) {
  const transportColor =
    diagnostics.transport === "websocket"
      ? "bg-emerald-500"
      : diagnostics.transport === "polling"
      ? "bg-amber-500"
      : "bg-zinc-400";
  const ageSec = diagnostics.lastHeartbeatAgeMs != null ? Math.round(diagnostics.lastHeartbeatAgeMs / 1000) : null;
  return (
    <div
      data-testid="live-diagnostics-panel"
      className="rounded-lg border bg-card p-3 text-xs"
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
        {dot(transportColor)}
        Live diagnostics
        <span className="text-muted-foreground">· {diagnostics.transport}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        <dt>Active sessions</dt><dd className="text-foreground">{activeSessions}</dd>
        <dt>Sessions with geo</dt><dd className="text-foreground">{sessionsWithGeo}</dd>
        <dt>Live markers</dt><dd className="text-foreground">{liveMarkers}</dd>
        <dt>Live↔canonical overlap</dt><dd className="text-foreground">{liveCanonicalOverlap}</dd>
        <dt>Websocket status</dt><dd className="text-foreground">{diagnostics.websocketStatus}</dd>
        <dt>Last heartbeat</dt>
        <dd className="text-foreground">
          {ageSec == null ? "—" : `${ageSec}s ago`}
        </dd>
        <dt>Dropped heartbeats</dt><dd className="text-foreground">{diagnostics.droppedHeartbeats}</dd>
        <dt>Reconnect attempts</dt><dd className="text-foreground">{diagnostics.reconnectAttempts}</dd>
        <dt>Latency</dt>
        <dd className="text-foreground">{diagnostics.latencyMs == null ? "—" : `${diagnostics.latencyMs}ms`}</dd>
        <dt>Geo lookup failures</dt><dd className="text-foreground">{diagnostics.geoLookupFailures}</dd>
      </dl>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Presence only. Canonical KPIs remain unaffected.
      </p>
    </div>
  );
}