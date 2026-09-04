/**
 * The real frame capture: drives a detached `<video>` + a hidden downscale canvas to
 * produce luminance `TimeSeries` for the coarse and refine passes (adapted from spike
 * R2's reference code).
 *
 * Browser-only — jsdom has no `<video>` playback, `requestVideoFrameCallback`, or real
 * canvas readback, so this is exercised in the real-browser pass, not unit tests.
 */

import { makeTimeSeries, type TimeSeries } from '../../core/signal/timeSeries';
import { meanLuminance } from '../../core/video/luminance';
import type { ScanContext, VideoTrackOptions } from './types';

const HAS_RVFC =
  typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype;

function abortError(): Error {
  const err = new Error('Video analysis was cancelled.');
  err.name = 'AbortError';
  return err;
}

interface Capture {
  readonly size: number;
  readonly ctx: CanvasRenderingContext2D;
  sampleAt(video: HTMLVideoElement): number;
}

function makeCapture(size: number): Capture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('SoftView could not create a canvas for video analysis.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  return {
    size,
    ctx,
    sampleAt(video) {
      ctx.drawImage(video, 0, 0, size, size);
      return meanLuminance(ctx.getImageData(0, 0, size, size).data);
    },
  };
}

const seeked = (video: HTMLVideoElement): Promise<void> =>
  new Promise((resolve) => {
    const on = () => {
      video.removeEventListener('seeked', on);
      resolve();
    };
    video.addEventListener('seeked', on);
  });

async function seekLoop(
  video: HTMLVideoElement,
  capture: Capture,
  fromSec: number,
  toSec: number,
  fps: number,
  ctx: ScanContext,
): Promise<TimeSeries> {
  const step = 1 / fps;
  const times: number[] = [];
  const values: number[] = [];
  video.pause();
  video.playbackRate = 1;
  for (let t = fromSec; t < toSec; t += step) {
    if (ctx.signal?.aborted) throw abortError();
    video.currentTime = t;
    await seeked(video);
    times.push(video.currentTime);
    values.push(capture.sampleAt(video));
    ctx.onProgress?.((t - fromSec) / Math.max(toSec - fromSec, 1e-3));
  }
  return makeTimeSeries(Float64Array.from(times), Float32Array.from(values));
}

function rvfcScan(
  video: HTMLVideoElement,
  capture: Capture,
  playbackRate: number,
  ctx: ScanContext,
): Promise<TimeSeries> {
  return new Promise<TimeSeries>((resolve, reject) => {
    const times: number[] = [];
    const values: number[] = [];
    const duration = video.duration;

    const done = () => {
      video.pause();
      resolve(makeTimeSeries(Float64Array.from(times), Float32Array.from(values)));
    };

    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (ctx.signal?.aborted) {
        video.pause();
        reject(abortError());
        return;
      }
      times.push(meta.mediaTime);
      values.push(capture.sampleAt(video));
      ctx.onProgress?.(Number.isFinite(duration) ? meta.mediaTime / duration : 0);
      if (video.ended || video.currentTime >= duration - 1e-3) {
        done();
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };

    video.addEventListener('error', () => reject(new Error('The video could not be played.')), {
      once: true,
    });
    video.addEventListener('ended', done, { once: true });
    video.currentTime = 0;
    video.playbackRate = playbackRate;
    video.requestVideoFrameCallback(onFrame);
    void video.play().catch(reject);
  });
}

export interface FrameSampler {
  coarseScan(ctx: ScanContext): Promise<TimeSeries>;
  refineScan(fromSec: number, toSec: number, ctx: ScanContext): Promise<TimeSeries>;
}

export function createFrameSampler(
  video: HTMLVideoElement,
  opts: VideoTrackOptions = {},
): FrameSampler {
  const capture = makeCapture(opts.downscalePx ?? 64);
  const coarseRate = opts.coarsePlaybackRate ?? 2;
  const refineFps = opts.refineFps ?? 30;

  return {
    coarseScan(ctx) {
      if (HAS_RVFC) return rvfcScan(video, capture, coarseRate, ctx);
      // Firefox: no rVFC — a slower whole-file seek-loop.
      return seekLoop(video, capture, 0, video.duration, 15, ctx);
    },
    refineScan(fromSec, toSec, ctx) {
      return seekLoop(video, capture, fromSec, toSec, refineFps, ctx);
    },
  };
}
