/**
 * ConsentReportExporter — generates a client-side PDF snapshot of the
 * Dev Geo Consent panel: session settings, event log, summary metrics.
 *
 * Uses jsPDF (already a project dep) so no network round-trip is needed.
 * Pure dev tool — surfaced from DevConsentToggle on dev hosts only.
 */
import { useState } from 'react';
import jsPDF from 'jspdf';
import { getGeoConsentDebug, getDevGeoOverride } from '@/lib/geoConsent';
import { getConsentLog, summarizeConsentLog, type ConsentLogEntry } from '@/lib/consentLog';

interface ConsentReportExporterProps {
  className?: string;
  style?: React.CSSProperties;
}

const COLORS = {
  text: [25, 25, 25] as [number, number, number],
  muted: [110, 100, 90] as [number, number, number],
  brand: [201, 110, 55] as [number, number, number],
  green: [20, 130, 60] as [number, number, number],
  red: [180, 50, 50] as [number, number, number],
  amber: [180, 120, 30] as [number, number, number],
  bg: [248, 244, 238] as [number, number, number],
  border: [220, 210, 195] as [number, number, number],
};

function fmtTs(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function readTtq(): string {
  if (typeof window === 'undefined') return 'unknown';
  return ((window as any).__ttqConsent as string) || 'unknown';
}

function readStoredConsent(): string {
  try {
    const raw = localStorage.getItem('gp_cookie_consent');
    if (!raw) return 'none';
    return raw.includes(':') ? raw.split(':')[1] : raw;
  } catch {
    return 'n/a';
  }
}

/**
 * Last-test inference: scan the recent log for the most recent
 * CompletePayment event — that's what the guided test verifies.
 */
function inferLastTest(log: ConsentLogEntry[]) {
  const cp = [...log]
    .reverse()
    .find((e) => e.kind === 'tiktok-event' && e.event === 'CompletePayment') as
    | Extract<ConsentLogEntry, { kind: 'tiktok-event' }>
    | undefined;
  if (!cp) return null;
  return {
    ts: cp.ts,
    consentState: cp.consentState,
    source: cp.source,
    fired: cp.fired,
    pass: cp.consentState === 'granted' && cp.fired,
  };
}

function buildPdf() {
  const debug = getGeoConsentDebug();
  const override = getDevGeoOverride();
  const log = getConsentLog();
  const summary = summarizeConsentLog();
  const lastTest = inferLastTest(log);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentW = pageWidth - marginX * 2;
  let y = 50;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = 50;
    }
  };

  // Header
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('GetPawsy — Consent & TikTok Pixel Report', marginX, 24);

  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y = 56;
  doc.text(`Generated ${fmtTs(Date.now())}`, marginX, y);
  y += 12;
  if (typeof window !== 'undefined') {
    doc.text(`Origin: ${window.location.origin}`, marginX, y);
    y += 12;
    doc.text(`User-Agent: ${navigator.userAgent}`.slice(0, 110), marginX, y);
    y += 18;
  }

  const sectionTitle = (label: string) => {
    ensureSpace(28);
    doc.setFillColor(...COLORS.bg);
    doc.rect(marginX, y - 12, contentW, 20, 'F');
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, marginX + 8, y + 2);
    y += 18;
  };

  const kv = (key: string, value: string, valColor?: [number, number, number]) => {
    ensureSpace(14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text(key, marginX + 8, y);
    doc.setTextColor(...(valColor ?? COLORS.text));
    doc.setFont('helvetica', 'bold');
    doc.text(value, marginX + 160, y);
    y += 14;
  };

  // 1. Session settings
  sectionTitle('1. Session Settings');
  kv('Timezone', debug?.timezone || 'unknown');
  kv('GDPR region', String(debug?.isGdpr ?? false), debug?.isGdpr ? COLORS.amber : COLORS.green);
  kv('Auto-grant', String(debug?.autoGrant ?? false), debug?.autoGrant ? COLORS.green : COLORS.muted);
  kv('Dev override', override ?? 'none');
  kv('TikTok consent (ttq)', readTtq(), readTtq() === 'granted' ? COLORS.green : COLORS.red);
  kv('Stored cookie consent', readStoredConsent());
  y += 6;

  // 2. Summary metrics
  sectionTitle('2. Event Log Summary');
  kv('Total entries', String(summary.total));
  kv('Consent changes', String(summary.consentChanges));
  kv('TikTok events', String(summary.tikTokEvents));
  kv('Granted-fires', String(summary.firedWhileGranted), COLORS.green);
  kv(
    'Held / revoked-fires',
    String(summary.firedWhileHeld),
    summary.firedWhileHeld > 0 ? COLORS.red : COLORS.green,
  );
  if (Object.keys(summary.byEvent).length > 0) {
    ensureSpace(14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text('Events by type', marginX + 8, y);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    const breakdown = Object.entries(summary.byEvent)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    const lines = doc.splitTextToSize(breakdown, contentW - 168);
    doc.text(lines, marginX + 160, y);
    y += lines.length * 12 + 4;
  }
  y += 6;

  // 3. Last guided test result
  sectionTitle('3. Last CompletePayment Test');
  if (!lastTest) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text('No CompletePayment event recorded in this session.', marginX + 8, y);
    y += 18;
  } else {
    kv('Result', lastTest.pass ? 'PASS' : 'FAIL', lastTest.pass ? COLORS.green : COLORS.red);
    kv('Fired at', fmtTs(lastTest.ts));
    kv('Consent state', lastTest.consentState, lastTest.consentState === 'granted' ? COLORS.green : COLORS.red);
    kv('Consent source', lastTest.source);
    kv('SDK present', String(lastTest.fired), lastTest.fired ? COLORS.green : COLORS.red);
    y += 6;
  }

  // 4. Full event log
  sectionTitle('4. Event Log (chronological)');
  if (log.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text('Log is empty.', marginX + 8, y);
    y += 14;
  } else {
    // Table header
    ensureSpace(20);
    doc.setFillColor(...COLORS.bg);
    doc.rect(marginX, y - 10, contentW, 16, 'F');
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Time', marginX + 6, y);
    doc.text('Kind', marginX + 130, y);
    doc.text('Event / Value', marginX + 200, y);
    doc.text('State', marginX + 340, y);
    doc.text('Source', marginX + 410, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    log.forEach((e) => {
      ensureSpace(14);
      const time = new Date(e.ts).toISOString().slice(11, 23);
      doc.setTextColor(...COLORS.muted);
      doc.text(time, marginX + 6, y);
      doc.setTextColor(...COLORS.text);
      doc.text(e.kind === 'consent' ? 'consent' : 'tiktok', marginX + 130, y);
      const label = e.kind === 'consent' ? `→ ${e.value}` : e.event;
      doc.text(label.slice(0, 28), marginX + 200, y);
      const state = e.kind === 'consent' ? e.value : e.consentState;
      const stateColor =
        state === 'granted' || state === 'all'
          ? COLORS.green
          : state === 'held' || state === 'revoked' || state === 'necessary'
          ? COLORS.red
          : COLORS.muted;
      doc.setTextColor(...stateColor);
      doc.setFont('helvetica', 'bold');
      doc.text(state, marginX + 340, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.muted);
      doc.text(e.source.slice(0, 22), marginX + 410, y);
      y += 12;
    });
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(
      `GetPawsy diagnostic report — page ${i}/${pageCount}`,
      marginX,
      pageHeight - 24,
    );
    doc.text('Generated client-side · contains no PII', pageWidth - marginX, pageHeight - 24, {
      align: 'right',
    });
  }

  const filename = `getpawsy-consent-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`;
  doc.save(filename);
  return filename;
}

export const ConsentReportExporter = ({ className, style }: ConsentReportExporterProps) => {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    try {
      const filename = buildPdf();
      setLast(filename);
    } catch (err) {
      console.error('[ConsentReportExporter] failed to build PDF', err);
      setLast('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={className}
        style={{
          marginTop: 6,
          width: '100%',
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          background: 'transparent',
          color: 'hsl(25 30% 12%)',
          border: '1px solid hsl(22 70% 48%)',
          borderRadius: 6,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
          ...style,
        }}
      >
        {busy ? 'Building PDF…' : '📄 Export PDF report'}
      </button>
      {last && last !== 'error' && (
        <div style={{ marginTop: 4, fontSize: 9, color: 'hsl(142 70% 28%)', textAlign: 'center' }}>
          ✓ Saved {last.split('-').slice(-3).join('-')}
        </div>
      )}
      {last === 'error' && (
        <div style={{ marginTop: 4, fontSize: 9, color: 'hsl(0 70% 42%)', textAlign: 'center' }}>
          Failed — see console
        </div>
      )}
    </>
  );
};

export default ConsentReportExporter;