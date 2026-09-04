/// <reference lib="webworker" />

/**
 * Dedicated worker: run the CPU-heavy audio analysis (downmix, resample, windowing,
 * detection) off the main thread so a feature-length file never freezes the UI.
 * Decoding stays on the main thread — Web Audio is not available here.
 *
 * Thin transport only; the logic is in `audioAnalysisPipeline.ts`.
 */

import { runAudioAnalysisPipeline } from './audioAnalysisPipeline';
import type { AudioAnalysisRequest, AudioAnalysisResponse } from './types';

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener('message', (event: MessageEvent<AudioAnalysisRequest>) => {
  const { decoded, opts } = event.data;
  const result = runAudioAnalysisPipeline(decoded, opts, () => performance.now());
  const response: AudioAnalysisResponse = { result };
  worker.postMessage(response);
});
