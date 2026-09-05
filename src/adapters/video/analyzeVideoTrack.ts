/**
 * Main-thread entry point for analysing a file's video track.
 *
 * Tries WebCodecs first (`webCodecsFrameSampler.ts` — decodes as fast as the hardware
 * allows, no `<video>`-playback realtime ceiling); falls back to the `<video>`-based
 * coarse+refine pipeline (`frameSampler.ts`) wherever the browser or this file's codec
 * doesn't support it. Resolves with the events, the `AnalyzerRun`, and any warnings.
 *
 * A video that cannot be loaded/decoded resolves with `run.status === 'failed'`; an
 * aborted analysis resolves with `run.status === 'skipped'`. The promise rejects only
 * for a bad argument.
 */

import { createObjectUrl } from '../../media/objectUrl';
import { createFrameSampler } from './frameSampler';
import { coarseScanFailureAnalysis, runVideoAnalysisPipeline } from './videoAnalysisPipeline';
import { createWebCodecsFrameSampler, probeWebCodecs } from './webCodecsFrameSampler';
import type { VideoPipelineDeps } from './videoAnalysisPipeline';
import type { VideoAnalysisProgress, VideoTrackAnalysis, VideoTrackOptions } from './types';

export interface AnalyzeVideoTrackDeps {
  readonly buildSampler: (
    blob: Blob,
    blobUrl: string,
    opts: VideoTrackOptions,
  ) => Promise<{
    durationSec: number;
    coarseScan: VideoPipelineDeps['coarseScan'];
    refineScan: VideoPipelineDeps['refineScan'];
    dispose: () => void;
    usedWebCodecs: boolean;
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

const defaultBuildSampler: AnalyzeVideoTrackDeps['buildSampler'] = async (blob, blobUrl, opts) => {
  const probe = await probeWebCodecs(blob);
  if (probe.supported) {
    return {
      durationSec: probe.durationSec,
      ...createWebCodecsFrameSampler(blob, opts),
      dispose: () => {},
      usedWebCodecs: true,
    };
  }

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
    usedWebCodecs: false,
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
      sampler = await buildSampler(blob, objectUrl.url, opts);
    } catch {
      return coarseScanFailureAnalysis(opts, 0);
    }
    // WebCodecs decodes densely fast enough that there's nothing left to "refine" —
    // treat every WebCodecs-sampled video like the short-video case (a single dense
    // scan, no coarse pass) regardless of its actual length.
    const runOpts: VideoTrackOptions = sampler.usedWebCodecs
      ? { ...opts, usedWebCodecs: true, fullScanMaxDurationSec: Number.POSITIVE_INFINITY }
      : opts;
    try {
      return await runVideoAnalysisPipeline(
        {
          coarseScan: sampler.coarseScan,
          refineScan: sampler.refineScan,
          durationSec: sampler.durationSec,
          now,
        },
        runOpts,
        progress,
      );
    } finally {
      sampler.dispose();
    }
  } finally {
    objectUrl.revoke();
  }
}
