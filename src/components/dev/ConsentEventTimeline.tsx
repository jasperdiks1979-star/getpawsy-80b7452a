/**
 * ConsentEventTimeline — chronological view of consent changes + TikTok
 * pixel events with the consent state that was active at firing time.
 *
 * Reads from the consentLog ring buffer (no extra instrumentation).
 * Highlights events that fired under non-granted state (potential
 * GDPR leak) and shows the pageload boundary so the operator can see
 * which events fired *before* the user accepted the banner.
 */
import { useEffect, useMemo, useState } from 'react';
import { getConsentLog, clearConsentLog, type ConsentLogEntry } from '@/lib/consentLog';

interface ConsentEventTimelineProps {
  onClose: () => void;
}

const STATE_COLORS = {
  granted: { bg: 'hsl(142 50% 94%)', fg: 'hsl(142 70% 28%)', border: 'hsl(142 50% 70%)' },
  held: { bg: 'hsl(40 80% 94%)', fg: 'hsl(30 70% 32%)', border: 'hsl(40 80% 70%)' },
  revoked: { bg: 'hsl(0 60% 95%)', fg: 'hsl(0 70% 38%)', border: 'hsl(0 60% 75%)' },
  unknown: { bg: 'hsl(38 30% 94%)', fg: 'hsl(25 18% 42%)', border: 'hsl(38 30% 80%)' },
} as const;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function fmtDelta(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${Math.round(ms / 60_000)}m`;
}

function explainEvent(entry: Extract<ConsentLogEntry, { kind: 'tiktok-event' }>): string {
  if (entry.consentState === 'granted') {
    return entry.fired
      ? 'Pixel SDK loaded and consent granted → event sent to TikTok in real-time.'
      : 'Consent was granted but ttq SDK was not yet on window — call queued in stub.';
  }
  if (entry.consentState === 'held') {
    return 'EU visitor before banner accept → event held in TikTok queue, will dispatch on grant.';
  }
  if (entry.consentState === 'revoked') {
    return 'User rejected or revoked consent → event will NOT reach TikTok.';
  }
  return 'Consent state not yet initialised when event fired (race condition).';
}

function explainConsent(entry: Extract<ConsentLogEntry, { kind: 'consent' }>): string {
  switch (entry.source) {
    case 'auto-grant-geo':
      return 'Non-EU timezone detected → marketing consent auto-granted on pixel init.';
    case 'banner-accept':
      return 'User clicked "Accept all" on the cookie banner.';
    case 'banner-reject':
      return 'User clicked "Necessary only" → pixel held / not initialised.';
    case 'dev-toggle':
      return 'Dev override flipped consent — only happens on dev hosts.';
    case 'revoke':
      return 'Consent explicitly revoked (settings or programmatic call).';
    default:
      return 'Consent state set from an unknown source.';
  }
}

export const ConsentEventTimeline = ({ onClose }: ConsentEventTimelineProps) => {
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<'all' | 'leaks'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, []);

  const entries = useMemo(() => getConsentLog(), [tick]);

  // Pageload anchor — first entry of the session, used to render delta
  const anchorTs = entries[0]?.ts ?? Date.now();

  // Mark the first consent-grant boundary so we can show a "before consent" chip
  const firstGrantTs = useMemo(() => {
    const grant = entries.find(
      (e) => e.kind === 'consent' && e.value === 'all',
    );
    return grant?.ts ?? null;
  }, [entries]);

  const filtered = useMemo(() => {
    let out = entries;
    if (filter === 'leaks') {
      out = out.filter(
        (e) =>
          e.kind === 'tiktok-event' &&
          (e.consentState === 'held' ||
            e.consentState === 'revoked' ||
            e.consentState === 'unknown'),
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((e) => {
        // Searchable surface: event name (tiktok-event), source (both kinds),
        // consentState (tiktok-event), and consent value/source pair.
        const haystack: string[] = [];
        if (e.kind === 'tiktok-event') {
          haystack.push(e.event, e.consentState, e.source);
        } else {
          haystack.push('consent', e.value, e.source);
        }
        return haystack.some((s) => s.toLowerCase().includes(q));
      });
    }
    return out;
  }, [entries, filter, search]);

  const leakCount = entries.filter(
    (e) =>
      e.kind === 'tiktok-event' &&
      (e.consentState === 'held' ||
        e.consentState === 'revoked' ||
        e.consentState === 'unknown'),
  ).length;

  /**
   * Pre-grant summary — every TikTok event that fired BEFORE the first
   * "Accept all". This is the most actionable signal for GDPR audits:
   * if anything appears here, it means the pixel was tracking visitors
   * who had not yet consented.
   *
   * - `firstGrantTs === null` → user never granted → all TikTok events qualify
   * - otherwise → only events with ts < firstGrantTs
   */
  const preGrantSummary = useMemo(() => {
    const tiktokEvents = entries.filter(
      (e): e is Extract<typeof entries[number], { kind: 'tiktok-event' }> =>
        e.kind === 'tiktok-event',
    );
    const preGrant =
      firstGrantTs === null
        ? tiktokEvents
        : tiktokEvents.filter((e) => e.ts < firstGrantTs);
    const byEvent = new Map<string, number>();
    for (const e of preGrant) {
      byEvent.set(e.event, (byEvent.get(e.event) || 0) + 1);
    }
    return {
      total: preGrant.length,
      neverGranted: firstGrantTs === null && tiktokEvents.length > 0,
      events: Array.from(byEvent.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([event, count]) => ({ event, count })),
    };
  }, [entries, firstGrantTs]);

  return (
    <div
      role="dialog"
      aria-label="Consent event timeline"
      style={{
        position: 'fixed',
        inset: '50% auto auto 50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2147483647,
        width: 'min(620px, 94vw)',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ padding: 16, borderBottom: '1px solid hsl(38 30% 92%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>📜 Consent Event Timeline</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close timeline"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              color: 'hsl(25 18% 42%)',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <p style={{ marginTop: 6, fontSize: 11, color: 'hsl(25 18% 42%)', lineHeight: 1.5 }}>
          Every consent change and TikTok pixel event in this session, with the
          consent state at firing time. Events before the first grant are
          flagged as potential leaks.
        </p>

        {/* Pre-grant summary banner */}
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 8,
            background:
              preGrantSummary.total === 0
                ? 'hsl(142 50% 96%)'
                : 'hsl(0 70% 96%)',
            border:
              preGrantSummary.total === 0
                ? '1px solid hsl(142 50% 80%)'
                : '1px solid hsl(0 70% 80%)',
            color:
              preGrantSummary.total === 0
                ? 'hsl(142 70% 22%)'
                : 'hsl(0 70% 30%)',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {preGrantSummary.total === 0 ? (
            <>
              ✅ <strong>0 TikTok events</strong> fired before the first{' '}
              <code>Accept all</code>. Consent gating is working correctly.
            </>
          ) : (
            <>
              ⚠️{' '}
              <strong>
                {preGrantSummary.total} TikTok event
                {preGrantSummary.total === 1 ? '' : 's'}
              </strong>{' '}
              fired{' '}
              {preGrantSummary.neverGranted
                ? 'in this session — no Accept all yet'
                : 'before the first '}
              {!preGrantSummary.neverGranted && <code>Accept all</code>}.{' '}
              <span style={{ display: 'block', marginTop: 4 }}>
                Which:&nbsp;
                {preGrantSummary.events.map((e, i) => (
                  <span key={e.event}>
                    <code
                      style={{
                        padding: '1px 5px',
                        background: '#fff',
                        border: '1px solid hsl(0 50% 85%)',
                        borderRadius: 4,
                        marginRight: 4,
                      }}
                    >
                      {e.event} × {e.count}
                    </code>
                    {i < preGrantSummary.events.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={chipStyle(filter === 'all')}
          >
            All ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('leaks')}
            style={chipStyle(filter === 'leaks', leakCount > 0 ? 'danger' : 'neutral')}
          >
            ⚠ Leaks ({leakCount})
          </button>
          <div style={{ flex: 1, position: 'relative', minWidth: 140 }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event or source… (e.g. CompletePayment, banner-accept)"
              aria-label="Search timeline events"
              style={{
                width: '100%',
                padding: '4px 24px 4px 8px',
                fontSize: 11,
                background: '#fff',
                color: 'hsl(25 30% 12%)',
                border: '1px solid hsl(38 30% 80%)',
                borderRadius: 6,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'hsl(25 18% 42%)',
                  fontSize: 12,
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => { clearConsentLog(); setTick((n) => n + 1); }}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              background: 'transparent',
              color: 'hsl(0 70% 42%)',
              border: '1px solid hsl(0 60% 80%)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Clear log
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: 12, flex: 1 }}>
        {filtered.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'hsl(25 18% 42%)',
              fontSize: 12,
            }}
          >
            {filter === 'leaks'
              ? '✅ No events fired under non-granted consent — consent flow is clean.'
              : search
              ? `No events match “${search}”. Try a different keyword or clear the search.`
              : 'No events recorded yet. Browse the site to populate the timeline.'}
          </div>
        )}

        {/*
          Section grouping — every time the consent state changes (consent
          entry or the first event under a new state) we open a new
          "section" with a sticky-style header. This makes the grant /
          revoke / re-grant cadence visible at a glance instead of forcing
          the operator to scan timestamps line by line.

          State source:
            • consent entries → `value === 'all' ? 'granted' : 'revoked'`
            • tiktok-event entries → use their recorded `consentState`
              (only as a fallback before the first explicit consent entry,
              so we don't double-flip on every event)
        */}
        {(() => {
          type ResolvedState = 'granted' | 'held' | 'revoked' | 'unknown';
          const sections: Array<{
            state: ResolvedState;
            startTs: number;
            triggerSource: string;
            entries: Array<{ entry: ConsentLogEntry; index: number }>;
          }> = [];
          let current: ResolvedState | null = null;
          let lastConsentSource = 'initial';
          filtered.forEach((entry, i) => {
            let next: ResolvedState = current ?? 'unknown';
            let triggerSource = lastConsentSource;
            if (entry.kind === 'consent') {
              next = entry.value === 'all' ? 'granted' : 'revoked';
              triggerSource = entry.source;
              lastConsentSource = entry.source;
            } else if (current === null) {
              // No explicit consent entry yet — adopt the event's recorded state
              next = entry.consentState as ResolvedState;
              triggerSource = 'pre-consent';
            }
            if (next !== current) {
              sections.push({
                state: next,
                startTs: entry.ts,
                triggerSource,
                entries: [],
              });
              current = next;
            }
            sections[sections.length - 1].entries.push({ entry, index: i });
          });

          return sections.map((sec, sIdx) => {
            const c = STATE_COLORS[sec.state];
            const stateLabel =
              sec.state === 'granted'
                ? '✓ GRANTED'
                : sec.state === 'revoked'
                ? '✕ REVOKED'
                : sec.state === 'held'
                ? '⏸ HELD'
                : '○ UNKNOWN';
            const tiktokInSection = sec.entries.filter(
              ({ entry }) => entry.kind === 'tiktok-event',
            ).length;
            return (
              <section key={`sec-${sIdx}-${sec.startTs}`} style={{ marginBottom: 8 }}>
                <header
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 10px',
                    marginTop: sIdx === 0 ? 0 : 8,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    borderRadius: 6,
                    fontSize: 11,
                    color: c.fg,
                    fontWeight: 700,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <span>{stateLabel}</span>
                  <span style={{ fontWeight: 500, opacity: 0.8 }}>
                    via <code>{sec.triggerSource}</code>
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 10,
                      opacity: 0.85,
                    }}
                  >
                    {fmtTime(sec.startTs)} · {fmtDelta(sec.startTs - anchorTs)}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: '#fff',
                      border: `1px solid ${c.border}`,
                    }}
                    title="TikTok pixel events fired in this consent window"
                  >
                    {tiktokInSection} pixel evt
                  </span>
                </header>
                <div
                  style={{
                    borderLeft: `2px solid ${c.border}`,
                    marginLeft: 8,
                    paddingLeft: 4,
                    marginTop: 4,
                  }}
                >
                  {sec.entries.map(({ entry, index }) => {
                    const delta = entry.ts - anchorTs;
                    const beforeGrant =
                      firstGrantTs !== null &&
                      entry.ts < firstGrantTs &&
                      entry.kind === 'tiktok-event';
                    return (
                      <TimelineRow
                        key={`${entry.ts}-${index}`}
                        entry={entry}
                        delta={delta}
                        beforeGrant={beforeGrant}
                      />
                    );
                  })}
                </div>
              </section>
            );
          });
        })()}
      </div>
    </div>
  );
};

const TimelineRow = ({
  entry,
  delta,
  beforeGrant,
}: {
  entry: ConsentLogEntry;
  delta: number;
  beforeGrant: boolean;
}) => {
  const isConsent = entry.kind === 'consent';
  const stateKey = isConsent
    ? entry.value === 'all'
      ? 'granted'
      : 'revoked'
    : (entry as Extract<ConsentLogEntry, { kind: 'tiktok-event' }>).consentState;
  const c = STATE_COLORS[stateKey];

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 4px',
        borderBottom: '1px solid hsl(38 30% 96%)',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 90,
          fontSize: 10,
          color: 'hsl(25 18% 42%)',
          fontFamily: 'ui-monospace, monospace',
          paddingTop: 2,
        }}
      >
        <div>{fmtTime(entry.ts)}</div>
        <div style={{ fontSize: 9, opacity: 0.7 }}>{fmtDelta(delta)}</div>
      </div>

      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          marginTop: 2,
          borderRadius: '50%',
          background: c.bg,
          border: `1.5px solid ${c.border}`,
          color: c.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {isConsent ? '⚙' : '◆'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: 12, fontWeight: 700 }}>
            {isConsent ? `consent → ${(entry as Extract<ConsentLogEntry, { kind: 'consent' }>).value}` : entry.event}
          </code>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 3,
              background: c.bg,
              color: c.fg,
              border: `1px solid ${c.border}`,
            }}
          >
            {stateKey}
          </span>
          <span style={{ fontSize: 10, color: 'hsl(25 18% 42%)' }}>
            source: <code>{entry.source}</code>
          </span>
          {!isConsent && (
            <span
              style={{
                fontSize: 10,
                color: (entry as Extract<ConsentLogEntry, { kind: 'tiktok-event' }>).fired
                  ? 'hsl(142 70% 28%)'
                  : 'hsl(25 18% 42%)',
              }}
            >
              {(entry as Extract<ConsentLogEntry, { kind: 'tiktok-event' }>).fired
                ? '· SDK present'
                : '· SDK missing'}
            </span>
          )}
          {beforeGrant && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 3,
                background: 'hsl(0 60% 95%)',
                color: 'hsl(0 70% 38%)',
                border: '1px solid hsl(0 60% 75%)',
              }}
            >
              ⚠ before consent
            </span>
          )}
        </div>
        <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.4, color: 'hsl(25 18% 30%)' }}>
          {isConsent
            ? explainConsent(entry as Extract<ConsentLogEntry, { kind: 'consent' }>)
            : explainEvent(entry as Extract<ConsentLogEntry, { kind: 'tiktok-event' }>)}
        </div>
        {!isConsent && (entry as Extract<ConsentLogEntry, { kind: 'tiktok-event' }>).meta && (
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 10, color: 'hsl(25 18% 42%)', cursor: 'pointer' }}>
              meta
            </summary>
            <pre
              style={{
                marginTop: 4,
                padding: 6,
                background: 'hsl(38 30% 96%)',
                borderRadius: 4,
                fontSize: 10,
                lineHeight: 1.4,
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(
                (entry as Extract<ConsentLogEntry, { kind: 'tiktok-event' }>).meta,
                null,
                2,
              )}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};

function chipStyle(active: boolean, tone: 'neutral' | 'danger' = 'neutral'): React.CSSProperties {
  const activeBg = tone === 'danger' ? 'hsl(0 70% 42%)' : 'hsl(22 70% 48%)';
  return {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    background: active ? activeBg : 'transparent',
    color: active ? '#fff' : 'hsl(25 30% 12%)',
    border: `1px solid ${active ? activeBg : 'hsl(38 30% 88%)'}`,
    borderRadius: 6,
    cursor: 'pointer',
  };
}

export default ConsentEventTimeline;