/**
 * The complete output of an analysis run: the merged event list plus enough context
 * for the UI to be honest about what actually ran and what the results don't cover.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

import type { MediaFacts } from '../media/types';
import type { AnalyzerId, RawEvent, SensoryEvent } from './model';
import { normalizeEvents } from './normalize';

export interface AnalyzerRun {
  readonly analyzerId: AnalyzerId;
  /** The analyzer's own version tag, so old results can be read with care later. */
  readonly version: string;
  /** The tuning the analyzer ran with (thresholds, window sizes, …). */
  readonly params: Readonly<Record<string, number | string | boolean>>;
  /** Wall-clock time the analyzer took, in milliseconds. */
  readonly durationMs: number;
  /** How many samples the analyzer consumed. */
  readonly sampleCount: number;
  readonly status: 'ok' | 'failed' | 'skipped';
  /** Soft-language explanation when the run did not complete normally. */
  readonly note?: string;
}

export type AnalysisStatus = 'complete' | 'partial';

export interface AnalysisResult {
  readonly media: MediaFacts;
  readonly events: readonly SensoryEvent[];
  readonly runs: readonly AnalyzerRun[];
  /** `complete` only when at least one analyzer ran and every run succeeded. */
  readonly status: AnalysisStatus;
  /** Always-present caveats about what this analysis can and cannot tell the user. */
  readonly limitations: readonly string[];
  /** Run-specific notices (e.g. a scan that did not finish). */
  readonly warnings: readonly string[];
}

/**
 * The standing limitations of any SoftView analysis. Phrased per the project rule that
 * we never imply media is "safe" or that an event is definitely dangerous.
 */
export const BASE_LIMITATIONS: readonly string[] = [
  'SoftView’s analysis is heuristic. It can miss potentially intense moments, and it can flag moments that feel fine to you.',
  'A result is never a statement that media is safe to watch.',
  'Very brief flashing that falls between sampled frames may not be detected.',
  'Detection has been checked on only a limited range of browsers and devices.',
];

export interface BuildAnalysisResultInput {
  readonly media: MediaFacts;
  readonly runs: readonly AnalyzerRun[];
  /** Candidate events from every analyzer, pre-normalization. */
  readonly rawEvents: readonly RawEvent[];
  readonly durationSec: number;
  readonly mergeGapSec?: number;
  /** Extra caveats appended after {@link BASE_LIMITATIONS}. */
  readonly extraLimitations?: readonly string[];
  readonly warnings?: readonly string[];
}

/** Assemble an {@link AnalysisResult}: normalize the events, derive the status. */
export function buildAnalysisResult(input: BuildAnalysisResultInput): AnalysisResult {
  const events = normalizeEvents(input.rawEvents, {
    durationSec: input.durationSec,
    mergeGapSec: input.mergeGapSec,
  });
  const status: AnalysisStatus =
    input.runs.length > 0 && input.runs.every((r) => r.status === 'ok') ? 'complete' : 'partial';

  // A run that didn't finish (`failed`/`skipped`) explains itself via `note` — surface
  // that alongside any warnings the caller collected directly, so "results may be
  // incomplete" always comes with a reason, not just the generic partial banner.
  const runNotes = input.runs.flatMap((r) => (r.status !== 'ok' && r.note ? [r.note] : []));

  return {
    media: input.media,
    events,
    runs: input.runs,
    status,
    limitations: [...BASE_LIMITATIONS, ...(input.extraLimitations ?? [])],
    warnings: [...(input.warnings ?? []), ...runNotes],
  };
}
