/**
 * Turns decoded mono PCM into a short-term loudness series the loudness analyzer reads.
 *
 * Plain RMS in dBFS (0 dBFS = a full-scale sample of magnitude 1). No K-weighting /
 * LUFS yet — spike R1 deliberately left headroom for that. Alongside RMS it reports a
 * per-hop peak (max |sample|) so clipping can be spotted for free.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib). PCM arrives as a plain
 * `Float32Array`; the browser decode that produces it lives in `src/adapters/`.
 */

import { makeTimeSeries, type TimeSeries } from '../signal/timeSeries';

export interface LoudnessSeries {
  /** Short-term RMS level per hop, dBFS, floored at {@link DBFS_FLOOR}. */
  readonly rms: TimeSeries;
  /** Max |sample| per hop over the same window, dBFS, floored at {@link DBFS_FLOOR}. */
  readonly peak: TimeSeries;
}

export interface ComputeLoudnessOptions {
  /** Spacing between samples in the output series. Default `0.02` (20 ms). */
  readonly hopSec?: number;
  /** Short-term integration window. Default `0.4` (400 ms, ~"momentary" loudness). */
  readonly windowSec?: number;
}

/** Level reported for digital silence, and the clamp applied to every dBFS value. */
export const DBFS_FLOOR = -120;

const DEFAULT_HOP_SEC = 0.02;
const DEFAULT_WINDOW_SEC = 0.4;

function toDbfs(ratio: number, factor: 10 | 20): number {
  if (!(ratio > 0)) return DBFS_FLOOR;
  return Math.max(DBFS_FLOOR, factor * Math.log10(ratio));
}

/**
 * Block-process `pcm` into a {@link LoudnessSeries}.
 *
 * Two linear passes: contiguous `hopSec` blocks get a mean-square and a max-abs, then
 * each output sample aggregates the trailing `windowSec` of blocks. A sample's time is
 * the centre of its block; its value describes loudness over roughly `[t − windowSec, t]`.
 */
export function computeLoudness(
  pcm: Float32Array,
  sampleRate: number,
  opts: ComputeLoudnessOptions = {},
): LoudnessSeries {
  if (!(sampleRate > 0)) {
    throw new RangeError(`computeLoudness: sampleRate must be positive, got ${sampleRate}`);
  }
  const hopSec = opts.hopSec ?? DEFAULT_HOP_SEC;
  const windowSec = opts.windowSec ?? DEFAULT_WINDOW_SEC;
  const hopSamples = Math.max(1, Math.round(hopSec * sampleRate));
  const blockCount = Math.max(1, Math.ceil(pcm.length / hopSamples));
  const blocksPerWindow = Math.max(1, Math.round(windowSec / hopSec));

  // Pass 1: per-block mean-square and peak.
  const blockMeanSquare = new Float64Array(blockCount);
  const blockPeak = new Float32Array(blockCount);
  for (let b = 0; b < blockCount; b++) {
    const start = b * hopSamples;
    const end = Math.min(start + hopSamples, pcm.length);
    let sumSquares = 0;
    let peak = 0;
    for (let i = start; i < end; i++) {
      const s = pcm[i];
      sumSquares += s * s;
      const mag = s < 0 ? -s : s;
      if (mag > peak) peak = mag;
    }
    blockMeanSquare[b] = end > start ? sumSquares / (end - start) : 0;
    blockPeak[b] = peak;
  }

  // Pass 2: trailing-window aggregate per block.
  const times = new Float64Array(blockCount);
  const rms = new Float32Array(blockCount);
  const peak = new Float32Array(blockCount);
  let windowSumSquares = 0;
  for (let b = 0; b < blockCount; b++) {
    windowSumSquares += blockMeanSquare[b];
    const from = b - blocksPerWindow;
    if (from >= 0) windowSumSquares -= blockMeanSquare[from];
    const span = Math.min(b + 1, blocksPerWindow);

    let windowPeak = 0;
    for (let k = Math.max(0, b - blocksPerWindow + 1); k <= b; k++) {
      if (blockPeak[k] > windowPeak) windowPeak = blockPeak[k];
    }

    times[b] = (b + 0.5) * hopSec;
    rms[b] = toDbfs(windowSumSquares / span, 10);
    peak[b] = toDbfs(windowPeak, 20);
  }

  return { rms: makeTimeSeries(times, rms), peak: makeTimeSeries(times, peak) };
}
