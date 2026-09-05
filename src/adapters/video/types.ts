/**
 * Shared types for the video frame-capture adapter — the pipeline, the browser frame
 * sampler, and the main-thread entry point.
 */

import type { AnalyzeVisualFlashOptions } from '../../core/video/analyzeFlash';
import type { AnalyzerRun } from '../../core/events/analysisResult';
import type { RawEvent } from '../../core/events/model';

export interface VideoTrackOptions {
  /** Overrides passed straight through to `analyzeVisualFlash`. */
  readonly flash?: AnalyzeVisualFlashOptions;
  /** Background playback rate for the coarse pass. Default `2`. */
  readonly coarsePlaybackRate?: number;
  /** Square downscale size (px) for the per-frame luminance reduction. Default `64`. */
  readonly downscalePx?: number;
  /** Context added to each side of a refine window. Default `2.5` s. */
  readonly refinePadSec?: number;
  /** Sample rate for the refine pass seek-loop. Default `30`. */
  readonly refineFps?: number;
  /** Extra timestamps to re-scan in detail (e.g. audio-event times). */
  readonly refineAroundSec?: readonly number[];
  /**
   * Videos at or under this duration skip the coarse pass entirely and get a single
   * dense re-scan of the whole file. Default `20` s.
   */
  readonly fullScanMaxDurationSec?: number;
  /**
   * A scan fails if it goes this long with no new frame/seek (a stalled `<video>` —
   * decode hiccup, background-tab throttling — rather than an error). Default
   * `10000` ms.
   */
  readonly stallTimeoutMs?: number;
  /**
   * Set by `analyzeVideoTrack.ts` — whether this run used the WebCodecs sampler
   * (`webCodecsFrameSampler.ts`) instead of the `<video>`-based one. Purely an audit
   * trail on `AnalyzerRun.params`; not read by the pipeline itself.
   */
  readonly usedWebCodecs?: boolean;
}

export interface VideoTrackAnalysis {
  readonly events: readonly RawEvent[];
  readonly run: AnalyzerRun;
  /** Soft-language notices (e.g. a window that could not be re-scanned). */
  readonly warnings: readonly string[];
}

export interface ScanContext {
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}

export interface VideoAnalysisProgress {
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}
