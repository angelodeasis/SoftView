/**
 * Linear-interpolation sample-rate conversion for the decode adapter's fallback path
 * (browsers that don't resample on decode — historically Firefox).
 *
 * Linear interpolation is deliberately simple: SoftView analyses a loudness / peak
 * envelope, not audio for listening, so the high-frequency aliasing a proper decimation
 * filter would remove is negligible for RMS/peak intensity. A better filter is a later
 * refinement if it ever matters.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

/**
 * Resample `pcm` from `fromRate` to `toRate`. Equal rates (or empty input) return a
 * copy; otherwise the output has `round(pcm.length * toRate / fromRate)` samples, with
 * the final source sample clamped for the last interpolation step.
 */
export function resampleLinear(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!(fromRate > 0) || !(toRate > 0)) {
    throw new RangeError(`resampleLinear: rates must be positive, got ${fromRate} -> ${toRate}`);
  }
  if (fromRate === toRate || pcm.length === 0) return pcm.slice();

  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(pcm.length * ratio));
  const out = new Float32Array(outLength);
  const lastIndex = pcm.length - 1;

  for (let i = 0; i < outLength; i++) {
    const src = i / ratio;
    const i0 = Math.min(Math.floor(src), lastIndex);
    const i1 = Math.min(i0 + 1, lastIndex);
    const frac = src - i0;
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
  }
  return out;
}
