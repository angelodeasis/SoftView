/**
 * The CPU-heavy half of the audio pass, as a plain function: decoded channel data in,
 * events + an `AnalyzerRun` out. No Web Audio here — decoding happens on the main thread
 * (see `analyzeAudioTrack.ts`); this runs in the worker and is unit-tested directly.
 */

import {
  analyzeLoudness,
  AUDIO_LOUDNESS_ANALYZER_ID,
  AUDIO_LOUDNESS_VERSION,
  DEFAULT_LOUDNESS_PARAMS,
} from '../../core/audio/analyzeLoudness';
import { computeLoudness } from '../../core/audio/loudness';
import { downmixToMono } from '../../core/audio/downmix';
import { resampleLinear } from '../../core/audio/resample';
import type { AnalyzerRun } from '../../core/events/analysisResult';
import { AUDIO_ANALYSIS_SAMPLE_RATE } from './constants';
import type { AudioTrackAnalysis, AudioTrackOptions, DecodedAudio } from './types';

export const DECODE_FAILED_NOTE = 'SoftView could not read the audio in this file.';

function runParams(opts: AudioTrackOptions): AnalyzerRun['params'] {
  return {
    ...DEFAULT_LOUDNESS_PARAMS,
    ...opts.loudness,
    sampleRate: AUDIO_ANALYSIS_SAMPLE_RATE,
  };
}

/** The `AnalyzerRun` + empty events for a file whose audio could not be decoded. */
export function decodeFailureAnalysis(
  opts: AudioTrackOptions,
  durationMs: number,
): AudioTrackAnalysis {
  return {
    events: [],
    run: {
      analyzerId: AUDIO_LOUDNESS_ANALYZER_ID,
      version: AUDIO_LOUDNESS_VERSION,
      params: runParams(opts),
      durationMs,
      sampleCount: 0,
      status: 'failed',
      note: DECODE_FAILED_NOTE,
    },
  };
}

/** Downmix → resample to 16 kHz if needed → loudness series → events + an ok run. */
export function runAudioAnalysisPipeline(
  decoded: DecodedAudio,
  opts: AudioTrackOptions,
  now: () => number,
): AudioTrackAnalysis {
  const startedMs = now();

  let mono = downmixToMono(decoded.channelData);
  if (decoded.sampleRate !== AUDIO_ANALYSIS_SAMPLE_RATE) {
    mono = resampleLinear(mono, decoded.sampleRate, AUDIO_ANALYSIS_SAMPLE_RATE);
  }

  const loudness = computeLoudness(mono, AUDIO_ANALYSIS_SAMPLE_RATE, opts.loudness);
  const events = analyzeLoudness(loudness, opts.loudness);

  return {
    events,
    run: {
      analyzerId: AUDIO_LOUDNESS_ANALYZER_ID,
      version: AUDIO_LOUDNESS_VERSION,
      params: runParams(opts),
      durationMs: now() - startedMs,
      sampleCount: loudness.rms.times.length,
      status: 'ok',
    },
  };
}
