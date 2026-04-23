/**
 * Deno mirror of `src/test/fixtures/pdpRenderTraceTags.ts`.
 *
 * The Deno edge tests can't import from `src/`, so this file holds an
 * **exact** byte-for-byte copy of the fixture builders. A contract test in
 * the Vitest suite (`src/test/pdp-render-trace-fixtures.contract.test.ts`)
 * snapshots a known set of payloads from BOTH modules and asserts they
 * match — if you tweak the canonical format here, the Vitest contract test
 * will fail until you update the TS fixture too.
 */

export type PdpRenderState = "shell" | "rendered" | "timeout";

export const PDP_RENDER_STATES: readonly PdpRenderState[] = [
  "shell",
  "rendered",
  "timeout",
] as const;

export const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export const DEFAULT_PDP_ORIGIN = "https://getpawsy.pet";

export interface RenderDurationsFixture {
  tMountMs: number;
  tSinceShellMs?: number;
}

const clampMs = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
};

export function buildPdpRenderTraceUaSuffix(
  state: PdpRenderState,
  durations: RenderDurationsFixture,
): string {
  const parts: string[] = [
    `pdp-render-trace:${state}`,
    `t_mount=${clampMs(durations.tMountMs)}ms`,
  ];

  if (state !== "shell") {
    if (durations.tSinceShellMs === undefined) {
      throw new Error(
        `pdp-render-trace fixture: state="${state}" requires tSinceShellMs`,
      );
    }
    parts.push(`t_shell=${clampMs(durations.tSinceShellMs)}ms`);
  } else if (durations.tSinceShellMs !== undefined) {
    throw new Error(
      'pdp-render-trace fixture: state="shell" must NOT carry tSinceShellMs',
    );
  }

  return `[${parts.join(" ")}]`;
}

export function buildPdpRenderTraceUserAgent(
  state: PdpRenderState,
  durations: RenderDurationsFixture,
  baseUa: string = GOOGLEBOT_UA,
): string {
  return `${baseUa} ${buildPdpRenderTraceUaSuffix(state, durations)}`;
}

export function buildPdpRenderTracePageUrl(
  slug: string,
  state: PdpRenderState,
  durations: RenderDurationsFixture,
  origin: string = DEFAULT_PDP_ORIGIN,
): string {
  const params = new URLSearchParams();
  params.set("_render", state);
  params.set("_t_mount", String(clampMs(durations.tMountMs)));
  if (state !== "shell") {
    if (durations.tSinceShellMs === undefined) {
      throw new Error(
        `pdp-render-trace fixture: state="${state}" requires tSinceShellMs`,
      );
    }
    params.set("_t_shell", String(clampMs(durations.tSinceShellMs)));
  }
  return `${origin}/product/${slug}?${params.toString()}`;
}

export interface PdpRenderTracePayload {
  pageUrl: string;
  userAgent: string;
  referrer: string;
}

export function buildPdpRenderTracePayload(
  slug: string,
  state: PdpRenderState,
  durations: RenderDurationsFixture,
  opts: { origin?: string; baseUa?: string; referrer?: string } = {},
): PdpRenderTracePayload {
  const origin = opts.origin ?? DEFAULT_PDP_ORIGIN;
  return {
    pageUrl: buildPdpRenderTracePageUrl(slug, state, durations, origin),
    userAgent: buildPdpRenderTraceUserAgent(state, durations, opts.baseUa),
    referrer: opts.referrer ?? `${origin}/`,
  };
}

export const DEFAULT_RENDER_DURATIONS: Record<
  PdpRenderState,
  RenderDurationsFixture
> = {
  shell: { tMountMs: 0 },
  rendered: { tMountMs: 120, tSinceShellMs: 120 },
  timeout: { tMountMs: 8000, tSinceShellMs: 8000 },
};

export function pdpRenderTraceUaTagRegex(state: PdpRenderState): RegExp {
  return new RegExp(`\\[pdp-render-trace:${state}\\b[^\\]]*\\]`);
}

export const PDP_RENDER_TRACE_ANY_STATE_REGEX =
  /\[pdp-render-trace:(shell|rendered|timeout)\b[^\]]*\]/;

export function extractPdpRenderTraceState(
  ua: string,
): PdpRenderState | null {
  const m = ua.match(/pdp-render-trace[/:](shell|rendered|timeout)\b/i);
  return m ? (m[1].toLowerCase() as PdpRenderState) : null;
}

/**
 * The frozen, canonical golden examples. Both this file and its Vitest
 * counterpart re-derive these strings from the builders above. If they
 * ever diverge, the contract test fails loudly.
 */
export const CANONICAL_GOLDEN_EXAMPLES = {
  shell: {
    slug: "fixture-slug",
    durations: DEFAULT_RENDER_DURATIONS.shell,
    expectedUaSuffix: "[pdp-render-trace:shell t_mount=0ms]",
    expectedPageUrl:
      "https://getpawsy.pet/product/fixture-slug?_render=shell&_t_mount=0",
  },
  rendered: {
    slug: "fixture-slug",
    durations: DEFAULT_RENDER_DURATIONS.rendered,
    expectedUaSuffix:
      "[pdp-render-trace:rendered t_mount=120ms t_shell=120ms]",
    expectedPageUrl:
      "https://getpawsy.pet/product/fixture-slug?_render=rendered&_t_mount=120&_t_shell=120",
  },
  timeout: {
    slug: "fixture-slug",
    durations: DEFAULT_RENDER_DURATIONS.timeout,
    expectedUaSuffix:
      "[pdp-render-trace:timeout t_mount=8000ms t_shell=8000ms]",
    expectedPageUrl:
      "https://getpawsy.pet/product/fixture-slug?_render=timeout&_t_mount=8000&_t_shell=8000",
  },
} as const;