/**
 * Tiny floating chip to toggle internal traffic flag.
 * Only visible when ?bootdebug=1 OR user is already internal.
 * No layout impact (position: fixed).
 */
import { useState, useEffect } from 'react';
import { isInternalTraffic, setInternalTraffic, getTrafficContext } from '@/lib/traffic';

export const InternalTrafficChip = () => {
  const [visible, setVisible] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const showDebug = params.has('bootdebug') || isInternalTraffic();
    setVisible(showDebug);
    setIsInternal(isInternalTraffic());
  }, []);

  if (!visible) return null;

  const toggle = () => {
    const next = !isInternal;
    setInternalTraffic(next);
    setIsInternal(next);
  };

  const ctx = getTrafficContext();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 99999,
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.3,
        background: isInternal ? '#dc2626' : '#16a34a',
        color: '#fff',
        borderRadius: 6,
        padding: '4px 8px',
        cursor: 'pointer',
        opacity: 0.85,
        maxWidth: expanded ? 260 : 'auto',
        userSelect: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
      onClick={toggle}
      onDoubleClick={() => setExpanded(e => !e)}
      title="Click to toggle. Double-click for debug info."
    >
      <div>Internal: {isInternal ? 'ON' : 'OFF'}</div>
      {expanded && (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.9, wordBreak: 'break-all' }}>
          <div>type: {ctx.trafficType}</div>
          <div>intent: {ctx.visitorIntent}</div>
          <div>source: {ctx.trafficSourceHint}</div>
          <div>route: {window.location.pathname}</div>
        </div>
      )}
    </div>
  );
};
