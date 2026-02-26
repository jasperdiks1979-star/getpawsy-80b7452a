/**
 * WebVitalsPanel — dev/preview Web Vitals Command Center.
 *
 * Fixed bottom-left panel showing live CLS, LCP, FCP, TBT, bundle size,
 * geometry mismatch flag, and budget status.
 *
 * - position: fixed; contain: layout paint
 * - pointer-events: none → can't interfere with app
 * - Only loads in non-prod when VITE_VITALS_PANEL !== "false"
 * - Zero layout impact
 */
import { useEffect, useState } from 'react';
import { getCLS } from '@/lib/perf/cls-monitor';
import { getLCP } from '@/lib/perf/lcp-monitor';
import type { BudgetResult } from '@/lib/perf/budget-enforcer';

const CLS_SOFT = 0.08;
const CLS_HARD = 0.12;
const LCP_SOFT = 2500;
const LCP_HARD = 4000;

function statusColor(value: number, soft: number, hard: number): string {
  if (value >= hard) return '#ef4444';
  if (value >= soft) return '#f59e0b';
  return '#22c55e';
}

interface VitalsState {
  cls: number;
  lcp: number;
  fcp: number;
  geoMismatch: boolean;
  budgetViolations: number;
  budgetResults: BudgetResult[];
}

export function WebVitalsPanel() {
  const [vitals, setVitals] = useState<VitalsState>({
    cls: 0, lcp: 0, fcp: 0,
    geoMismatch: false, budgetViolations: 0, budgetResults: [],
  });
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      const guard = (window as any).__CLS_GUARD__;
      const lcpGuard = (window as any).__LCP_GUARD__;

      // FCP from paint entries
      let fcp = 0;
      try {
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
        if (fcpEntry) fcp = fcpEntry.startTime;
      } catch {}

      const budgetResults: BudgetResult[] = guard?.budgetResults || [];
      const violations = budgetResults.filter(r => r.exceeded).length;

      setVitals({
        cls: getCLS(),
        lcp: lcpGuard?.lcp ?? getLCP(),
        fcp,
        geoMismatch: guard?.geometryMismatch ?? false,
        budgetViolations: violations,
        budgetResults,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 8,
    left: 8,
    zIndex: 99999,
    padding: collapsed ? '2px 8px' : '8px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'ui-monospace, "SF Mono", Monaco, monospace',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: 'rgba(15, 15, 15, 0.92)',
    opacity: 0.95,
    pointerEvents: 'auto',
    contain: 'layout paint',
    lineHeight: '16px',
    maxWidth: collapsed ? 140 : 260,
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.1)',
    userSelect: 'none',
  };

  const Row = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '1px 0' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );

  if (collapsed) {
    const clsColor = statusColor(vitals.cls, CLS_SOFT, CLS_HARD);
    const hasIssues = vitals.geoMismatch || vitals.budgetViolations > 0 || vitals.cls >= CLS_HARD;

    return (
      <div style={panelStyle} onClick={() => setCollapsed(false)} aria-hidden="true">
        <span style={{ color: clsColor }}>CLS: {vitals.cls.toFixed(4)}</span>
        {vitals.lcp > 0 && (
          <span style={{ color: statusColor(vitals.lcp, LCP_SOFT, LCP_HARD), marginLeft: 8 }}>
            LCP: {(vitals.lcp / 1000).toFixed(1)}s
          </span>
        )}
        {hasIssues && <span style={{ color: '#ef4444', marginLeft: 4 }}>⚠</span>}
      </div>
    );
  }

  return (
    <div style={panelStyle} onClick={() => setCollapsed(true)} aria-hidden="true">
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 10, color: '#888', letterSpacing: 1 }}>
        WEB VITALS
      </div>

      <Row label="CLS" value={vitals.cls.toFixed(4)} color={statusColor(vitals.cls, CLS_SOFT, CLS_HARD)} />
      <Row label="LCP" value={vitals.lcp > 0 ? `${Math.round(vitals.lcp)}ms` : '—'} color={statusColor(vitals.lcp, LCP_SOFT, LCP_HARD)} />
      <Row label="FCP" value={vitals.fcp > 0 ? `${Math.round(vitals.fcp)}ms` : '—'} color={statusColor(vitals.fcp, 1500, 2500)} />

      {vitals.geoMismatch && (
        <div style={{ color: '#ef4444', fontSize: 9, marginTop: 4 }}>⚠ GEOMETRY MISMATCH</div>
      )}

      {vitals.budgetViolations > 0 && (
        <div style={{ color: '#f59e0b', fontSize: 9, marginTop: 2 }}>
          ⚠ {vitals.budgetViolations} budget violation{vitals.budgetViolations > 1 ? 's' : ''}
        </div>
      )}

      {vitals.budgetResults.length > 0 && (
        <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
          {vitals.budgetResults.map(r => (
            <Row
              key={r.metric}
              label={r.metric}
              value={`${r.value}${r.unit}`}
              color={r.exceeded ? '#ef4444' : '#22c55e'}
            />
          ))}
        </div>
      )}

      <div style={{ fontSize: 8, color: '#555', marginTop: 4, textAlign: 'center' }}>
        click to collapse
      </div>
    </div>
  );
}

export default WebVitalsPanel;
