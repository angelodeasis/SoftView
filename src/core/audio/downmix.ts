/**
 * Collapse decoded multi-channel PCM to a single mono track — what the loudness
 * analyzer works on. A plain per-channel average; SoftView measures intensity, not
 * spatial image, so a simple sum/N is enough.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

/**
 * Average `channels` into one `Float32Array`.
 *
 * - `[]` → an empty array.
 * - one channel → a copy (the caller owns the result; the source is left untouched).
 * - N channels → the mean per sample, over the length of the shortest channel.
 */
export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0].slice();

  let length = channels[0].length;
  for (const ch of channels) length = Math.min(length, ch.length);

  const out = new Float32Array(length);
  for (const ch of channels) {
    for (let i = 0; i < length; i++) out[i] += ch[i];
  }
  const scale = 1 / channels.length;
  for (let i = 0; i < length; i++) out[i] *= scale;
  return out;
}
