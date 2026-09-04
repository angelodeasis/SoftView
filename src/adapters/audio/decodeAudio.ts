/**
 * Real decoding, via `OfflineAudioContext` — usable off the main thread, unlike a
 * realtime `AudioContext`. Spec-compliant browsers resample to the context rate here
 * (16 kHz); Firefox returns the file's native rate and the pipeline resamples.
 *
 * Browser-only. Not unit-tested — exercised in the real-browser pass.
 */

import { AUDIO_ANALYSIS_SAMPLE_RATE } from './constants';
import type { DecodedAudio } from './types';

export async function decodeViaOfflineAudioContext(bytes: ArrayBuffer): Promise<DecodedAudio> {
  const ctx = new OfflineAudioContext({
    numberOfChannels: 1,
    length: 1,
    sampleRate: AUDIO_ANALYSIS_SAMPLE_RATE,
  });
  const buffer = await ctx.decodeAudioData(bytes);
  return {
    sampleRate: buffer.sampleRate,
    channelData: Array.from({ length: buffer.numberOfChannels }, (_unused, c) =>
      buffer.getChannelData(c),
    ),
    durationSec: buffer.duration,
  };
}
