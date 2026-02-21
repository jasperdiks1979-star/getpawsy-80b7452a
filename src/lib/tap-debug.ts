/**
 * TAP DEBUG TRACER
 * Activate with ?tapdebug=1 in URL.
 * Logs pointerdown, click, and elementFromPoint to console.
 * Shows a fixed banner so you know it's active.
 * Zero impact when not activated.
 */
export function initTapDebug(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('tapdebug') || params.get('tapdebug') !== '1') return;

  // Banner
  const banner = document.createElement('div');
  banner.textContent = 'TAP DEBUG ON';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:999999;background:#ef4444;color:#fff;' +
    'text-align:center;padding:4px 8px;font-family:monospace;font-size:12px;font-weight:700;pointer-events:none;';
  document.body.appendChild(banner);

  // Listeners
  window.addEventListener(
    'pointerdown',
    (e) => {
      const fromPoint = document.elementFromPoint(e.clientX, e.clientY);
      console.log('[TAP_DEBUG] POINTERDOWN', {
        target: e.target,
        fromPoint,
        fromPointTag: fromPoint?.tagName,
        fromPointId: (fromPoint as HTMLElement)?.id,
        fromPointClass: (fromPoint as HTMLElement)?.className,
        x: e.clientX,
        y: e.clientY,
      });
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    'click',
    (e) => {
      const fromPoint = document.elementFromPoint(e.clientX, e.clientY);
      console.log('[TAP_DEBUG] CLICK', {
        target: e.target,
        fromPoint,
        fromPointTag: fromPoint?.tagName,
        fromPointId: (fromPoint as HTMLElement)?.id,
        fromPointClass: (fromPoint as HTMLElement)?.className,
        href: (e.target as HTMLAnchorElement)?.href || (e.target as HTMLElement)?.closest?.('a')?.href,
        defaultPrevented: e.defaultPrevented,
      });
    },
    { capture: true },
  );

  // Also capture errors visually
  const errorLog: string[] = [];
  const showError = (msg: string) => {
    errorLog.push(msg);
    banner.textContent = `TAP DEBUG ON | ERRORS: ${errorLog.length}`;
    banner.style.background = '#7f1d1d';
    console.error('[TAP_DEBUG] ERROR:', msg);
  };

  window.addEventListener('error', (e) => showError(e.message));
  window.addEventListener('unhandledrejection', (e) =>
    showError(e.reason?.message || String(e.reason)),
  );

  console.log('[TAP_DEBUG] Tap debug tracer initialized. Tap anywhere to see event targets.');
}
