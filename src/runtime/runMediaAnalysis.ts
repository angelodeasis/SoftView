/**
 * The media analysis orchestrator: run the audio pass, then (for video) the video pass —
 * feeding the audio-event timestamps into the video refine pass — and fold both into one
 * `AnalysisResult`.
 *
 * The two adapters are injectable so this is unit-tested without a worker or a `<video>`.
 * Lives in `src/runtime/` — it wires adapters to core, above the per-track adapters.
 */

import { analyzeAudioTrack as realAnalyzeAudioTrack } from '../adapters/audio/analyzeAudioTrack';
import { analyzeVideoTrack as realAnalyzeVideoTrack } from '../adapters/video/analyzeVideoTrack';
import { buildAnalysisResult } from '../core/events/analysisResult';
import type { AnalysisResult, AnalyzerRun } from '../core/events/analysisResult';
import type { RawEvent } from '../core/events/model';
import type { MediaFacts, MediaKind } from '../core/media/types';
import type { AudioTrackAnalysis } from '../adapters/audio/types';
import type {
  VideoAnalysisProgress,
  VideoTrackAnalysis,
  VideoTrackOptions,
} from '../adapters/video/types';

export interface MediaAnalysisInput {
  readonly file: Blob;
  readonly kind: MediaKind;
  readonly media: MediaFacts;
  readonly durationSec: number;
}

export interface MediaAnalysisProgress {
  readonly onProgress?: (update: { fraction: number; label: string }) => void;
  readonly signal?: AbortSignal;
}

export interface MediaAnalysisDeps {
  readonly analyzeAudioTrack: (file: Blob) => Promise<AudioTrackAnalysis>;
  readonly analyzeVideoTrack: (
    file: Blob,
    opts?: VideoTrackOptions,
    progress?: VideoAnalysisProgress,
  ) => Promise<VideoTrackAnalysis>;
}

const AUDIO_FRACTION = 0.08;

const eventTime = (e: RawEvent): number => e.peakTime ?? (e.startTime + e.endTime) / 2;

export async function runMediaAnalysis(
  input: MediaAnalysisInput,
  progress: MediaAnalysisProgress = {},
  deps: Partial<MediaAnalysisDeps> = {},
): Promise<AnalysisResult> {
  const analyzeAudioTrack = deps.analyzeAudioTrack ?? realAnalyzeAudioTrack;
  const analyzeVideoTrack = deps.analyzeVideoTrack ?? realAnalyzeVideoTrack;
  const report = (fraction: number, label: string) => progress.onProgress?.({ fraction, label });

  const runs: AnalyzerRun[] = [];
  const rawEvents: RawEvent[] = [];
  const warnings: string[] = [];

  report(0, 'Analyzing audio…');
  const audio = await analyzeAudioTrack(input.file);
  runs.push(audio.run);
  rawEvents.push(...audio.events);

  if (input.kind === 'video') {
    report(AUDIO_FRACTION, 'Analyzing video…');
    const video = await analyzeVideoTrack(
      input.file,
      { refineAroundSec: audio.events.map(eventTime) },
      {
        onProgress: (f) => report(AUDIO_FRACTION + (1 - AUDIO_FRACTION) * f, 'Analyzing video…'),
        signal: progress.signal,
      },
    );
    runs.push(video.run);
    rawEvents.push(...video.events);
    warnings.push(...video.warnings);
  }

  report(1, 'Done');
  return buildAnalysisResult({
    media: input.media,
    runs,
    rawEvents,
    durationSec: input.durationSec,
    warnings,
  });
}
