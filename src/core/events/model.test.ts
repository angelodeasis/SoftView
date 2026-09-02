import { describe, expect, it } from 'vitest';
import { severityFromScore } from './model';

describe('severityFromScore', () => {
  it('buckets scores into low / moderate / high', () => {
    expect(severityFromScore(0)).toBe('low');
    expect(severityFromScore(0.32)).toBe('low');
    expect(severityFromScore(0.33)).toBe('moderate');
    expect(severityFromScore(0.65)).toBe('moderate');
    expect(severityFromScore(0.66)).toBe('high');
    expect(severityFromScore(1)).toBe('high');
  });

  it('clamps out-of-range scores', () => {
    expect(severityFromScore(-2)).toBe('low');
    expect(severityFromScore(9)).toBe('high');
  });

  it('rejects NaN', () => {
    expect(() => severityFromScore(Number.NaN)).toThrow(RangeError);
  });
});
