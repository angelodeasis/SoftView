/**
 * The visual flash analyzer: a per-frame relative-luminance series in, candidate
 * {@link RawEvent}s out.
 *
 * Three detectors over the 0..1 luminance series:
 *  - `flashing`        — repeated opposing luminance transitions (or, on sparse/aliased
 *                        input, a high-variance window with many mean-crossings);
 *  - `luminance-spike` — a single large brightness jump that is not part of a flashing
 *                        run or a scene change;
 *  - `scene-change`    — a brightness shift that persists (a cut) — low severity, mainly
 *                        so a cut is not mistaken for a spike.
 *
 * Thresholds are deliberately more sensitive than the WCAG / Harding guideline and are
 * all tunable. Heuristic — it over- and under-flags. Output is unsorted candidate spans;
 * `normalizeEvents` clamps, merges and orders them.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

import type { AnalyzerId, RawEvent } from '../events/model';
import {
  maxInRange,
  meanInRange,
  minInRange,
  valueAtOrBefore,
  type TimeSeries,
} from '../signal/timeSeries';

/** Matches the `'visual-flash'` member of `AnalyzerId`. */
export const VISUAL_FLASH_ANALYZER_ID: AnalyzerId = 'visual-flash';
/** Bump when a change would move existing results; stored on the `AnalyzerRun`. */
export const VISUAL_FLASH_VERSION = '1';

export interface AnalyzeVisualFlashOptions {
  /** Sliding window for the flash-rate / variance measurement. */
  readonly flashWindowSec?: number;
  /** Minimum |Δ| between consecutive samples to count as a transition edge. */
  readonly flashDeltaRel?: number;
  /** Opposing-transition-pairs per second that flags flashing. */
  readonly flashPairsPerSec?: number;
  /** Variance arm: window range (max−min) that flags flashing. */
  readonly flashRangeRel?: number;
  /** Variance arm: how many times the signal must cross the window mean. */
  readonly flashMinZeroCross?: number;
  /** Flashing runs shorter than this (before padding) are dropped. */
  readonly flashMinRunSec?: number;
  /** A single jump of at least this, over `spikeWindowSec`, flags a luminance spike. */
  readonly spikeDeltaRel?: number;
  readonly spikeWindowSec?: number;
  /** Before/after mean difference that marks a scene change. */
  readonly sceneDeltaRel?: number;
  /** Averaging window on each side of a candidate scene boundary. */
  readonly sceneCompareSec?: number;
  /** The shifted level must persist at least this long to count as a scene change. */
  readonly sceneHoldSec?: number;
}

export const DEFAULT_FLASH_PARAMS: Required<AnalyzeVisualFlashOptions> = {
  flashWindowSec: 1,
  flashDeltaRel: 0.08,
  flashPairsPerSec: 2.5,
  flashRangeRel: 0.2,
  flashMinZeroCross: 4,
  flashMinRunSec: 0.3,
  spikeDeltaRel: 0.22,
  spikeWindowSec: 0.25,
  sceneDeltaRel: 0.2,
  sceneCompareSec: 0.5,
  sceneHoldSec: 1,
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** 0 at or below `lo`, 1 at or above `hi`, linear between. */
const ramp = (value: number, lo: number, hi: number): number => clamp01((value - lo) / (hi - lo));

interface FlashRun {
  readonly startTime: number;
  readonly endTime: number;
}

function flashingEvents(lum: TimeSeries, p: Required<AnalyzeVisualFlashOptions>): RawEvent[] {
  const { times, values } = lum;
  const n = times.length;
  if (n < 2) return [];

  const flagged = new Array<boolean>(n).fill(false);
  const byTransition = new Array<boolean>(n).fill(false);
  const pairsPerSec = new Float64Array(n);
  const range = new Float64Array(n);

  let ws = 0;
  for (let i = 0; i < n; i++) {
    while (times[i] - times[ws] > p.flashWindowSec && ws < i) ws++;

    // Count direction reversals among significant cumulative moves — a smooth ramp is
    // one move, oscillation is many. (Counting every step would flag a single spike.)
    let reversals = 0;
    let dir = 0;
    let ref = values[ws];
    let mn = values[ws];
    let mx = values[ws];
    let sum = values[ws];
    for (let k = ws + 1; k <= i; k++) {
      const move = values[k] - ref;
      if (Math.abs(move) >= p.flashDeltaRel) {
        const nd = move > 0 ? 1 : -1;
        if (dir !== 0 && nd !== dir) reversals++;
        dir = nd;
        ref = values[k];
      }
      if (values[k] < mn) mn = values[k];
      if (values[k] > mx) mx = values[k];
      sum += values[k];
    }
    const spanSec = Math.max(times[i] - times[ws], 1e-3);
    const mean = sum / (i - ws + 1);
    let zeroCross = 0;
    for (let k = ws + 1; k <= i; k++) {
      if ((values[k - 1] - mean) * (values[k] - mean) < 0) zeroCross++;
    }

    const pps = reversals / 2 / spanSec;
    const rng = mx - mn;
    const transitionArm = pps >= p.flashPairsPerSec;
    const varianceArm = rng >= p.flashRangeRel && zeroCross >= p.flashMinZeroCross;

    flagged[i] = transitionArm || varianceArm;
    byTransition[i] = transitionArm;
    pairsPerSec[i] = pps;
    range[i] = rng;
  }

  const events: RawEvent[] = [];
  let i = 0;
  while (i < n) {
    if (!flagged[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && flagged[j + 1]) j++;

    if (times[j] - times[i] >= p.flashMinRunSec) {
      let peakTime = times[i];
      let maxPps = 0;
      let maxRange = 0;
      let anyTransition = false;
      for (let k = i; k <= j; k++) {
        if (pairsPerSec[k] > maxPps) {
          maxPps = pairsPerSec[k];
          peakTime = times[k];
        }
        if (range[k] > maxRange) maxRange = range[k];
        if (byTransition[k]) anyTransition = true;
      }
      events.push({
        channel: 'visual',
        kind: 'flashing',
        startTime: Math.max(0, times[i] - p.flashWindowSec),
        endTime: Math.max(times[i], times[j] - p.flashWindowSec / 2),
        peakTime,
        severityScore: clamp01(
          0.5 * ramp(maxPps, p.flashPairsPerSec, p.flashPairsPerSec + 6) +
            0.5 * ramp(maxRange, p.flashRangeRel, 0.8),
        ),
        confidence: anyTransition ? 0.7 : 0.45,
        metrics: { flashesPerSecond: maxPps, maxDeltaRel: maxRange },
      });
    }
    i = j + 1;
  }
  return events;
}

interface SceneBoundary {
  readonly time: number;
  readonly before: number;
  readonly after: number;
}

function sceneChangeEvents(
  lum: TimeSeries,
  p: Required<AnalyzeVisualFlashOptions>,
): { events: RawEvent[]; boundaries: SceneBoundary[] } {
  const { times } = lum;
  const raw: SceneBoundary[] = [];

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const before = meanInRange(lum, t - p.sceneCompareSec, t);
    const after = meanInRange(lum, t, t + p.sceneCompareSec);
    const held = meanInRange(lum, t + p.sceneCompareSec, t + p.sceneCompareSec + p.sceneHoldSec);
    if (before === undefined || after === undefined || held === undefined) continue;

    // The "before" window must itself be flat — i.e. reflect a settled pre-boundary
    // level, not the tail of a recent spike/flash bleeding into it. Without this, the
    // trailing edge of a brief flash looks exactly like a persistent cut: "before" gets
    // pulled toward the flash, and "after"/"held" both settle back at the *original*
    // (pre-flash) level, which reads as a lasting shift.
    const beforeMax = maxInRange(lum, t - p.sceneCompareSec, t);
    const beforeMin = minInRange(lum, t - p.sceneCompareSec, t);
    const beforeIsFlat =
      beforeMax !== undefined && beforeMin !== undefined && beforeMax - beforeMin < p.sceneDeltaRel;

    if (
      beforeIsFlat &&
      Math.abs(after - before) >= p.sceneDeltaRel &&
      Math.abs(held - before) >= 0.7 * p.sceneDeltaRel
    ) {
      raw.push({ time: t, before, after });
    }
  }

  // Coalesce a cluster of firing samples around one cut into a single boundary.
  const boundaries: SceneBoundary[] = [];
  for (const b of raw) {
    const last = boundaries[boundaries.length - 1];
    if (last && b.time - last.time <= p.sceneCompareSec) {
      if (Math.abs(b.after - b.before) > Math.abs(last.after - last.before)) {
        boundaries[boundaries.length - 1] = b;
      }
    } else {
      boundaries.push(b);
    }
  }

  const events = boundaries.map((b): RawEvent => {
    const delta = Math.abs(b.after - b.before);
    return {
      channel: 'visual',
      kind: 'scene-change',
      startTime: Math.max(0, b.time - 0.1),
      endTime: b.time + 0.1,
      peakTime: b.time,
      severityScore: clamp01(0.1 + 0.2 * ramp(delta, p.sceneDeltaRel, 0.7)),
      confidence: 0.6,
      metrics: { fromLevel: b.before, toLevel: b.after },
    };
  });
  return { events, boundaries };
}

function luminanceSpikeEvents(
  lum: TimeSeries,
  p: Required<AnalyzeVisualFlashOptions>,
  flashes: readonly FlashRun[],
  sceneBoundaries: readonly SceneBoundary[],
): RawEvent[] {
  const { times, values } = lum;
  const n = times.length;

  const inFlash = (t: number) => flashes.some((f) => t >= f.startTime && t <= f.endTime);
  const nearScene = (t: number) =>
    sceneBoundaries.some((b) => Math.abs(b.time - t) <= p.sceneCompareSec);

  interface Flag {
    readonly delta: number;
    readonly prev: number;
  }
  const flags = new Array<Flag | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    const t = times[i];
    const prev = valueAtOrBefore(lum, t - p.spikeWindowSec);
    if (prev === undefined) continue;
    const delta = values[i] - prev;
    if (Math.abs(delta) < p.spikeDeltaRel) continue;
    if (inFlash(t) || nearScene(t)) continue;
    flags[i] = { delta, prev };
  }

  const events: RawEvent[] = [];
  let i = 0;
  while (i < n) {
    const first = flags[i];
    if (!first) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && flags[j + 1]) j++;

    let peakTime = times[i];
    let peak: Flag = first;
    for (let k = i + 1; k <= j; k++) {
      const f = flags[k];
      if (f && Math.abs(f.delta) > Math.abs(peak.delta)) {
        peak = f;
        peakTime = times[k];
      }
    }
    events.push({
      channel: 'visual',
      kind: 'luminance-spike',
      startTime: Math.max(0, times[i] - 0.05),
      endTime: times[j] + 0.05,
      peakTime,
      severityScore: ramp(Math.abs(peak.delta), p.spikeDeltaRel, 0.7),
      confidence: 0.6,
      metrics: {
        deltaLuminance: peak.delta,
        fromLevel: peak.prev,
        toLevel: peak.prev + peak.delta,
      },
    });
    i = j + 1;
  }
  return events;
}

/** Run the three flash detectors over a relative-luminance series. */
export function analyzeVisualFlash(
  input: { readonly luminance: TimeSeries; readonly redness?: TimeSeries },
  opts: AnalyzeVisualFlashOptions = {},
): readonly RawEvent[] {
  const p: Required<AnalyzeVisualFlashOptions> = { ...DEFAULT_FLASH_PARAMS, ...opts };
  const lum = input.luminance;

  const flashes = flashingEvents(lum, p);
  const flashRuns: FlashRun[] = flashes.map((e) => ({
    startTime: e.startTime,
    endTime: e.endTime,
  }));
  const scene = sceneChangeEvents(lum, p);
  const spikes = luminanceSpikeEvents(lum, p, flashRuns, scene.boundaries);

  return [...flashes, ...scene.events, ...spikes];
}
