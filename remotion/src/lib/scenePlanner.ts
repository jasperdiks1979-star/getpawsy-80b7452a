/**
 * Multi-scene planner for v2 cinematic ad engine.
 * Builds a 5-12 scene plan with non-repeating crops + motion + categories,
 * enforcing pacing from a style preset.
 */

export type SceneCategory =
  | 'product_hero'
  | 'closeup_detail'
  | 'lifestyle'
  | 'pet_interaction'
  | 'owner_interaction'
  | 'before_after'
  | 'problem'
  | 'comfort'
  | 'cta';

export type MotionType =
  | 'push_in'
  | 'pull_out'
  | 'whip_pan'
  | 'parallax'
  | 'rack_focus'
  | 'crop_shift'
  | 'speed_ramp'
  | 'handheld'
  | 'static_micro';

export type CropRegion = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

export interface ScenePlanItem {
  index: number;
  category: SceneCategory;
  motion: MotionType;
  crop: CropRegion;
  zoom: number;            // 1.0 = fit; >1 = closer
  durationFrames: number;
  imageIndex: number;      // which source asset to use
  caption?: string;
  isHook?: boolean;
  isCta?: boolean;
  hash: string;            // for uniqueness comparison
  /** v4: explicit role for scene-structure enforcement. */
  role?: 'hook' | 'problem' | 'benefit' | 'cta' | 'pattern_interrupt' | 'beat';
  /** v4: pattern interrupt flag — whip pan / speed ramp / crop flip. */
  isPatternInterrupt?: boolean;
}

export interface PacingConfig {
  hook_duration_frames: number;
  scene_min_frames: number;
  scene_max_frames: number;
  cta_duration_frames: number;
  pattern_interrupt_every: number;
}

export interface PlanOptions {
  pacing: PacingConfig;
  imageCount: number;
  totalDurationFrames?: number; // upper bound
  minScenes?: number;
  maxScenes?: number;
  hookText?: string;
  ctaText?: string;
  bodyCaptions?: string[];
}

const ALL_MOTIONS: MotionType[] = [
  'push_in', 'pull_out', 'whip_pan', 'parallax',
  'rack_focus', 'crop_shift', 'speed_ramp', 'handheld',
];

const ALL_CROPS: CropRegion[] = [
  'center', 'top', 'bottom', 'left', 'right',
  'top_left', 'top_right', 'bottom_left', 'bottom_right',
];

const STORY_FLOW: SceneCategory[] = [
  'product_hero',     // hook
  'problem',
  'closeup_detail',
  'lifestyle',
  'pet_interaction',
  'comfort',
  'before_after',
  'owner_interaction',
  'closeup_detail',
  'lifestyle',
  'product_hero',
  'cta',
];

function hashScene(s: Omit<ScenePlanItem, 'hash' | 'index'>): string {
  return [s.category, s.motion, s.crop, s.zoom.toFixed(2), s.imageIndex].join('|');
}

/**
 * Build a scene plan that satisfies uniqueness constraints.
 * Returns null if it cannot find a valid plan after maxAttempts.
 */
export function buildScenePlan(opts: PlanOptions): ScenePlanItem[] {
  const minScenes = Math.max(5, opts.minScenes ?? 5);
  const maxScenes = Math.min(12, opts.maxScenes ?? 9);
  const targetCount = Math.min(maxScenes, Math.max(minScenes, STORY_FLOW.length - 1));

  const scenes: ScenePlanItem[] = [];
  let usedHashes = new Set<string>();
  let prevMotion: MotionType | null = null;
  let prevCrop: CropRegion | null = null;

  for (let i = 0; i < targetCount; i++) {
    const isHook = i === 0;
    const isCta = i === targetCount - 1;
    const category: SceneCategory = isCta
      ? 'cta'
      : STORY_FLOW[i % STORY_FLOW.length];

    // Pick motion not equal to previous
    const motionCandidates = ALL_MOTIONS.filter((m) => m !== prevMotion);
    const motion = motionCandidates[(i * 3 + 1) % motionCandidates.length];

    // Pick crop not equal to previous
    const cropCandidates = ALL_CROPS.filter((c) => c !== prevCrop);
    const crop = cropCandidates[(i * 5 + 2) % cropCandidates.length];

    const zoom = 1.0 + ((i * 0.13) % 0.6); // 1.0–1.6
    const imageIndex = opts.imageCount > 0 ? i % opts.imageCount : 0;

    const durationFrames = isHook
      ? opts.pacing.hook_duration_frames
      : isCta
        ? opts.pacing.cta_duration_frames
        : Math.round(
            opts.pacing.scene_min_frames +
              ((i * 17) % (opts.pacing.scene_max_frames - opts.pacing.scene_min_frames)),
          );

    const caption = isHook
      ? opts.hookText
      : isCta
        ? opts.ctaText
        : opts.bodyCaptions?.[i - 1];

    const base = { category, motion, crop, zoom, imageIndex, durationFrames, caption, isHook, isCta };
    const hash = hashScene(base);

    if (usedHashes.has(hash)) {
      // Mutate zoom slightly to break collision
      const mutated = { ...base, zoom: zoom + 0.07 };
      const h2 = hashScene(mutated);
      scenes.push({ ...mutated, index: i, hash: h2 });
      usedHashes.add(h2);
    } else {
      scenes.push({ ...base, index: i, hash });
      usedHashes.add(hash);
    }

    prevMotion = motion;
    prevCrop = crop;
  }

  return scenes;
}

/** Diversity score 0-100 for a plan based on unique motions/crops/categories. */
export function scoreDiversity(plan: ScenePlanItem[]): {
  scene_entropy: number;
  motion_diversity: number;
} {
  if (plan.length === 0) return { scene_entropy: 0, motion_diversity: 0 };
  const motions = new Set(plan.map((p) => p.motion));
  const crops = new Set(plan.map((p) => p.crop));
  const cats = new Set(plan.map((p) => p.category));
  const hashes = new Set(plan.map((p) => p.hash));

  const motion_diversity = Math.round((motions.size / Math.min(plan.length, ALL_MOTIONS.length)) * 100);
  const scene_entropy = Math.round(
    (((hashes.size / plan.length) * 0.5 +
      (crops.size / Math.min(plan.length, ALL_CROPS.length)) * 0.25 +
      (cats.size / plan.length) * 0.25)) *
      100,
  );
  return { scene_entropy, motion_diversity };
}

/**
 * V4 native short-form pacing validator. Returns scores + diagnostic flags.
 * Rules (defaults — engine can override from cinematic_ad_settings):
 *   - First cut must land within `hookChangeMaxFrames` (default 24 @ 30fps = 0.8s).
 *   - No scene > `staticHoldMaxFrames` (default 60 = 2s) unless tagged isPatternInterrupt.
 *   - At least one pattern_interrupt every `patternInterruptMaxFrames` (default 150 = 5s).
 *   - Min scene count `minSceneCount` (default 6).
 *   - All required roles present (default hook+problem+benefit+cta).
 */
export interface PacingValidationOpts {
  hookChangeMaxFrames?: number;        // default 24
  sceneMinFrames?: number;             // default 36
  sceneMaxFrames?: number;             // default 60
  staticHoldMaxFrames?: number;        // default 60
  patternInterruptMaxFrames?: number;  // default 150
  minSceneCount?: number;              // default 6
  requiredRoles?: Array<'hook' | 'problem' | 'benefit' | 'cta'>;
}

export interface PacingValidationResult {
  ok: boolean;
  scene_change_count: number;
  static_hold_max: number;
  pattern_interrupt_gap_max: number;
  engagement_pacing_score: number;     // 0-100
  missing_roles: string[];
  violations: string[];
}

export function validatePacing(plan: ScenePlanItem[], opts: PacingValidationOpts = {}): PacingValidationResult {
  const hookMax = opts.hookChangeMaxFrames ?? 24;
  const sceneMin = opts.sceneMinFrames ?? 36;
  const sceneMax = opts.sceneMaxFrames ?? 60;
  const staticMax = opts.staticHoldMaxFrames ?? 60;
  const piMax = opts.patternInterruptMaxFrames ?? 150;
  const minScenes = opts.minSceneCount ?? 6;
  const requiredRoles = opts.requiredRoles ?? ['hook', 'problem', 'benefit', 'cta'];

  const violations: string[] = [];
  const scene_change_count = plan.length;

  if (scene_change_count < minScenes) {
    violations.push(`scene_count<${minScenes}(${scene_change_count})`);
  }

  // Hook cut check
  const firstDur = plan[0]?.durationFrames ?? 9999;
  if (firstDur > hookMax) violations.push(`hook_change_late(${firstDur}>${hookMax})`);

  // Static hold + scene window
  let static_hold_max = 0;
  for (const s of plan) {
    const d = s.durationFrames ?? 0;
    if (d > static_hold_max) static_hold_max = d;
    if (!s.isPatternInterrupt && d > staticMax) violations.push(`static_hold(${d}>${staticMax})`);
    if (d < sceneMin && !s.isHook && !s.isPatternInterrupt) violations.push(`scene_too_short(${d}<${sceneMin})`);
    if (d > sceneMax && !s.isPatternInterrupt) violations.push(`scene_too_long(${d}>${sceneMax})`);
  }

  // Pattern interrupt gap
  let pattern_interrupt_gap_max = 0;
  let runningFrames = 0;
  let lastInterruptAt = 0;
  for (const s of plan) {
    runningFrames += s.durationFrames ?? 0;
    if (s.isPatternInterrupt) {
      const gap = runningFrames - lastInterruptAt;
      if (gap > pattern_interrupt_gap_max) pattern_interrupt_gap_max = gap;
      lastInterruptAt = runningFrames;
    }
  }
  const tailGap = runningFrames - lastInterruptAt;
  if (tailGap > pattern_interrupt_gap_max) pattern_interrupt_gap_max = tailGap;
  if (pattern_interrupt_gap_max > piMax) violations.push(`pattern_interrupt_gap(${pattern_interrupt_gap_max}>${piMax})`);

  // Role coverage
  const roles = new Set(plan.map((s) => s.role).filter(Boolean) as string[]);
  const missing_roles: string[] = [];
  for (const r of requiredRoles) if (!roles.has(r)) missing_roles.push(r);
  if (missing_roles.length) violations.push(`missing_roles:${missing_roles.join(",")}`);

  // Engagement pacing score (0-100)
  const sceneCountScore = Math.min(100, (scene_change_count / Math.max(minScenes, 6)) * 80);
  const hookScore = firstDur <= hookMax ? 100 : Math.max(0, 100 - (firstDur - hookMax) * 5);
  const staticScore = Math.max(0, 100 - Math.max(0, static_hold_max - staticMax) * 2);
  const piScore = Math.max(0, 100 - Math.max(0, pattern_interrupt_gap_max - piMax) * 0.7);
  const roleScore = ((requiredRoles.length - missing_roles.length) / requiredRoles.length) * 100;
  const engagement_pacing_score = Math.round(
    sceneCountScore * 0.2 + hookScore * 0.25 + staticScore * 0.2 + piScore * 0.15 + roleScore * 0.2,
  );

  return {
    ok: violations.length === 0,
    scene_change_count,
    static_hold_max,
    pattern_interrupt_gap_max,
    engagement_pacing_score,
    missing_roles,
    violations,
  };
}

/**
 * Smart asset expansion: when source images < min scenes, derive virtual
 * variants by mapping additional scenes to crop+zoom permutations of the
 * existing images. Returns the same image array (real expansion is done
 * by the scene's crop/zoom in the renderer).
 */
export function expandAssets<T>(images: T[], targetScenes: number): T[] {
  if (images.length >= targetScenes || images.length === 0) return images;
  const out: T[] = [];
  for (let i = 0; i < targetScenes; i++) {
    out.push(images[i % images.length]);
  }
  return out;
}