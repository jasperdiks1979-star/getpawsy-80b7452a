/**
 * TikTokEventTimeline — visual timeline of TikTok pixel events.
 *
 * For each canonical event (Pageview / ViewContent / AddToCart /
 * InitiateCheckout / CompletePayment) draws one row across the last
 * N minutes of the session. Each attempt is rendered as a dot:
 *   • green dot  → consent was 'granted' AND ttq SDK was loaded
 *                  → event was actually delivered to TikTok
 *   • red dot    → attempted while held/revoked → blocked, NOT delivered
 *   • amber dot  → attempted but ttq wasn't ready → also NOT delivered
 *
 * Pure presentation, reads only from the existing consent log.
 */
import { getConsentLog, type ConsentLogEntry } from '@/lib/consentLog';

type TikTokEntry = Extract<ConsentLogEntry, { kind: 'tiktok-event' }>;

const EVENTS: Array<{ label: string; internal: string }> = [
  { label: 'Pageview',         internal: 'page' },
  { label: 'ViewContent',      internal: 'ViewContent' },
  { label: 'AddToCart',        internal: 'AddToCart' },
  { label: 'InitiateCheckout', internal: 'InitiateCheckout' },
  { label: 'CompletePayment',  internal: 'CompletePayment' },
];

type DotKind = 'delivered' | 'blocked' | 'not-ready';

const DOT_STYLE: Record<DotKind, { bg: string; ring: string; label: string }> = {
  delivered: { bg: 'hsl(142 70% 38%)', ring: 'hsl(142 70% 28%)', label: 'delivered' },
  blocked:   { bg: 'hsl(0 70% 50%)',   ring: 'hsl(0 70% 38%)',   label: 'blocked (consent held/revoked)' },
  'not-ready': { bg: 'hsl(38 90% 52%)', ring: 'hsl(28 80% 38%)', label: 'attempted but SDK not ready' },
};

function classify(e: TikTokEntry): DotKind {
  if (e.consentState === 'held' || e.consentState === 'revoked') return 'blocked';
  if (!e.fired) return 'not-ready';
  if (e.consentState === 'granted') return 'delivered';
  return 'not-ready';
}

function fmtAxis(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

export const TikTokEventTimeline = () => {
  const log = getConsentLog();
  const events = log.filter((e): e is TikTokEntry => e.kind === 'tiktok-event');

  const now = Date.now();
  // Window: from earliest event (capped at 30 min back) → now.
  // Always reserve at least 30s so single-attempt sessions render visibly.
  const earliest = events.length ? events[0].ts : now - 30_000;
  const minStart = now - 30 * 60_000;
  const start = Math.max(earliest, minStart);
  const span = Math.max(now - start, 30_000);

  const xPct = (ts: number) => {
    const clamped = Math.max(start, Math.min(ts, now));
    return ((clamped - start) / span) * 100;
  };

  // Counts for legend
  let delivered = 0, blocked = 0, notReady = 0;
  for (const e of events) {
    const k = classify(e);
    if (k === 'delivered') delivered++;
    else if (k === 'blocked') blocked++;
    else notReady++;
  }

  // X-axis ticks: 4 evenly spaced labels (oldest → newest)
  const ticks = [0, 0.33, 0.66, 1].map((p) => ({
    leftPct: p * 100,
    label: p === 1 ? 'now' : fmtAxis(start + p * span, now) + ' ago',
  }));

  return (
    <div
      style={{
        marginTop: 8,
        padding: 8,
        background: 'hsl(220 15% 97%)',
        borderRadius: 6,
        fontSize: 10,
        fontFamily: 'ui-monospace, monospace',
        color: 'hsl(220 15% 18%)',
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 10 }}>Event timeline</strong>
        <span style={{ fontSize: 9, opacity: 0.75 }}>
          ✓ {delivered} delivered · ✕ {blocked} blocked · ! {notReady} not ready
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {EVENTS.map((spec) => {
          const matches = events.filter((e) => e.event === spec.internal);
          return (
            <div
              key={spec.internal}
              style={{ display: 'grid', gridTemplateColumns: '88px 1fr', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 9, fontWeight: 600, color: 'hsl(220 15% 30%)' }}>
                {spec.label}
              </span>
              <div
                style={{
                  position: 'relative',
                  height: 14,
                  background: 'hsl(220 15% 92%)',
                  borderRadius: 3,
                  border: '1px solid hsl(220 15% 86%)',
                }}
              >
                {matches.length === 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 8,
                      color: 'hsl(220 10% 55%)',
                      fontStyle: 'italic',
                    }}
                  >
                    no attempts
                  </span>
                )}
                {matches.map((m, i) => {
                  const kind = classify(m);
                  const c = DOT_STYLE[kind];
                  return (
                    <span
                      key={`${m.ts}-${i}`}
                      title={`${spec.label} · ${c.label} · ${fmtAxis(m.ts, now)} ago`}
                      style={{
                        position: 'absolute',
                        left: `${xPct(m.ts)}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: c.bg,
                        boxShadow: `0 0 0 1px ${c.ring}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis */}
      <div
        style={{
          position: 'relative',
          marginTop: 4,
          marginLeft: 94, // align with bar start (88px label + 6px gap)
          height: 12,
          fontSize: 8,
          color: 'hsl(220 10% 45%)',
        }}
      >
        {ticks.map((t, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${t.leftPct}%`,
              transform: t.leftPct === 0 ? 'translateX(0)' : t.leftPct === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 9 }}>
        {(['delivered', 'blocked', 'not-ready'] as DotKind[]).map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: DOT_STYLE[k].bg,
                boxShadow: `0 0 0 1px ${DOT_STYLE[k].ring}`,
              }}
            />
            {DOT_STYLE[k].label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default TikTokEventTimeline;