/**
 * Shared types for the audio decode adapter — the pipeline, the worker transport, and
 * the main-thread entry point.
 *
 * Split of work: decoding needs Web Audio, which is only available on the main thread, so
 * `analyzeAudioTrack` decodes there and hands the raw channel data to a worker that does
 * the CPU-heavy downmix / resample / windowing / detection.
 */

import type { RawEvent } from '../../core/events/model';
import type { AnalyzerRun } from '../../core/events/analysisResult';
import type { AnalyzeLoudnessOptions } from '../../core/audio/analyzeLoudness';
import type { ComputeLoudnessOptions } from '../../core/audio/loudness';

export interface AudioTrackOptions {
  /** Overrides passed straight through to `computeLoudness` and `analyzeLoudness`. */
  readonly loudness?: AnalyzeLoudnessOptions & ComputeLoudnessOptions;
}

export interface AudioTrackAnalysis {
  readonly events: readonly RawEvent[];
  readonly run: AnalyzerRun;
}

/** The minimal shape the pipeline needs from a decoded `AudioBuffer`. */
export interface DecodedAudio {
  readonly sampleRate: number;
  readonly channelData: readonly Float32Array[];
  readonly durationSec: number;
}

/** main thread → worker */
export interface AudioAnalysisRequest {
  readonly decoded: DecodedAudio;
  readonly opts: AudioTrackOptions;
}

/** worker → main thread */
export interface AudioAnalysisResponse {
  readonly result: AudioTrackAnalysis;
}
