/**
 * The real frame capture: drives a detached `<video>` + a hidden downscale canvas to
 * produce luminance `TimeSeries` for the coarse and refine passes (adapted from spike
 * R2's reference code).
 *
 * Browser-only — jsdom has no `<video>` playback, `requestVideoFrameCallback`, or real
 * canvas readback, so this is exercised in the real-browser pass, not unit tests (the
 * stall/cancellation logic itself is factored out into `scanGuard.ts`, which is).
 */

import { makeTimeSeries, type TimeSeries } from '../../core/signal/timeSeries';
import { meanLuminance } from '../../core/video/luminance';
import { withStallGuard } from './scanGuard';
import type { ScanContext, VideoTrackOptions } from './types';

const HAS_RVFC =
  typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype;

const DEFAULT_STALL_TIMEOUT_MS = 10_000;

export interface Capture {
  readonly size: number;
  readonly ctx: CanvasRenderingContext2D;
  /** Accepts anything `drawImage` does — a `<video>` element or a decoded `VideoFrame`. */
  sampleAt(source: CanvasImageSource): number;
}

/** Exported for reuse by `webCodecsFrameSampler.ts` — same downscale, same luminance. */
export function makeCapture(size: number): Capture {
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
    sampleAt(source) {
      ctx.drawImage(source, 0, 0, size, size);
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

/**
 * A backgrounded tab can have the browser's own video-decode throttling kick in as a
 * battery-saving measure (observed: a scan on a multi-minute file that stalled only
 * after the user switched away). That's expected browser behaviour, not a genuine
 * stall, so keep resetting the stall clock on a slow drip while the page is hidden
 * rather than let it time out — the scan will simply take longer, and pick back up at
 * full speed once the tab is visible again. Returns a function that stops watching.
 */
function keepAliveWhileHidden(bump: () => void): () => void {
  let interval: ReturnType<typeof setInterval> | undefined;
  const onVisibilityChange = () => {
    if (document.hidden) {
      interval ??= setInterval(bump, 2000);
    } else if (interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  onVisibilityChange();
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (interval !== undefined) clearInterval(interval);
  };
}

function seekLoop(
  video: HTMLVideoElement,
  capture: Capture,
  fromSec: number,
  toSec: number,
  fps: number,
  ctx: ScanContext,
  stallTimeoutMs: number,
): Promise<TimeSeries> {
  return withStallGuard(
    async (bump) => {
      const stopKeepAlive = keepAliveWhileHidden(bump);
      try {
        const step = 1 / fps;
        const times: number[] = [];
        const values: number[] = [];
        video.pause();
        video.playbackRate = 1;
        for (let t = fromSec; t < toSec; t += step) {
          video.currentTime = t;
          await seeked(video);
          bump();
          times.push(video.currentTime);
          values.push(capture.sampleAt(video));
          ctx.onProgress?.((t - fromSec) / Math.max(toSec - fromSec, 1e-3));
        }
        return makeTimeSeries(Float64Array.from(times), Float32Array.from(values));
      } finally {
        stopKeepAlive();
      }
    },
    { signal: ctx.signal, stallTimeoutMs },
  );
}

function rvfcScan(
  video: HTMLVideoElement,
  capture: Capture,
  playbackRate: number,
  ctx: ScanContext,
  stallTimeoutMs: number,
): Promise<TimeSeries> {
  return withStallGuard(
    (bump) =>
      new Promise<TimeSeries>((resolve, reject) => {
        const times: number[] = [];
        const values: number[] = [];
        const duration = video.duration;
        const stopKeepAlive = keepAliveWhileHidden(bump);

        const done = () => {
          stopKeepAlive();
          video.pause();
          resolve(makeTimeSeries(Float64Array.from(times), Float32Array.from(values)));
        };
        const fail = (err: unknown) => {
          stopKeepAlive();
          reject(err);
        };

        const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
          bump();
          times.push(meta.mediaTime);
          values.push(capture.sampleAt(video));
          ctx.onProgress?.(Number.isFinite(duration) ? meta.mediaTime / duration : 0);
          if (video.ended || video.currentTime >= duration - 1e-3) {
            done();
            return;
          }
          video.requestVideoFrameCallback(onFrame);
        };

        video.addEventListener('error', () => fail(new Error('The video could not be played.')), {
          once: true,
        });
        video.addEventListener('ended', done, { once: true });
        // A blob URL has no network to stall on, but decode itself can still hiccup
        // (a rough GOP, or the background-tab throttling `keepAliveWhileHidden` above
        // is already accounting for) — `waiting`/`stalled` are the browser's own signal
        // that playback has stopped advancing. A `play()` nudge recovers the common
        // case; if it doesn't, `withStallGuard`'s timeout is the backstop.
        const nudge = () => void video.play().catch(() => {});
        video.addEventListener('waiting', nudge);
        video.addEventListener('stalled', nudge);
        video.currentTime = 0;
        video.playbackRate = playbackRate;
        video.requestVideoFrameCallback(onFrame);
        void video.play().catch(fail);
      }),
    { signal: ctx.signal, stallTimeoutMs },
  );
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
  const stallTimeoutMs = opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;

  return {
    coarseScan(ctx) {
      if (HAS_RVFC) return rvfcScan(video, capture, coarseRate, ctx, stallTimeoutMs);
      // Firefox: no rVFC — a slower whole-file seek-loop.
      return seekLoop(video, capture, 0, video.duration, 15, ctx, stallTimeoutMs);
    },
    refineScan(fromSec, toSec, ctx) {
      return seekLoop(video, capture, fromSec, toSec, refineFps, ctx, stallTimeoutMs);
    },
  };
}
