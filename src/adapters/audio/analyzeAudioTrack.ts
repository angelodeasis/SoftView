/**
 * Main-thread entry point for analysing a file's audio.
 *
 * Decodes the file with Web Audio (main thread only), then hands the raw channel data to
 * a worker that runs the loudness analyzer off-thread, and resolves with the events and
 * the `AnalyzerRun`.
 *
 * A file whose audio cannot be decoded resolves with `run.status === 'failed'` (not a
 * rejection) so a caller can still assemble a partial `AnalysisResult`. The promise
 * rejects only for a bad argument or a broken worker environment.
 */

import { decodeViaOfflineAudioContext } from './decodeAudio';
import { decodeFailureAnalysis } from './audioAnalysisPipeline';
import type {
  AudioAnalysisRequest,
  AudioAnalysisResponse,
  AudioTrackAnalysis,
  AudioTrackOptions,
  DecodedAudio,
} from './types';

export interface AnalyzeAudioTrackDeps {
  /** Decode encoded bytes to raw channel data. Default: `OfflineAudioContext`. */
  readonly decode: (bytes: ArrayBuffer) => Promise<DecodedAudio>;
  /** Run the analysis pipeline on decoded audio. Default: a dedicated worker. */
  readonly analyze: (decoded: DecodedAudio, opts: AudioTrackOptions) => Promise<AudioTrackAnalysis>;
  /** Wall clock, for the failed-run duration. Default: `performance.now`. */
  readonly now: () => number;
}

function analyzeInWorker(
  decoded: DecodedAudio,
  opts: AudioTrackOptions,
): Promise<AudioTrackAnalysis> {
  return new Promise<AudioTrackAnalysis>((resolve, reject) => {
    const worker = new Worker(new URL('./audioAnalysis.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (event: MessageEvent<AudioAnalysisResponse>) => {
      worker.terminate();
      resolve(event.data.result);
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The audio analysis worker failed to start.'));
    });
    const request: AudioAnalysisRequest = { decoded, opts };
    worker.postMessage(request, decoded.channelData.map((c) => c.buffer) as ArrayBuffer[]);
  });
}

export async function analyzeAudioTrack(
  blob: Blob,
  opts: AudioTrackOptions = {},
  deps: Partial<AnalyzeAudioTrackDeps> = {},
): Promise<AudioTrackAnalysis> {
  if (typeof blob?.arrayBuffer !== 'function') {
    throw new TypeError('analyzeAudioTrack: expected a Blob.');
  }
  const decode = deps.decode ?? decodeViaOfflineAudioContext;
  const analyze = deps.analyze ?? analyzeInWorker;
  const now = deps.now ?? (() => performance.now());

  const bytes = await blob.arrayBuffer();

  const startedMs = now();
  let decoded: DecodedAudio;
  try {
    decoded = await decode(bytes);
  } catch {
    return decodeFailureAnalysis(opts, now() - startedMs);
  }

  return analyze(decoded, opts);
}
