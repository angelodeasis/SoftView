import { describe, expect, it } from 'vitest';
import { sortedTimeSeries } from './webCodecsFrameSampler';

// The rest of this module is real WebCodecs/mp4box/canvas work with no jsdom
// equivalent — verified in the real-browser pass, same as `frameSampler.ts`.
// `sortedTimeSeries` is the one piece of plain logic, so it's the one piece tested here.
describe('sortedTimeSeries', () => {
  it('keeps already-ordered frames as-is', () => {
    const series = sortedTimeSeries([0, 0.1, 0.2], [1, 2, 3]);
    expect(Array.from(series.times)).toEqual([0, 0.1, 0.2]);
    expect(Array.from(series.values)).toEqual([1, 2, 3]);
  });

  it('sorts frames delivered out of presentation order, keeping times and values paired', () => {
    const series = sortedTimeSeries([0.2, 0, 0.1], [30, 10, 20]);
    expect(Array.from(series.times)).toEqual([0, 0.1, 0.2]);
    expect(Array.from(series.values)).toEqual([10, 20, 30]);
  });

  it('handles an empty series', () => {
    const series = sortedTimeSeries([], []);
    expect(series.times).toHaveLength(0);
    expect(series.values).toHaveLength(0);
  });

  it('handles a single frame', () => {
    const series = sortedTimeSeries([5], [42]);
    expect(Array.from(series.times)).toEqual([5]);
    expect(Array.from(series.values)).toEqual([42]);
  });
});
