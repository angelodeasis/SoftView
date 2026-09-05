/**
 * Assisted Viewing's entire brain: given the analyzed events and the current playback
 * time, how much should volume, brightness, and colour be pulled down right now?
 *
 * Consumes events, never re-detects (per CLAUDE.md's architecture) — this is a pure
 * function of `(events, currentTime)`, recomputed fresh on every call. That's what makes
 * seeking (paused or while playing) "just work": there's no scheduled timeline to
 * invalidate, only "what does this instant look like".
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

import type { SensoryEvent, Severity } from '../events/model';

export interface MitigationOptions {
  /** Linear ramp in/out around each event's span. Default `1.5` s. */
  readonly fadeSec?: number;
  /** Volume multiplier per severity bucket during an audio event's hold region. */
  readonly audioTargets?: Readonly<Record<Severity, number>>;
  /** Brightness multiplier per severity bucket during a visual event's hold region. */
  readonly visualTargets?: Readonly<Record<Severity, number>>;
  /**
   * Colour-saturation multiplier per severity bucket during a visual event's hold
   * region — `0` is full grayscale. Desaturating alongside dimming targets flash
   * triggers more broadly than luminance alone (WCAG/Harding also single out saturated
   * red specifically), without needing a dedicated red-channel signal.
   */
  readonly saturationTargets?: Readonly<Record<Severity, number>>;
}

export interface MitigationLevel {
  /** 0..1 multiplier for the media element's `volume`. */
  readonly volume: number;
  /** 0..1 multiplier for a CSS `filter: brightness()`. */
  readonly brightness: number;
  /** 0..1 multiplier for a CSS `filter: saturate()`; `0` is full grayscale. */
  readonly saturation: number;
  /** The audio event currently driving `volume`, if any. */
  readonly activeAudioEvent?: SensoryEvent;
  /** The visual event currently driving `brightness` and `saturation`, if any. */
  readonly activeVisualEvent?: SensoryEvent;
}

const DEFAULT_FADE_SEC = 1.5;

export const DEFAULT_AUDIO_TARGETS: Readonly<Record<Severity, number>> = {
  low: 0.2,
  moderate: 0.1,
  high: 0.03,
};

export const DEFAULT_VISUAL_TARGETS: Readonly<Record<Severity, number>> = {
  low: 0.75,
  moderate: 0.55,
  high: 0.35,
};

export const DEFAULT_SATURATION_TARGETS: Readonly<Record<Severity, number>> = {
  low: 0.6,
  moderate: 0.3,
  high: 0,
};

/** `scene-change` is a low-severity context marker, not something to dim for (Phase 5). */
const VISUAL_EXCLUDED_KIND = 'scene-change';

/**
 * 0 outside the padded window; 1 across `[startTime, endTime]`; ramps linearly through
 * the `fadeSec` lead-in/lead-out either side.
 */
function factorAt(t: number, startTime: number, endTime: number, fadeSec: number): number {
  if (t >= startTime && t <= endTime) return 1;
  if (fadeSec <= 0) return 0;
  if (t > startTime - fadeSec && t < startTime) return (t - (startTime - fadeSec)) / fadeSec;
  if (t > endTime && t < endTime + fadeSec) return (endTime + fadeSec - t) / fadeSec;
  return 0;
}

/** `1 − factor·(1 − target)`: `1` (no effect) at factor `0`, `target` at factor `1`. */
function applyFactor(factor: number, target: number): number {
  return 1 - factor * (1 - target);
}

function channelMultiplier(
  events: readonly SensoryEvent[],
  currentTime: number,
  fadeSec: number,
  targets: Readonly<Record<Severity, number>>,
  channel: SensoryEvent['channel'],
  excludeKind?: SensoryEvent['kind'],
): { multiplier: number; factor: number; active?: SensoryEvent } {
  let multiplier = 1;
  let factor = 0;
  let active: SensoryEvent | undefined;
  for (const e of events) {
    if (e.channel !== channel || e.kind === excludeKind) continue;
    const f = factorAt(currentTime, e.startTime, e.endTime, fadeSec);
    if (f <= 0) continue;
    const m = applyFactor(f, targets[e.severity]);
    if (m < multiplier) {
      multiplier = m;
      factor = f;
      active = e;
    }
  }
  return { multiplier, factor, active };
}

/** How much to soften volume, brightness, and colour right now, and why. */
export function mitigationAt(
  events: readonly SensoryEvent[],
  currentTime: number,
  opts: MitigationOptions = {},
): MitigationLevel {
  const fadeSec = opts.fadeSec ?? DEFAULT_FADE_SEC;
  const audioTargets = opts.audioTargets ?? DEFAULT_AUDIO_TARGETS;
  const visualTargets = opts.visualTargets ?? DEFAULT_VISUAL_TARGETS;
  const saturationTargets = opts.saturationTargets ?? DEFAULT_SATURATION_TARGETS;

  const audio = channelMultiplier(events, currentTime, fadeSec, audioTargets, 'audio');
  const visual = channelMultiplier(
    events,
    currentTime,
    fadeSec,
    visualTargets,
    'visual',
    VISUAL_EXCLUDED_KIND,
  );
  // Saturation follows whichever event brightness picked, rather than being re-selected
  // independently — the two always move together, driven by one "what's happening
  // visually right now" decision.
  const saturation = visual.active
    ? applyFactor(visual.factor, saturationTargets[visual.active.severity])
    : 1;

  return {
    volume: audio.multiplier,
    brightness: visual.multiplier,
    saturation,
    activeAudioEvent: audio.active,
    activeVisualEvent: visual.active,
  };
}
