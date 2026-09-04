import { describe, expect, it } from 'vitest';
import { downmixToMono } from './downmix';

const f32 = (...xs: number[]) => Float32Array.from(xs);

describe('downmixToMono', () => {
  it('returns an empty array for no channels', () => {
    expect(downmixToMono([])).toEqual(new Float32Array(0));
  });

  it('copies a single channel rather than aliasing it', () => {
    const source = f32(0.25, -0.5, 0.75);
    const out = downmixToMono([source]);
    out[0] = 9;
    expect(source).toEqual(f32(0.25, -0.5, 0.75));
    expect(out[0]).toBe(9);
  });

  it('averages stereo channels', () => {
    const out = downmixToMono([f32(1, 0, -1), f32(0, 1, 1)]);
    expect(Array.from(out)).toEqual([0.5, 0.5, 0]);
  });

  it('averages three channels', () => {
    const out = downmixToMono([f32(3), f32(3), f32(0)]);
    expect(out[0]).toBe(2);
  });

  it('clamps to the shortest channel when lengths differ', () => {
    const out = downmixToMono([f32(1, 1, 1, 1), f32(1, 1)]);
    expect(out).toHaveLength(2);
    expect(Array.from(out)).toEqual([1, 1]);
  });
});
