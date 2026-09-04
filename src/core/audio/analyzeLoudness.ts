/**
 * The audio loudness analyzer: a loudness series in, candidate {@link RawEvent}s out.
 *
 * Three detectors over the short-term RMS / peak series from {@link computeLoudness}:
 *  - `loudness-spike`     — a sudden rise that also reaches a genuinely loud level;
 *  - `sustained-loudness` — RMS held above a threshold for several seconds;
 *  - `clipping`           — peak pinned near full scale (already-distorted audio).
 *
 * Heuristic by design — it over- and under-flags. Output is unsorted candidate spans;
 * `normalizeEvents` clamps, merges and orders them.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

import type { AnalyzerId, RawEvent } from '../events/model';
import { maxInRange, meanInRange, type TimeSeries } from '../signal/timeSeries';
import { computeLoudness, type ComputeLoudnessOptions } from './loudness';

/** Matches the `'audio-loudness'` member of `AnalyzerId`. */
export const AUDIO_LOUDNESS_ANALYZER_ID: AnalyzerId = 'audio-loudness';
/** Bump when a change would move existing results; stored on the `AnalyzerRun`. */
export const AUDIO_LOUDNESS_VERSION = '1';

export interface AnalyzeLoudnessOptions {
  /** A rise of at least this many dB (vs the pre-transient baseline) marks a spike. */
  readonly spikeRiseDb?: number;
  /** Length of the pre-transient reference window. */
  readonly spikeBaselineSec?: number;
  /** The rise is measured skipping this much just before "now" (the attack ramp). */
  readonly spikeAttackSec?: number;
  /** A spike must also reach at least this absolute level. */
  readonly spikeFloorDb?: number;
  /** RMS at or above this counts toward a sustained-loudness run. */
  readonly sustainedDb?: number;
  /** A run must last at least this long to be reported. */
  readonly sustainedMinSec?: number;
  /** Dips shorter than this don't end a sustained-loudness run. */
  readonly sustainedGapSec?: number;
  /** Peak at or above this (dBFS) counts as clipping. */
  readonly clipDbfs?: number;
  /** Clipping must persist at least this long to be reported. */
  readonly clipMinSec?: number;
}

export const DEFAULT_LOUDNESS_PARAMS: Required<AnalyzeLoudnessOptions> = {
  // Lowered from 10 after a real jump-scare clip's scream measured only a ~6 dB rise
  // over its own pre-scream baseline (a tense hush, not silence) despite being loud in
  // absolute terms — spikeFloorDb is what keeps this from flagging ordinary quiet-to-
  // moderate transitions.
  spikeRiseDb: 5,
  spikeBaselineSec: 1,
  spikeAttackSec: 0.3,
  spikeFloorDb: -20,
  sustainedDb: -14,
  sustainedMinSec: 4,
  sustainedGapSec: 0.5,
  clipDbfs: -0.5,
  clipMinSec: 0.2,
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** 0 at or below `lo`, 1 at or above `hi`, linear between. */
const ramp = (value: number, lo: number, hi: number): number => clamp01((value - lo) / (hi - lo));

function spikeEvents(rms: TimeSeries, p: Required<AnalyzeLoudnessOptions>): RawEvent[] {
  const { times, values } = rms;
  const events: RawEvent[] = [];

  let groupStart = -1;
  let groupBaseline = 0;
  let groupEnd = -1;

  const flush = () => {
    if (groupStart < 0) return;
    const peakDb = maxInRange(rms, times[groupStart], times[groupEnd]) ?? values[groupEnd];
    let peakTime = times[groupStart];
    let best = -Infinity;
    for (let i = groupStart; i <= groupEnd; i++) {
      if (values[i] > best) {
        best = values[i];
        peakTime = times[i];
      }
    }
    const riseDb = peakDb - groupBaseline;
    events.push({
      channel: 'audio',
      kind: 'loudness-spike',
      startTime: Math.max(0, times[groupStart] - 0.05),
      endTime: times[groupEnd] + 0.1,
      peakTime,
      // Driven almost entirely by *how loud it actually is* (peakDb), not how much it
      // rose: `riseDb`'s job is detection — separating a spike from steady background
      // level, alongside spikeFloorDb — but a loud sound that follows a quieter-but-not-
      // silent moment (a tense hush, a lull in music) is every bit as startling as one
      // that rises from true silence, even though its measured rise is much smaller. So
      // once something clears both detection gates, severity mostly stops caring which
      // gate it cleared through. The peak arm reaches full credit only 4 dB above
      // spikeFloorDb (real short-term RMS rarely gets much louder than that without
      // clipping) — tightened from an initial guess of -11 dBFS once the real browser
      // decode of a since-tested clip measured a jump-scare scream at -15.74 dBFS, a few
      // dB quieter than an offline ffmpeg decode of the same file had suggested.
      severityScore: clamp01(
        0.15 * ramp(riseDb, p.spikeRiseDb, p.spikeRiseDb + 24) +
          0.85 * ramp(peakDb, p.spikeFloorDb, p.spikeFloorDb + 4),
      ),
      confidence: clamp01(0.4 + 0.4 * ramp(riseDb, p.spikeRiseDb, p.spikeRiseDb + 15)),
      metrics: { riseDb, peakDb, baselineDb: groupBaseline },
    });
    groupStart = -1;
    groupEnd = -1;
  };

  for (let i = 0; i < times.length; i++) {
    const baseline = meanInRange(rms, times[i] - p.spikeBaselineSec, times[i] - p.spikeAttackSec);
    const flagged =
      baseline !== undefined &&
      values[i] - baseline >= p.spikeRiseDb &&
      values[i] >= p.spikeFloorDb;

    if (flagged) {
      if (groupStart < 0) {
        groupStart = i;
        groupBaseline = baseline;
      }
      groupEnd = i;
    } else if (groupStart >= 0) {
      flush();
    }
  }
  flush();

  return events;
}

function sustainedEvents(rms: TimeSeries, p: Required<AnalyzeLoudnessOptions>): RawEvent[] {
  const { times, values } = rms;
  const events: RawEvent[] = [];

  let runStart = -1;
  let lastAbove = 0;
  let sum = 0;
  let count = 0;
  let peak = -Infinity;
  let peakTime = 0;

  const flush = () => {
    if (runStart < 0) return;
    const durationSec = lastAbove - times[runStart];
    if (durationSec >= p.sustainedMinSec) {
      events.push({
        channel: 'audio',
        kind: 'sustained-loudness',
        startTime: times[runStart],
        endTime: lastAbove,
        peakTime,
        severityScore: ramp(peak - p.sustainedDb, 0, 12),
        confidence: clamp01(
          0.5 + 0.5 * ramp(durationSec - p.sustainedMinSec, 0, p.sustainedMinSec),
        ),
        metrics: { peakDb: peak, meanDb: sum / count, durationSec },
      });
    }
    runStart = -1;
  };

  for (let i = 0; i < times.length; i++) {
    if (values[i] >= p.sustainedDb) {
      if (runStart < 0) {
        runStart = i;
        sum = 0;
        count = 0;
        peak = -Infinity;
      }
      lastAbove = times[i];
      sum += values[i];
      count++;
      if (values[i] > peak) {
        peak = values[i];
        peakTime = times[i];
      }
    } else if (runStart >= 0 && times[i] - lastAbove > p.sustainedGapSec) {
      flush();
    }
  }
  flush();

  return events;
}

function clippingEvents(peak: TimeSeries, p: Required<AnalyzeLoudnessOptions>): RawEvent[] {
  const { times, values } = peak;
  const events: RawEvent[] = [];

  let runStart = -1;
  let runMax = -Infinity;
  let runMaxTime = 0;

  const flush = (endIdx: number) => {
    if (runStart < 0) return;
    const durationSec = times[endIdx] - times[runStart];
    if (durationSec >= p.clipMinSec) {
      events.push({
        channel: 'audio',
        kind: 'clipping',
        startTime: times[runStart],
        endTime: times[endIdx],
        peakTime: runMaxTime,
        severityScore: clamp01(0.5 + 0.5 * ramp(durationSec, p.clipMinSec, 3)),
        confidence: 0.9,
        metrics: { maxPeakDb: runMax, durationSec },
      });
    }
    runStart = -1;
    runMax = -Infinity;
  };

  for (let i = 0; i < times.length; i++) {
    if (values[i] >= p.clipDbfs) {
      if (runStart < 0) runStart = i;
      if (values[i] > runMax) {
        runMax = values[i];
        runMaxTime = times[i];
      }
    } else if (runStart >= 0) {
      flush(i - 1);
    }
  }
  flush(times.length - 1);

  return events;
}

/** Run the three loudness detectors over an already-computed series. */
export function analyzeLoudness(
  loudness: { readonly rms: TimeSeries; readonly peak?: TimeSeries },
  opts: AnalyzeLoudnessOptions = {},
): readonly RawEvent[] {
  const p: Required<AnalyzeLoudnessOptions> = { ...DEFAULT_LOUDNESS_PARAMS, ...opts };
  return [
    ...spikeEvents(loudness.rms, p),
    ...sustainedEvents(loudness.rms, p),
    ...(loudness.peak ? clippingEvents(loudness.peak, p) : []),
  ];
}

/** {@link computeLoudness} then {@link analyzeLoudness}. */
export function analyzeAudioLoudness(
  pcm: Float32Array,
  sampleRate: number,
  opts: AnalyzeLoudnessOptions & ComputeLoudnessOptions = {},
): readonly RawEvent[] {
  return analyzeLoudness(computeLoudness(pcm, sampleRate, opts), opts);
}
