/**
 * Scoring a detector against a known answer key.
 *
 * The signal generators in `./generators` hand back a `groundTruth` list alongside each
 * synthetic series. Phases 3 and 5 run their analyzer on the series and call
 * {@link scoreDetections} to assert recall / precision — a repeatable number instead of
 * eyeballing a chart.
 *
 * Pure. Test-support code: imported only by tests, tree-shaken out of the build.
 */

import type { SensoryChannel, SensoryEvent, SensoryEventKind } from '../events/model';

export interface GroundTruthEvent {
  readonly channel: SensoryChannel;
  readonly kind: SensoryEventKind;
  readonly startTime: number;
  readonly endTime: number;
}

export interface DetectionMatch {
  readonly expected: GroundTruthEvent;
  readonly actual: SensoryEvent;
}

export interface DetectionScore {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /** `truePositives / detections`; `0` when there were no detections. */
  readonly precision: number;
  /** `truePositives / expected`; `1` when nothing was expected. */
  readonly recall: number;
  readonly matches: readonly DetectionMatch[];
  readonly unmatchedExpected: readonly GroundTruthEvent[];
  readonly unmatchedActual: readonly SensoryEvent[];
}

export interface ScoreOptions {
  /** How far apart two spans may be and still count as the same event. Default `0.5`. */
  readonly toleranceSec?: number;
}

const DEFAULT_TOLERANCE_SEC = 0.5;

/**
 * How well a detected event lines up with an expected one: overlap in seconds when the
 * spans overlap, a small negative number down to `-tolerance` when they are merely
 * close, or `-Infinity` when they are further apart than the tolerance allows.
 */
function matchQuality(gt: GroundTruthEvent, ev: SensoryEvent, toleranceSec: number): number {
  const overlap = Math.min(gt.endTime, ev.endTime) - Math.max(gt.startTime, ev.startTime);
  if (overlap >= 0) return overlap;
  const gap = Math.max(gt.startTime, ev.startTime) - Math.min(gt.endTime, ev.endTime);
  return gap <= toleranceSec ? -gap : Number.NEGATIVE_INFINITY;
}

/**
 * Match detected events to expected ones one-to-one (greedy, best overlap first) and
 * report the resulting precision / recall.
 */
export function scoreDetections(
  expected: readonly GroundTruthEvent[],
  actual: readonly SensoryEvent[],
  opts: ScoreOptions = {},
): DetectionScore {
  const toleranceSec = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;

  const candidates: { gi: number; ai: number; quality: number }[] = [];
  expected.forEach((gt, gi) => {
    actual.forEach((ev, ai) => {
      if (gt.channel !== ev.channel || gt.kind !== ev.kind) return;
      const quality = matchQuality(gt, ev, toleranceSec);
      if (quality > Number.NEGATIVE_INFINITY) candidates.push({ gi, ai, quality });
    });
  });
  candidates.sort((a, b) => b.quality - a.quality);

  const usedExpected = new Set<number>();
  const usedActual = new Set<number>();
  const matches: DetectionMatch[] = [];
  for (const c of candidates) {
    if (usedExpected.has(c.gi) || usedActual.has(c.ai)) continue;
    usedExpected.add(c.gi);
    usedActual.add(c.ai);
    matches.push({ expected: expected[c.gi], actual: actual[c.ai] });
  }

  const truePositives = matches.length;
  return {
    truePositives,
    falsePositives: actual.length - truePositives,
    falseNegatives: expected.length - truePositives,
    precision: actual.length === 0 ? 0 : truePositives / actual.length,
    recall: expected.length === 0 ? 1 : truePositives / expected.length,
    matches,
    unmatchedExpected: expected.filter((_, i) => !usedExpected.has(i)),
    unmatchedActual: actual.filter((_, i) => !usedActual.has(i)),
  };
}
