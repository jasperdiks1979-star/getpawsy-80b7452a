import { BUILD_ID, BUILD_TS } from '@/lib/boot-diagnostics';

/**
 * Subtle fixed badge showing the current build ID.
 * Always visible in both preview and production so we can confirm
 * which version is deployed on getpawsy.pet.
 */
export function BuildBadge() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 4,
        left: 4,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        fontSize: '10px',
        fontFamily: 'monospace',
        padding: '2px 6px',
        borderRadius: '4px',
        pointerEvents: 'none',
        opacity: 0.6,
        lineHeight: 1.3,
        maxWidth: '220px',
        wordBreak: 'break-all',
      }}
    >
      Build: {BUILD_ID}
    </div>
  );
}
