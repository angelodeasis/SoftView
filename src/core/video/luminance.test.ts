import { describe, expect, it } from 'vitest';
import { meanLuminance, relativeLuminance } from './luminance';

describe('relativeLuminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
  });

  it('weights the channels Rec.709', () => {
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance(0, 255, 0)).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance(0, 0, 255)).toBeCloseTo(0.0722, 4);
  });
});

describe('meanLuminance', () => {
  it('averages over the pixels, ignoring alpha', () => {
    // one white pixel, one black pixel
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(meanLuminance(rgba)).toBeCloseTo(0.5, 5);
  });

  it('is 0 for an empty buffer', () => {
    expect(meanLuminance(new Uint8ClampedArray(0))).toBe(0);
  });
});
