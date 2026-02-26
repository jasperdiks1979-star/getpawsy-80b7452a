/**
 * CLSDebugBadge — live CLS readout for dev/preview.
 *
 * - Fixed bottom-left, tiny, non-intrusive
 * - pointer-events: none → can't accidentally click it
 * - contain: layout paint → zero layout impact
 * - Only mounts when VITE_CLS_BADGE is enabled AND not production
 */
import { useEffect, useState } from 'react';
import { getCLS } from '@/lib/perf/cls-monitor';

const SOFT = parseFloat(import.meta.env.VITE_CLS_SOFT_THRESHOLD || '0.08');
const HARD = parseFloat(import.meta.env.VITE_CLS_HARD_THRESHOLD || '0.12');

export function CLSDebugBadge() {
  const [cls, setCls] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCls(getCLS());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const color = cls >= HARD ? '#ef4444' : cls >= SOFT ? '#f59e0b' : '#22c55e';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 99999,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 700,
        color: '#fff',
        backgroundColor: color,
        opacity: 0.85,
        pointerEvents: 'none',
        contain: 'layout paint',
        lineHeight: '18px',
      }}
      aria-hidden="true"
    >
      CLS: {cls.toFixed(4)}
    </div>
  );
}

export default CLSDebugBadge;
