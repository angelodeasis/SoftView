/**
 * Main-thread entry point for analysing a file's video track.
 *
 * Loads the file into a detached `<video>`, runs the coarse + refine frame-capture
 * pipeline, and resolves with the events, the `AnalyzerRun`, and any warnings.
 *
 * A video that cannot be loaded/decoded resolves with `run.status === 'failed'`; an
 * aborted analysis resolves with `run.status === 'skipped'`. The promise rejects only
 * for a bad argument.
 */

import { createObjectUrl } from '../../media/objectUrl';
import { createFrameSampler } from './frameSampler';
import { coarseScanFailureAnalysis, runVideoAnalysisPipeline } from './videoAnalysisPipeline';
import type { VideoPipelineDeps } from './videoAnalysisPipeline';
import type { VideoAnalysisProgress, VideoTrackAnalysis, VideoTrackOptions } from './types';

export interface AnalyzeVideoTrackDeps {
  readonly buildSampler: (
    blobUrl: string,
    opts: VideoTrackOptions,
  ) => Promise<{
    durationSec: number;
    coarseScan: VideoPipelineDeps['coarseScan'];
    refineScan: VideoPipelineDeps['refineScan'];
    dispose: () => void;
  }>;
  readonly now: () => number;
}

function loadedMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('The video could not be loaded.')), {
      once: true,
    });
  });
}

const defaultBuildSampler: AnalyzeVideoTrackDeps['buildSampler'] = async (blobUrl, opts) => {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = blobUrl;
  await loadedMetadata(video);

  const sampler = createFrameSampler(video, opts);
  return {
    durationSec: video.duration,
    coarseScan: sampler.coarseScan,
    refineScan: sampler.refineScan,
    dispose: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
};

export async function analyzeVideoTrack(
  blob: Blob,
  opts: VideoTrackOptions = {},
  progress: VideoAnalysisProgress = {},
  deps: Partial<AnalyzeVideoTrackDeps> = {},
): Promise<VideoTrackAnalysis> {
  if (typeof blob?.arrayBuffer !== 'function') {
    throw new TypeError('analyzeVideoTrack: expected a Blob.');
  }
  const buildSampler = deps.buildSampler ?? defaultBuildSampler;
  const now = deps.now ?? (() => performance.now());
  const objectUrl = createObjectUrl(blob);

  try {
    let sampler: Awaited<ReturnType<AnalyzeVideoTrackDeps['buildSampler']>>;
    try {
      sampler = await buildSampler(objectUrl.url, opts);
    } catch {
      return coarseScanFailureAnalysis(opts, 0);
    }
    try {
      return await runVideoAnalysisPipeline(
        {
          coarseScan: sampler.coarseScan,
          refineScan: sampler.refineScan,
          durationSec: sampler.durationSec,
          now,
        },
        opts,
        progress,
      );
    } finally {
      sampler.dispose();
    }
  } finally {
    objectUrl.revoke();
  }
}
