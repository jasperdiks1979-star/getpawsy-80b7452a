/**
 * Mobile-safe rendering zone constants and helpers for 9:16 vertical video.
 * Enforces: top header padding, bottom CTA safe area, side margins,
 * automatic font scaling, and multiline caption balancing.
 */

export type SafeZoneConfig = {
  width: number;
  height: number;
  safeTopPct: number;     // % of height reserved at top (status bar / UI overlap)
  safeBottomPct: number;  // % of height reserved at bottom (CTA / nav overlap)
  safeSidePct: number;    // % of width reserved on each side
};

export const DEFAULT_SAFE_ZONE: SafeZoneConfig = {
  width: 1080,
  height: 1920,
  safeTopPct: 12,
  safeBottomPct: 22,
  safeSidePct: 6,
};

export function getSafeBounds(cfg: SafeZoneConfig = DEFAULT_SAFE_ZONE) {
  const top = Math.round((cfg.safeTopPct / 100) * cfg.height);
  const bottom = Math.round((cfg.safeBottomPct / 100) * cfg.height);
  const side = Math.round((cfg.safeSidePct / 100) * cfg.width);
  return {
    top,
    bottom,
    left: side,
    right: side,
    safeWidth: cfg.width - side * 2,
    safeHeight: cfg.height - top - bottom,
    ctaTop: cfg.height - bottom, // y coord where CTA zone starts
  };
}

/**
 * Balance text into N lines, preferring even word distribution and
 * respecting max chars per line. Returns lines array (max maxLines).
 */
export function balanceCaption(
  text: string,
  maxLines: number,
  maxCharsPerLine: number,
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  // Try line counts from 1..maxLines, pick the one whose longest line
  // fits maxCharsPerLine with the most even distribution.
  let best: string[] = [words.join(' ')];
  let bestScore = Infinity;

  for (let n = 1; n <= maxLines; n++) {
    const lines = greedyWrap(words, n);
    const longest = Math.max(...lines.map((l) => l.length));
    if (longest > maxCharsPerLine && n < maxLines) continue;
    const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
    const variance = lines.reduce((s, l) => s + (l.length - avg) ** 2, 0);
    const score = variance + Math.max(0, longest - maxCharsPerLine) * 50;
    if (score < bestScore) {
      bestScore = score;
      best = lines;
    }
  }

  // Truncate excess words with ellipsis on last line if still too long
  return best.slice(0, maxLines).map((l, i, arr) =>
    i === arr.length - 1 && l.length > maxCharsPerLine + 4
      ? l.slice(0, maxCharsPerLine + 1).trimEnd() + '…'
      : l,
  );
}

function greedyWrap(words: string[], targetLines: number): string[] {
  const targetLen = Math.ceil(words.join(' ').length / targetLines);
  const lines: string[] = [];
  let current: string[] = [];
  for (const w of words) {
    const next = current.length ? current.join(' ') + ' ' + w : w;
    if (next.length > targetLen && current.length && lines.length < targetLines - 1) {
      lines.push(current.join(' '));
      current = [w];
    } else {
      current.push(w);
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

/**
 * Compute a font size that fits the longest line into safeWidth.
 * Approximation: avgCharWidth ≈ fontSize * 0.55 for sans-serif bold.
 */
export function fitFontSize(
  longestLine: string,
  safeWidth: number,
  minSize: number,
  maxSize: number,
): number {
  if (!longestLine) return maxSize;
  const charCount = Math.max(1, longestLine.length);
  const ideal = (safeWidth / charCount) / 0.55;
  return Math.max(minSize, Math.min(maxSize, Math.floor(ideal)));
}