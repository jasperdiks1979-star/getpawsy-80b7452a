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

/**
 * Hard safe-area validator. Given a caption + target font size + max lines,
 * returns a guaranteed-safe layout. Auto-shortens, auto-scales, and clamps
 * the y-position into the safe zone. Never throws — always returns a
 * rendererable result so the render pipeline can never fail on captions.
 */
export type SafeCaption = {
  ok: boolean;
  text: string;
  lines: string[];
  fontSize: number;
  x: number;
  y: number;
  width: number;
  fixed: string[]; // list of mutations applied (for telemetry)
};

export function safeAreaValidator(
  rawText: string,
  opts: {
    cfg?: SafeZoneConfig;
    maxLines?: number;
    maxFontSize?: number;
    minFontSize?: number;
    anchor?: 'top' | 'middle' | 'bottom';
    avoidSubjectBbox?: { y: number; height: number } | null;
  } = {},
): SafeCaption {
  const cfg = opts.cfg ?? DEFAULT_SAFE_ZONE;
  const maxLines = Math.min(2, Math.max(1, opts.maxLines ?? 2));
  const maxFontSize = opts.maxFontSize ?? 96;
  const minFontSize = opts.minFontSize ?? 36;
  const anchor = opts.anchor ?? 'bottom';
  const fixed: string[] = [];

  const bounds = getSafeBounds(cfg);
  const safeWidth = bounds.safeWidth;

  // 1) Hard-truncate absurdly long text
  let text = (rawText || '').trim().replace(/\s+/g, ' ');
  if (text.length > 80) {
    text = text.slice(0, 78).trimEnd() + '…';
    fixed.push('truncated_80');
  }

  // 2) Balance into ≤maxLines, approx chars per line based on max font
  const approxCharsPerLine = Math.floor(safeWidth / (maxFontSize * 0.55));
  let lines = balanceCaption(text, maxLines, approxCharsPerLine);

  // 3) Fit font size to the longest line
  const longest = lines.reduce((a, l) => (l.length > a.length ? l : a), '');
  let fontSize = fitFontSize(longest, safeWidth, minFontSize, maxFontSize);
  if (fontSize < maxFontSize) fixed.push(`scaled_font_${fontSize}`);

  // 4) Re-balance with the chosen font size for better wrapping
  const fittedCharsPerLine = Math.floor(safeWidth / (fontSize * 0.55));
  lines = balanceCaption(text, maxLines, fittedCharsPerLine);

  // 5) Compute y position respecting anchor + subject bbox avoidance
  const lineHeight = Math.round(fontSize * 1.2);
  const blockHeight = lineHeight * lines.length;

  let y: number;
  if (anchor === 'top') {
    y = bounds.top + Math.round(lineHeight * 0.3);
  } else if (anchor === 'middle') {
    y = Math.round((cfg.height - blockHeight) / 2);
  } else {
    // bottom anchor: sit above the CTA reserved zone
    y = bounds.ctaTop - blockHeight - Math.round(lineHeight * 0.4);
  }

  // 6) Avoid subject bbox if provided (push above or below)
  if (opts.avoidSubjectBbox) {
    const sb = opts.avoidSubjectBbox;
    const overlaps = !(y + blockHeight < sb.y || y > sb.y + sb.height);
    if (overlaps) {
      const aboveY = sb.y - blockHeight - 20;
      const belowY = sb.y + sb.height + 20;
      if (aboveY >= bounds.top) {
        y = aboveY;
        fixed.push('moved_above_subject');
      } else if (belowY + blockHeight <= bounds.ctaTop) {
        y = belowY;
        fixed.push('moved_below_subject');
      } else {
        fixed.push('subject_overlap_unavoidable');
      }
    }
  }

  // 7) Clamp y into safe zone
  const minY = bounds.top;
  const maxY = bounds.ctaTop - blockHeight;
  if (y < minY) {
    y = minY;
    fixed.push('clamped_top');
  }
  if (y > maxY) {
    y = maxY;
    fixed.push('clamped_bottom');
  }

  return {
    ok: fixed.length === 0,
    text: lines.join(' '),
    lines,
    fontSize,
    x: bounds.left,
    y,
    width: safeWidth,
    fixed,
  };
}

/**
 * Validate every caption in a scene plan and rewrite any unsafe one
 * in-place. Always returns a valid plan — never fails.
 */
export function validateScenePlanCaptions<T extends { caption?: string; isCta?: boolean; isHook?: boolean }>(
  plan: T[],
  cfg: SafeZoneConfig = DEFAULT_SAFE_ZONE,
): { plan: T[]; mutations: number; details: Array<{ index: number; fixed: string[] }> } {
  const details: Array<{ index: number; fixed: string[] }> = [];
  let mutations = 0;
  const out = plan.map((scene, i) => {
    if (!scene.caption) return scene;
    const result = safeAreaValidator(scene.caption, {
      cfg,
      maxLines: 2,
      anchor: scene.isCta ? 'bottom' : scene.isHook ? 'top' : 'middle',
    });
    if (result.fixed.length > 0) {
      mutations++;
      details.push({ index: i, fixed: result.fixed });
    }
    return { ...scene, caption: result.text };
  });
  return { plan: out, mutations, details };
}