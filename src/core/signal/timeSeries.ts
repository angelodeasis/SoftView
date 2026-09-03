/**
 * The timestamped sample stream every analyzer consumes.
 *
 * Columnar on purpose: a feature-length file is hundreds of thousands of samples
 * (video ~30 Hz, audio loudness hops ~50 Hz), and per-sample objects would be needless
 * GC pressure. Two parallel typed arrays instead.
 *
 * Analyzers must NOT assume even spacing — `times` only promises to be non-decreasing.
 * Adapters legitimately produce irregular gaps (dropped video frames, variable hops).
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

export interface TimeSeries {
  /** Seconds on the media timeline, non-decreasing. */
  readonly times: Float64Array;
  /** One scalar per sample. Its meaning (dBFS, 0..1 brightness, …) is the caller's. */
  readonly values: Float32Array;
}

/** A series with no samples. */
export const EMPTY_SERIES: TimeSeries = Object.freeze({
  times: new Float64Array(0),
  values: new Float32Array(0),
});

/**
 * Build a {@link TimeSeries}, rejecting mismatched lengths or out-of-order times. The
 * arrays are taken as-is (not copied) — the caller must not mutate them afterwards.
 */
export function makeTimeSeries(times: Float64Array, values: Float32Array): TimeSeries {
  if (times.length !== values.length) {
    throw new RangeError(
      `makeTimeSeries: times (${times.length}) and values (${values.length}) must be the same length`,
    );
  }
  for (let i = 1; i < times.length; i++) {
    if (times[i] < times[i - 1]) {
      throw new RangeError(`makeTimeSeries: times must be non-decreasing (index ${i})`);
    }
  }
  return { times, values };
}

/** Number of samples in the series. */
export function sampleCount(ts: TimeSeries): number {
  return ts.times.length;
}

/** Seconds between the first and last sample; `0` for a series of fewer than two. */
export function spanSeconds(ts: TimeSeries): number {
  const n = ts.times.length;
  return n < 2 ? 0 : ts.times[n - 1] - ts.times[0];
}

/** First index whose time is `>= target` (or `arr.length` if none). */
function lowerBound(arr: Float64Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The inclusive `[fromSec, toSec]` window of the series, as a new {@link TimeSeries}
 * over copied data. Used by the refine pass to re-scan around a flagged moment.
 */
export function sliceByTime(ts: TimeSeries, fromSec: number, toSec: number): TimeSeries {
  if (toSec < fromSec) {
    throw new RangeError(`sliceByTime: toSec (${toSec}) is before fromSec (${fromSec})`);
  }
  const lo = lowerBound(ts.times, fromSec);
  let hi = lowerBound(ts.times, toSec);
  while (hi < ts.times.length && ts.times[hi] <= toSec) hi++;
  return { times: ts.times.slice(lo, hi), values: ts.values.slice(lo, hi) };
}

/**
 * The value of the last sample at or before `t`, or `undefined` if `t` precedes the
 * first sample (or the series is empty). Assumes non-decreasing times.
 */
export function valueAtOrBefore(ts: TimeSeries, t: number): number | undefined {
  const n = ts.times.length;
  if (n === 0 || t < ts.times[0]) return undefined;
  let lo = 0;
  let hi = n - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (ts.times[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ts.values[ans];
}

/** Arithmetic mean of the values whose time is in `[fromSec, toSec]`; `undefined` if none. */
export function meanInRange(ts: TimeSeries, fromSec: number, toSec: number): number | undefined {
  const lo = lowerBound(ts.times, fromSec);
  let sum = 0;
  let count = 0;
  for (let i = lo; i < ts.times.length && ts.times[i] <= toSec; i++) {
    sum += ts.values[i];
    count++;
  }
  return count === 0 ? undefined : sum / count;
}

/** Largest value whose time is in `[fromSec, toSec]`; `undefined` if none. */
export function maxInRange(ts: TimeSeries, fromSec: number, toSec: number): number | undefined {
  const lo = lowerBound(ts.times, fromSec);
  let max = -Infinity;
  for (let i = lo; i < ts.times.length && ts.times[i] <= toSec; i++) {
    if (ts.values[i] > max) max = ts.values[i];
  }
  return max === -Infinity ? undefined : max;
}
