/**
 * GuidedConsentTest — step-by-step incognito CompletePayment verifier.
 *
 * Walks the operator through the exact sequence required to prove the
 * TikTok pixel fires `CompletePayment` under granted consent in a clean
 * (incognito) session. Each step auto-advances when its condition is met
 * by polling the consent log + ttq state every 600ms.
 *
 * Pure dev tooling — only mounted via DevConsentToggle on dev hosts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getConsentLog, clearConsentLog, type ConsentLogEntry } from '@/lib/consentLog';

type StepStatus = 'pending' | 'active' | 'done' | 'fail';

interface StepMeta {
  status: StepStatus;
  doneAt: number | null;
}

interface GuidedConsentTestProps {
  onClose: () => void;
}

function readTtq(): 'granted' | 'held' | 'revoked' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const v = (window as any).__ttqConsent;
  return v === 'granted' || v === 'held' || v === 'revoked' ? v : 'unknown';
}

export const GuidedConsentTest = ({ onClose }: GuidedConsentTestProps) => {
  const [startTs, setStartTs] = useState<number>(() => Date.now());
  const [tick, setTick] = useState(0);
  // Per-step completion timestamps — captured the first poll a step turns done/fail
  const stepDoneAtRef = useRef<Record<number, number | null>>({ 1: null, 2: null, 3: null, 4: null });

  // Poll every 600ms while open
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 600);
    return () => clearInterval(t);
  }, []);

  const state = useMemo(() => {
    const log = getConsentLog().filter((e) => e.ts >= startTs);
    const ttq = readTtq();
    const consentChange = log.find((e) => e.kind === 'consent');
    const completePayment = log.find(
      (e) => e.kind === 'tiktok-event' && e.event === 'CompletePayment',
    ) as Extract<ReturnType<typeof getConsentLog>[number], { kind: 'tiktok-event' }> | undefined;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const onThankYou = /^\/thank-you(\/|$)/i.test(path) || /^\/payment-success(\/|$)/i.test(path);
    return { log, ttq, consentChange, completePayment, path, onThankYou };
  }, [tick, startTs]);

  // Step status calculation (raw)
  const step1Status: StepStatus = 'done';
  const step2Status: StepStatus = state.consentChange ? 'done' : 'active';
  const step3Status: StepStatus =
    state.ttq === 'granted'
      ? 'done'
      : step2Status === 'done'
      ? 'active'
      : 'pending';
  // Step 4 only resolves to done/fail when the operator is on the /thank-you page.
  // This prevents false positives from CompletePayment events fired elsewhere
  // (e.g. accidental re-fire on a stale tab) and forces verification of the
  // real post-purchase landing surface.
  const step4Status: StepStatus = state.completePayment
    ? state.onThankYou
      ? state.completePayment.consentState === 'granted'
        ? 'done'
        : 'fail'
      : 'active'
    : step3Status === 'done'
    ? 'active'
    : 'pending';

  // Capture completion timestamps the first time each step terminates
  const captureDoneAt = (n: number, status: StepStatus, sourceTs?: number) => {
    if ((status === 'done' || status === 'fail') && stepDoneAtRef.current[n] === null) {
      stepDoneAtRef.current[n] = sourceTs ?? Date.now();
    }
  };
  captureDoneAt(1, step1Status, startTs);
  captureDoneAt(2, step2Status, state.consentChange?.ts);
  captureDoneAt(3, step3Status);
  captureDoneAt(4, step4Status, state.completePayment?.ts);

  const step1: StepMeta = { status: step1Status, doneAt: stepDoneAtRef.current[1] };
  const step2: StepMeta = { status: step2Status, doneAt: stepDoneAtRef.current[2] };
  const step3: StepMeta = { status: step3Status, doneAt: stepDoneAtRef.current[3] };
  const step4: StepMeta = { status: step4Status, doneAt: stepDoneAtRef.current[4] };

  const allDone = step4.status === 'done';

  const reset = () => {
    clearConsentLog();
    setStartTs(Date.now());
    stepDoneAtRef.current = { 1: null, 2: null, 3: null, 4: null };
    setTick((n) => n + 1);
  };

  // Export the guided test result as a downloadable JSON file.
  // Captures: ttq state, the matched CompletePayment payload (consentState,
  // source, meta), per-step status + timestamps, the path verification flag,
  // and the full session log filtered to this test run. No PII — purely
  // diagnostic data already present in the in-page consent log.
  const exportJson = () => {
    if (typeof window === 'undefined') return;
    const cp = state.completePayment;
    const result = {
      schema: 'gp.guided-consent-test/v1',
      exportedAt: new Date().toISOString(),
      url: window.location.href,
      path: state.path,
      onThankYou: state.onThankYou,
      startedAt: new Date(startTs).toISOString(),
      durationMs: Date.now() - startTs,
      ttqState: state.ttq,
      consentChange: state.consentChange
        ? {
            ts: new Date(state.consentChange.ts).toISOString(),
            source: state.consentChange.source,
            value: state.consentChange.value,
            isGdprRegion: state.consentChange.isGdprRegion,
          }
        : null,
      completePayment: cp
        ? {
            ts: new Date(cp.ts).toISOString(),
            event: cp.event,
            consentState: cp.consentState,
            source: cp.source,
            fired: cp.fired,
            meta: cp.meta ?? null,
          }
        : null,
      steps: {
        '1': { status: step1.status, doneAt: step1.doneAt ? new Date(step1.doneAt).toISOString() : null },
        '2': { status: step2.status, doneAt: step2.doneAt ? new Date(step2.doneAt).toISOString() : null },
        '3': { status: step3.status, doneAt: step3.doneAt ? new Date(step3.doneAt).toISOString() : null },
        '4': { status: step4.status, doneAt: step4.doneAt ? new Date(step4.doneAt).toISOString() : null },
      },
      verdict: allDone
        ? 'pass'
        : step4.status === 'fail'
        ? 'fail'
        : 'incomplete',
      eventLog: state.log.map((e) => ({ ...e, tsIso: new Date(e.ts).toISOString() })),
    };
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `guided-consent-test-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div
      role="dialog"
      aria-label="Guided consent test"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 2147483647,
        width: 280,
        padding: 12,
        background: '#fff',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>🧪 Guided CompletePayment Test</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guided test"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: 'hsl(25 18% 42%)',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: 'hsl(25 18% 42%)' }}>
        Verify the TikTok pixel fires <code>CompletePayment</code> under granted consent.
        Steps auto-check every 600 ms.
      </div>

      <ol style={{ marginTop: 10, paddingLeft: 0, listStyle: 'none' }}>
        <Step
          n={1}
          meta={step1}
          startTs={startTs}
          title="Open this URL in an incognito window"
          body={
            <>
              Copy the current URL and open it in a fresh private window so no
              prior consent state leaks in.
              <CopyAndIncognitoHelper
                text={typeof window !== 'undefined' ? window.location.href : ''}
              />
            </>
          }
        />
        <Step
          n={2}
          meta={step2}
          startTs={startTs}
          title="Accept the cookie banner"
          body={
            <>
              In the incognito tab, click <strong>Accept all</strong> on the
              cookie banner. Auto-detected: {state.consentChange?.kind === 'consent' ? (
                <code>{state.consentChange.value} ({state.consentChange.source})</code>
              ) : (
                <span style={{ color: 'hsl(25 18% 42%)' }}>waiting…</span>
              )}
            </>
          }
        />
        <Step
          n={3}
          meta={step3}
          startTs={startTs}
          title="Confirm pixel state = granted"
          body={
            <>
              ttq is currently:{' '}
              <code
                style={{
                  color:
                    state.ttq === 'granted'
                      ? 'hsl(142 70% 32%)'
                      : state.ttq === 'held' || state.ttq === 'revoked'
                      ? 'hsl(0 70% 42%)'
                      : 'hsl(25 18% 42%)',
                }}
              >
                {state.ttq}
              </code>
            </>
          }
        />
        <Step
          n={4}
          meta={step4}
          startTs={startTs}
          title="Complete a test purchase → /thank-you"
          body={
            <>
              Add an item to cart, check out with a Stripe test card
              (<code>4242 4242 4242 4242</code>), and land on{' '}
              <code>/thank-you</code>.
              <div style={{ marginTop: 4, fontSize: 10, color: 'hsl(25 18% 42%)' }}>
                Current path: <code>{state.path || '—'}</code>{' '}
                {state.onThankYou ? (
                  <span style={{ color: 'hsl(142 70% 32%)', fontWeight: 600 }}>
                    ✓ on /thank-you
                  </span>
                ) : (
                  <span style={{ color: 'hsl(22 70% 48%)', fontWeight: 600 }}>
                    (not on /thank-you yet)
                  </span>
                )}
              </div>
              {state.completePayment ? (
                !state.onThankYou ? (
                  <div style={{ color: 'hsl(22 70% 48%)', marginTop: 4 }}>
                    ⏳ CompletePayment detected, but waiting for the browser to
                    reach <code>/thank-you</code> before marking this step.
                  </div>
                ) : state.completePayment.consentState === 'granted' ? (
                  <div style={{ color: 'hsl(142 70% 32%)', marginTop: 4 }}>
                    ✅ CompletePayment fired on /thank-you with consentState = granted
                  </div>
                ) : (
                  <div style={{ color: 'hsl(0 70% 42%)', marginTop: 4 }}>
                    ⚠️ CompletePayment fired on /thank-you but consentState ={' '}
                    <code>{state.completePayment.consentState}</code> — pixel
                    will reject this event.
                  </div>
                )
              ) : (
                <div style={{ color: 'hsl(25 18% 42%)', marginTop: 4 }}>
                  Waiting for purchase event…
                </div>
              )}
            </>
          }
        />
      </ol>

      {/* Live event inspector — appends every consent log entry as it happens */}
      <div
        style={{
          marginTop: 10,
          border: '1px solid hsl(38 30% 88%)',
          borderRadius: 6,
          background: 'hsl(38 30% 98%)',
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        <div
          style={{
            padding: '6px 8px',
            borderBottom: '1px solid hsl(38 30% 92%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <strong style={{ fontSize: 10, color: 'hsl(25 30% 12%)' }}>
            Live event inspector
          </strong>
          <span style={{ fontSize: 9, color: 'hsl(25 18% 42%)' }}>
            {state.log.length} entr{state.log.length === 1 ? 'y' : 'ies'} · polls every 600 ms
          </span>
        </div>
        <div style={{ maxHeight: 140, overflowY: 'auto', padding: '4px 8px' }}>
          {state.log.length === 0 ? (
            <div style={{ color: 'hsl(25 18% 42%)', padding: '6px 0', fontStyle: 'italic' }}>
              Waiting for the first event…
            </div>
          ) : (
            state.log.map((e, i) => {
              const f = fmtEntry(e);
              return (
                <div
                  key={`${e.ts}-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '64px 1fr auto',
                    gap: 6,
                    padding: '2px 0',
                    borderBottom: i < state.log.length - 1 ? '1px dashed hsl(38 30% 92%)' : 'none',
                  }}
                >
                  <span style={{ color: 'hsl(25 18% 42%)' }}>
                    +{fmtDelta(e.ts - startTs)}
                  </span>
                  <span style={{ color: 'hsl(25 30% 12%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>
                  <span style={{ color: f.color, fontWeight: 700 }}>{f.state}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {allDone && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: 'hsl(142 50% 94%)',
            border: '1px solid hsl(142 50% 70%)',
            borderRadius: 6,
            fontSize: 11,
            color: 'hsl(142 70% 22%)',
          }}
        >
          🎉 All checks passed. The TikTok pixel is correctly tracking
          purchases under granted consent. Safe to launch the US Spark Ad.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            fontWeight: 600,
            background: 'transparent',
            color: 'hsl(25 30% 12%)',
            border: '1px solid hsl(38 30% 88%)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          ↻ Restart test
        </button>
        <button
          type="button"
          onClick={exportJson}
          title="Download ttq state, CompletePayment payload, step status & event log as JSON"
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            fontWeight: 600,
            background: 'hsl(38 30% 96%)',
            color: 'hsl(25 30% 12%)',
            border: '1px solid hsl(38 30% 88%)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          ⤓ Export JSON
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            fontWeight: 600,
            background: 'hsl(22 70% 48%)',
            color: '#fff',
            border: '1px solid hsl(22 70% 48%)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: 'hsl(25 18% 42%)' }}>
        Tip: events are detected from the in-page consent log, so the
        purchase must happen in <em>this</em> browser tab/window.
      </div>
    </div>
  );
};

const Step = ({
  n,
  meta,
  startTs,
  title,
  body,
}: {
  n: number;
  meta: StepMeta;
  startTs: number;
  title: string;
  body: React.ReactNode;
}) => {
  const status = meta.status;
  const color =
    status === 'done'
      ? 'hsl(142 70% 32%)'
      : status === 'fail'
      ? 'hsl(0 70% 42%)'
      : status === 'active'
      ? 'hsl(22 70% 48%)'
      : 'hsl(25 18% 60%)';
  const icon = status === 'done' ? '✓' : status === 'fail' ? '✕' : status === 'active' ? '●' : '○';
  const ts = meta.doneAt;
  const stamp =
    ts !== null
      ? `${fmtClock(ts)} (+${fmtDelta(ts - startTs)})`
      : null;
  return (
    <li style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: status === 'done' ? color : 'transparent',
          color: status === 'done' ? '#fff' : color,
          border: `1.5px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, fontSize: 11, lineHeight: 1.45 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
          <div style={{ fontWeight: 600, color: 'hsl(25 30% 12%)' }}>
            Step {n}: {title}
          </div>
          {stamp && (
            <code style={{ fontSize: 9, color: color, whiteSpace: 'nowrap' }}>{stamp}</code>
          )}
        </div>
        <div style={{ marginTop: 2, color: 'hsl(25 18% 30%)' }}>{body}</div>
      </div>
    </li>
  );
};

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function fmtDelta(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function fmtEntry(e: ConsentLogEntry): { label: string; state: string; color: string } {
  if (e.kind === 'consent') {
    return {
      label: `consent → ${e.value}`,
      state: e.source,
      color: e.value === 'all' ? 'hsl(142 70% 32%)' : 'hsl(0 70% 42%)',
    };
  }
  return {
    label: e.event,
    state: e.consentState,
    color:
      e.consentState === 'granted'
        ? 'hsl(142 70% 32%)'
        : e.consentState === 'held' || e.consentState === 'revoked'
        ? 'hsl(0 70% 42%)'
        : 'hsl(25 18% 42%)',
  };
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      style={{
        marginLeft: 6,
        padding: '2px 6px',
        fontSize: 10,
        background: 'hsl(38 30% 96%)',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {copied ? '✓ copied' : 'copy URL'}
    </button>
  );
};

export default GuidedConsentTest;