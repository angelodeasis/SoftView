/**
 * Turns the raw candidate events an analyzer emits into the clean, merged, stably
 * identified {@link SensoryEvent} list the UI and Assisted Viewing consume.
 *
 * Analyzers over-flag on purpose (the visual coarse pass especially). This is the one
 * place that clamps them to the media timeline, drops empty spans, and collapses
 * overlapping detections of the same kind into a single event.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

import type { RawEvent, SensoryEvent } from './model';
import { severityFromScore } from './model';

export interface NormalizeOptions {
  /** Media duration in seconds; event times are clamped to `[0, durationSec]`. */
  readonly durationSec: number;
  /**
   * Two events with the same `channel` and `kind` separated by a gap no larger than
   * this (seconds) are merged into one. Default `1`.
   */
  readonly mergeGapSec?: number;
}

const DEFAULT_MERGE_GAP_SEC = 1;

/** Clamp to `[lo, hi]`, treating `NaN` as `lo`. */
function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Combine independent confidences as a probabilistic OR: `1 − Π(1 − cᵢ)`. */
function combineConfidence(events: readonly RawEvent[]): number {
  let miss = 1;
  for (const e of events) miss *= 1 - clamp(e.confidence, 0, 1);
  return clamp(1 - miss, 0, 1);
}

function finalizeEvent(contributors: readonly RawEvent[]): SensoryEvent {
  const { channel, kind } = contributors[0];
  let startTime = Infinity;
  let endTime = -Infinity;
  let severityScore = 0;
  let dominant = contributors[0];
  for (const c of contributors) {
    if (c.startTime < startTime) startTime = c.startTime;
    if (c.endTime > endTime) endTime = c.endTime;
    if (c.severityScore > severityScore) severityScore = c.severityScore;
    if (c.severityScore > dominant.severityScore) dominant = c;
  }

  // Shallow-merge metrics; the highest-severity contributor wins any key collision.
  const metrics: Record<string, number> = {};
  for (const c of contributors) Object.assign(metrics, c.metrics);
  Object.assign(metrics, dominant.metrics);

  return {
    id: `${channel}:${kind}:${Math.round(startTime * 1000)}`,
    channel,
    kind,
    startTime,
    endTime,
    peakTime: dominant.peakTime,
    severityScore,
    severity: severityFromScore(severityScore),
    confidence: combineConfidence(contributors),
    metrics,
  };
}

/**
 * Clamp, drop-empty, merge overlapping same-kind events, and assign deterministic ids.
 * Output is sorted by `startTime`, then `channel`, then `kind`.
 */
export function normalizeEvents(
  raw: readonly RawEvent[],
  opts: NormalizeOptions,
): readonly SensoryEvent[] {
  const duration =
    Number.isFinite(opts.durationSec) && opts.durationSec > 0 ? opts.durationSec : Infinity;
  const mergeGap = Math.max(0, opts.mergeGapSec ?? DEFAULT_MERGE_GAP_SEC);

  // Clamp to the timeline and drop anything with no positive duration left.
  const groups = new Map<string, RawEvent[]>();
  for (const e of raw) {
    const startTime = clamp(e.startTime, 0, duration);
    const endTime = clamp(e.endTime, 0, duration);
    if (endTime <= startTime) continue;
    const cleaned: RawEvent = {
      ...e,
      startTime,
      endTime,
      peakTime: e.peakTime != null ? clamp(e.peakTime, startTime, endTime) : undefined,
      severityScore: clamp(e.severityScore, 0, 1),
      confidence: clamp(e.confidence, 0, 1),
    };
    const key = `${e.channel}:${e.kind}`;
    const group = groups.get(key);
    if (group) group.push(cleaned);
    else groups.set(key, [cleaned]);
  }

  // Merge within each (channel, kind) group; a different channel sorting between two
  // mergeable events by start time is why grouping comes before the linear merge.
  const merged: SensoryEvent[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.startTime - b.startTime);
    let contributors: RawEvent[] = [group[0]];
    let runningEnd = group[0].endTime;
    for (let i = 1; i < group.length; i++) {
      const next = group[i];
      if (next.startTime - runningEnd <= mergeGap) {
        contributors.push(next);
        if (next.endTime > runningEnd) runningEnd = next.endTime;
      } else {
        merged.push(finalizeEvent(contributors));
        contributors = [next];
        runningEnd = next.endTime;
      }
    }
    merged.push(finalizeEvent(contributors));
  }

  merged.sort(
    (a, b) =>
      a.startTime - b.startTime ||
      a.channel.localeCompare(b.channel) ||
      a.kind.localeCompare(b.kind),
  );
  return merged;
}
