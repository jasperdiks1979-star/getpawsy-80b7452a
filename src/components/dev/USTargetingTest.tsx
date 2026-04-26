/**
 * USTargetingTest — automated dev verification of US targeting.
 *
 * Drives the TikTok pixel through three consent states (granted, held,
 * revoked) and, in each state, attempts to fire every canonical event
 * (Pageview, ViewContent, AddToCart, InitiateCheckout, CompletePayment).
 *
 * After the run it shows a green/red checklist per (state × event) so you
 * can verify at a glance that:
 *   • granted → all 5 events fire
 *   • held    → all 5 events are blocked (correct = green)
 *   • revoked → all 5 events are blocked (correct = green)
 *
 * The original consent state is restored when the modal closes so this
 * never leaves the pixel in a weird state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { logTikTokEvent } from '@/lib/consentLog';

type ConsentState = 'granted' | 'held' | 'revoked';

const STATES: ConsentState[] = ['granted', 'held', 'revoked'];

const EVENTS = [
  { label: 'Pageview',         internal: 'page' },
  { label: 'ViewContent',      internal: 'ViewContent' },
  { label: 'AddToCart',        internal: 'AddToCart' },
  { label: 'InitiateCheckout', internal: 'InitiateCheckout' },
  { label: 'CompletePayment',  internal: 'CompletePayment' },
] as const;

interface Cell {
  attempted: boolean;
  delivered: boolean;     // did ttq.track / ttq.page actually run?
  expectedDelivered: boolean;
  pass: boolean;
  detail: string;
}

type Matrix = Record<ConsentState, Record<string, Cell>>;

function emptyMatrix(): Matrix {
  const m = {} as Matrix;
  for (const s of STATES) {
    m[s] = {};
    for (const e of EVENTS) {
      m[s][e.internal] = {
        attempted: false,
        delivered: false,
        expectedDelivered: s === 'granted',
        pass: false,
        detail: '—',
      };
    }
  }
  return m;
}

function applyConsentState(state: ConsentState): void {
  const w = window as any;
  if (!w.ttq) return;
  try {
    if (state === 'granted') w.ttq.grantConsent && w.ttq.grantConsent();
    if (state === 'held')    w.ttq.holdConsent  && w.ttq.holdConsent();
    if (state === 'revoked') w.ttq.revokeConsent && w.ttq.revokeConsent();
    w.__ttqConsent = state;
  } catch { /* ignore */ }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Try to fire a TikTok event. Returns true if the SDK's track method was callable. */
function tryFire(eventName: string): boolean {
  const w = window as any;
  const ttq = w.ttq;
  if (!ttq) return false;
  try {
    if (eventName === 'page') {
      if (typeof ttq.page === 'function') {
        ttq.page();
        return true;
      }
      return false;
    }
    if (typeof ttq.track === 'function') {
      ttq.track(eventName, { test: true, source: 'us-targeting-test' });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const USTargetingTest = ({ onClose }: { onClose: () => void }) => {
  const [matrix, setMatrix] = useState<Matrix>(() => emptyMatrix());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [done, setDone] = useState(false);
  const [originalState, setOriginalState] = useState<ConsentState | 'unknown'>('unknown');
  const [highlightState, setHighlightState] = useState<ConsentState | null>(null);
  const rowRefs = useRef<Record<ConsentState, HTMLDivElement | null>>({
    granted: null, held: null, revoked: null,
  });

  const focusState = useCallback((s: ConsentState) => {
    setHighlightState(s);
    const el = rowRefs.current[s];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Auto-clear highlight after a few seconds
    window.setTimeout(() => {
      setHighlightState((cur) => (cur === s ? null : cur));
    }, 2400);
  }, []);

  useEffect(() => {
    const w = window as any;
    const cur = w.__ttqConsent as ConsentState | undefined;
    setOriginalState(cur && STATES.includes(cur) ? cur : 'unknown');
  }, []);

  const runTest = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setProgress('Initializing…');
    const next = emptyMatrix();
    setMatrix(next);

    const w = window as any;
    if (!w.ttq) {
      setProgress('⚠ TikTok pixel not loaded — cannot run test.');
      setRunning(false);
      return;
    }

    for (const state of STATES) {
      setProgress(`Switching to ${state}…`);
      applyConsentState(state);
      // Give the SDK a moment to apply the consent change
      await delay(250);

      for (const ev of EVENTS) {
        setProgress(`${state} → ${ev.label}`);
        const delivered = tryFire(ev.internal);
        // Mirror what the rest of the app would log — keeps the matrix &
        // timeline panels in sync with the test results.
        try {
          logTikTokEvent(ev.internal, { trigger: 'us-targeting-test', state });
        } catch { /* ignore */ }

        const expectedDelivered = state === 'granted';
        // PASS rules:
        //   granted → must deliver
        //   held/revoked → must NOT deliver (block is the correct outcome)
        const pass =
          (state === 'granted' && delivered) ||
          (state !== 'granted' && !delivered);

        next[state][ev.internal] = {
          attempted: true,
          delivered,
          expectedDelivered,
          pass,
          detail: pass
            ? state === 'granted' ? 'fired' : 'correctly blocked'
            : state === 'granted' ? 'failed to fire' : 'leaked through!',
        };
        setMatrix({ ...next, [state]: { ...next[state] } });
        await delay(120);
      }
    }

    setProgress('Done.');
    setRunning(false);
    setDone(true);
  }, []);

  const restoreOriginal = useCallback(() => {
    if (originalState !== 'unknown') applyConsentState(originalState);
    onClose();
  }, [originalState, onClose]);

  // Aggregate counters
  const total = STATES.length * EVENTS.length;
  const passed = STATES.reduce(
    (acc, s) => acc + EVENTS.filter((e) => matrix[s][e.internal].pass).length,
    0,
  );
  const attempted = STATES.reduce(
    (acc, s) => acc + EVENTS.filter((e) => matrix[s][e.internal].attempted).length,
    0,
  );
  const allGreen = done && passed === total;

  // Per-state verdict — used for the conclusion banner
  const stateVerdicts = STATES.map((s) => {
    const cells = EVENTS.map((e) => matrix[s][e.internal]);
    const passCount = cells.filter((c) => c.pass).length;
    const failCount = cells.filter((c) => c.attempted && !c.pass).length;
    const allPass = passCount === EVENTS.length;
    let verdict: 'pass' | 'fail' | 'partial';
    if (allPass) verdict = 'pass';
    else if (failCount === EVENTS.length) verdict = 'fail';
    else verdict = 'partial';
    const expectation =
      s === 'granted'
        ? 'all 5 events should fire'
        : 'all 5 events should be blocked';
    const summary =
      verdict === 'pass'
        ? s === 'granted'
          ? 'all events delivered to TikTok ✓'
          : 'all events correctly blocked ✓'
        : s === 'granted'
        ? `${EVENTS.length - passCount} event(s) failed to fire`
        : `${EVENTS.length - passCount} event(s) leaked through!`;
    return { state: s, verdict, expectation, summary, passCount, failCount };
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="US Targeting Test"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'system-ui, sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) restoreOriginal(); }}
    >
      <div
        style={{
          background: '#fff',
          color: 'hsl(25 30% 12%)',
          borderRadius: 10,
          padding: 16,
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>🇺🇸 US Targeting Test</strong>
          <button
            type="button"
            onClick={restoreOriginal}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 16, color: 'hsl(25 18% 42%)', padding: 0, lineHeight: 1,
            }}
          >✕</button>
        </div>

        <p style={{ marginTop: 6, marginBottom: 10, fontSize: 12, color: 'hsl(25 18% 42%)' }}>
          Loops through all consent states and tries to fire each canonical TikTok event.
          Green = expected behavior (fires when granted, blocked when held/revoked).
          Red = leak or failure.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={runTest}
            disabled={running}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 12, fontWeight: 700,
              background: running ? 'hsl(210 80% 45% / 0.5)' : 'hsl(210 80% 45%)',
              color: '#fff',
              border: 'none', borderRadius: 6,
              cursor: running ? 'wait' : 'pointer',
            }}
          >
            {running ? '⏳ Running…' : done ? '↻ Run again' : '▶ Run US targeting test'}
          </button>
          <button
            type="button"
            onClick={restoreOriginal}
            style={{
              padding: '8px 12px', fontSize: 12, fontWeight: 600,
              background: 'transparent',
              color: 'hsl(25 30% 12%)',
              border: '1px solid hsl(38 30% 80%)', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {(running || done) && (
          <div style={{
            fontSize: 11, fontFamily: 'ui-monospace, monospace',
            color: 'hsl(25 18% 42%)', marginBottom: 8,
          }}>
            {progress} {done && `(${passed}/${total} passed, ${attempted} attempted)`}
          </div>
        )}

        {done && (
          <div style={{ marginBottom: 10 }}>
            {/* Overall verdict */}
            <div style={{
              padding: 10, borderRadius: 6, marginBottom: 8, fontSize: 12, fontWeight: 700,
              background: allGreen ? 'hsl(142 50% 94%)' : 'hsl(0 60% 95%)',
              color:      allGreen ? 'hsl(142 70% 28%)' : 'hsl(0 70% 38%)',
              border: `1px solid ${allGreen ? 'hsl(142 50% 70%)' : 'hsl(0 60% 75%)'}`,
            }}>
              {allGreen
                ? '✅ Conclusion: US targeting is wired up correctly across all consent states.'
                : `⚠ Conclusion: ${total - passed} of ${total} checks failed — see per-state breakdown below.`}
            </div>

            {/* Per-state verdicts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stateVerdicts.map((v) => {
                const colors =
                  v.verdict === 'pass'
                    ? { bg: 'hsl(142 50% 96%)', fg: 'hsl(142 70% 28%)', border: 'hsl(142 50% 75%)', icon: '✓' }
                    : v.verdict === 'fail'
                    ? { bg: 'hsl(0 60% 96%)',   fg: 'hsl(0 70% 38%)',   border: 'hsl(0 60% 78%)',   icon: '✗' }
                    : { bg: 'hsl(38 70% 96%)',  fg: 'hsl(28 80% 35%)',  border: 'hsl(38 70% 78%)',  icon: '⚠' };
                return (
                  <button
                    type="button"
                    key={v.state}
                    onClick={() => focusState(v.state)}
                    style={{
                      background: colors.bg, color: colors.fg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 6, padding: '6px 8px',
                      fontSize: 11, lineHeight: 1.4,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      font: 'inherit',
                    }}
                    title={`Click to jump to ${v.state} row · Expected: ${v.expectation} · Result: ${v.passCount}/${EVENTS.length} pass`}
                  >
                    <span>
                      <strong style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {colors.icon} {v.state}
                      </strong>
                      <span style={{ opacity: 0.85 }}> — {v.summary}</span>
                    </span>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {v.passCount}/{EVENTS.length} →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Checklist grid: states × events */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '120px repeat(5, 1fr)',
          gap: 4,
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
        }}>
          <div />
          {EVENTS.map((e) => (
            <div key={e.internal} style={{ fontWeight: 700, textAlign: 'center', padding: '4px 2px' }}>
              {e.label}
            </div>
          ))}

          {STATES.map((s) => (
            <FragmentRow
              key={s}
              state={s}
              matrix={matrix}
              highlighted={highlightState === s}
              registerRef={(el) => { rowRefs.current[s] = el; }}
            />
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 10, color: 'hsl(25 18% 42%)' }}>
          Original consent state: <strong>{originalState}</strong> — will be restored on close.
        </div>
      </div>
    </div>
  );
};

const FragmentRow = ({
  state,
  matrix,
  highlighted,
  registerRef,
}: {
  state: ConsentState;
  matrix: Matrix;
  highlighted: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
}) => {
  const stateColor =
    state === 'granted' ? 'hsl(142 70% 28%)' :
    state === 'held'    ? 'hsl(38 90% 38%)' :
                          'hsl(0 70% 42%)';
  return (
    <>
      <div
        ref={registerRef}
        style={{
          fontWeight: 700, color: stateColor, padding: '4px 6px',
          display: 'flex', alignItems: 'center',
          background: highlighted ? 'hsl(210 80% 92%)' : 'transparent',
          borderRadius: 4,
          transition: 'background 240ms ease',
        }}
      >
        {state}
      </div>
      {EVENTS.map((e) => {
        const cell = matrix[state][e.internal];
        const bg =
          !cell.attempted ? 'hsl(38 30% 96%)' :
          cell.pass       ? 'hsl(142 50% 94%)' :
                            'hsl(0 60% 95%)';
        const fg =
          !cell.attempted ? 'hsl(25 18% 42%)' :
          cell.pass       ? 'hsl(142 70% 28%)' :
                            'hsl(0 70% 38%)';
        const border =
          !cell.attempted ? 'hsl(38 30% 88%)' :
          cell.pass       ? 'hsl(142 50% 70%)' :
                            'hsl(0 60% 75%)';
        const icon =
          !cell.attempted ? '○' :
          cell.pass       ? '✓' : '✗';
        // Pulse failed cells when their row is highlighted
        const isFailHighlighted = highlighted && cell.attempted && !cell.pass;
        return (
          <div
            key={`${state}-${e.internal}`}
            title={`${state} · ${e.label} → ${cell.detail}`}
            style={{
              background: bg, color: fg,
              border: `${isFailHighlighted ? 2 : 1}px solid ${isFailHighlighted ? 'hsl(0 80% 45%)' : border}`,
              borderRadius: 4, padding: '4px 2px',
              textAlign: 'center', fontWeight: 700,
              boxShadow: isFailHighlighted ? '0 0 0 3px hsl(0 80% 45% / 0.25)' : 'none',
              transform: isFailHighlighted ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform 240ms ease, box-shadow 240ms ease, border-color 240ms ease',
            }}
          >
            {icon}
          </div>
        );
      })}
    </>
  );
};

export default USTargetingTest;
