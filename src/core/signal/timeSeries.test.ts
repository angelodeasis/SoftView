import { describe, expect, it } from 'vitest';
import {
  EMPTY_SERIES,
  makeTimeSeries,
  maxInRange,
  meanInRange,
  minInRange,
  sampleCount,
  sliceByTime,
  spanSeconds,
  valueAtOrBefore,
} from './timeSeries';

const series = (times: number[], values: number[]) =>
  makeTimeSeries(Float64Array.from(times), Float32Array.from(values));

describe('makeTimeSeries', () => {
  it('rejects mismatched lengths', () => {
    expect(() => series([0, 1], [0])).toThrow(RangeError);
  });

  it('rejects times that go backwards', () => {
    expect(() => series([0, 2, 1], [0, 0, 0])).toThrow(RangeError);
  });

  it('allows equal adjacent times', () => {
    expect(sampleCount(series([0, 1, 1, 2], [0, 0, 0, 0]))).toBe(4);
  });
});

describe('spanSeconds', () => {
  it('is the distance between first and last sample', () => {
    expect(spanSeconds(series([2, 5, 9], [0, 0, 0]))).toBe(7);
  });

  it('is zero for a series of fewer than two samples', () => {
    expect(spanSeconds(EMPTY_SERIES)).toBe(0);
    expect(spanSeconds(series([4], [1]))).toBe(0);
  });
});

describe('sliceByTime', () => {
  const ts = series([0, 1, 2, 3, 4], [10, 11, 12, 13, 14]);

  it('returns the inclusive window', () => {
    const s = sliceByTime(ts, 1, 3);
    expect(Array.from(s.times)).toEqual([1, 2, 3]);
    expect(Array.from(s.values)).toEqual([11, 12, 13]);
  });

  it('copies data rather than aliasing the source', () => {
    const s = sliceByTime(ts, 0, 4);
    s.values[0] = 999;
    expect(ts.values[0]).toBe(10);
  });

  it('is empty when the window misses every sample', () => {
    expect(sampleCount(sliceByTime(ts, 10, 20))).toBe(0);
  });

  it('rejects a backwards window', () => {
    expect(() => sliceByTime(ts, 3, 1)).toThrow(RangeError);
  });
});

describe('valueAtOrBefore', () => {
  const ts = series([0, 1, 2, 3], [10, 20, 30, 40]);

  it('returns the last sample at or before t', () => {
    expect(valueAtOrBefore(ts, 2)).toBe(30);
    expect(valueAtOrBefore(ts, 2.9)).toBe(30);
    expect(valueAtOrBefore(ts, 100)).toBe(40);
  });

  it('is undefined before the first sample or for an empty series', () => {
    expect(valueAtOrBefore(ts, -1)).toBeUndefined();
    expect(valueAtOrBefore(EMPTY_SERIES, 0)).toBeUndefined();
  });
});

describe('meanInRange / maxInRange / minInRange', () => {
  const ts = series([0, 1, 2, 3, 4], [10, 20, 30, 40, 50]);

  it('reduce the values whose time falls in the inclusive window', () => {
    expect(meanInRange(ts, 1, 3)).toBe(30);
    expect(maxInRange(ts, 1, 3)).toBe(40);
    expect(minInRange(ts, 1, 3)).toBe(20);
  });

  it('cover the whole series when the window is wide', () => {
    expect(meanInRange(ts, -100, 100)).toBe(30);
    expect(maxInRange(ts, -100, 100)).toBe(50);
    expect(minInRange(ts, -100, 100)).toBe(10);
  });

  it('handle a single-sample window', () => {
    expect(meanInRange(ts, 2, 2)).toBe(30);
  });

  it('are undefined when no sample falls in the window', () => {
    expect(meanInRange(ts, 1.1, 1.9)).toBeUndefined();
    expect(maxInRange(ts, 10, 20)).toBeUndefined();
    expect(minInRange(ts, 10, 20)).toBeUndefined();
    expect(meanInRange(EMPTY_SERIES, 0, 1)).toBeUndefined();
  });
});
