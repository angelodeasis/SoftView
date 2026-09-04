/**
 * Per-frame brightness reduction for the video frame-capture adapter.
 *
 * This is gamma-encoded Rec.709 luma (the reduction spike R2 measured and the flash
 * analyzer was tuned against), **not** linearised relative luminance. Linearising first
 * is a possible later refinement if it ever changes detection quality.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib) — inputs are plain byte arrays,
 * never `ImageData`.
 */

/** Rec.709 luma of one gamma-encoded sRGB pixel; 0..255 channels in, 0..1 out. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Mean {@link relativeLuminance} over an RGBA pixel buffer; `0` for an empty buffer. */
export function meanLuminance(rgba: Uint8ClampedArray | Uint8Array): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    sum += relativeLuminance(rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  return sum / pixels;
}
