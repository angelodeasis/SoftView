/**
 * The common model produced by every analysis engine and consumed by Assisted Viewing
 * and the UI.
 *
 * This file is the shared contract. It must stay free of DOM and React types — it is
 * checked with `tsconfig.core.json`, which has no "DOM" lib.
 *
 * NOTE: this is a minimal starting point for Phase 0. The full event / analysis-result
 * model (media info, analyzer run info, warnings, normalization utilities) is built in
 * its own later phase.
 */

export type SensoryChannel = 'audio' | 'visual';

export type SensoryEventKind =
  // audio
  | 'loudness-spike'
  | 'sustained-loudness'
  | 'clipping'
  // visual
  | 'flashing'
  | 'red-flash'
  | 'luminance-spike'
  | 'scene-change';

export type Severity = 'low' | 'moderate' | 'high';

export interface SensoryEvent {
  readonly id: string;
  readonly channel: SensoryChannel;
  readonly kind: SensoryEventKind;

  /** Seconds on the media timeline. */
  readonly startTime: number;
  readonly endTime: number;
  /** Seconds; where the event is at its most intense, when known. */
  readonly peakTime?: number;

  /** 0..1 — how intense the event is, assuming it is real. */
  readonly severityScore: number;
  /** Bucketed form of {@link severityScore}, for display. */
  readonly severity: Severity;

  /** 0..1 — heuristic confidence that this is a real event and not an artefact. */
  readonly confidence: number;

  /**
   * Kind-specific raw measurements (e.g. `deltaDb`, `flashesPerSecond`). Analyzer-owned;
   * not part of the stable contract, shown only in a details view.
   */
  readonly metrics: Readonly<Record<string, number>>;
}

/**
 * What an analyzer emits per candidate event. The `id` and `severity` fields are filled
 * in by {@link normalizeEvents} — `id` deterministically from `channel` + `kind` +
 * `startTime`, `severity` from `severityScore` — so an analyzer can neither drift the
 * two intensity fields apart nor mint unstable ids.
 */
export type RawEvent = Omit<SensoryEvent, 'id' | 'severity'>;

/**
 * Identifier for an analysis engine. Seeded with the analyzers SoftView ships; extend
 * this union in the phase that adds a new analyzer.
 */
export type AnalyzerId = 'audio-loudness' | 'visual-flash';

const HIGH_SEVERITY_THRESHOLD = 0.66;
const MODERATE_SEVERITY_THRESHOLD = 0.33;

/** Bucket a 0..1 severity score into a {@link Severity} label. */
export function severityFromScore(score: number): Severity {
  if (Number.isNaN(score)) {
    throw new RangeError(`severityFromScore: score must be a number, got NaN`);
  }
  const clamped = Math.min(1, Math.max(0, score));
  if (clamped >= HIGH_SEVERITY_THRESHOLD) return 'high';
  if (clamped >= MODERATE_SEVERITY_THRESHOLD) return 'moderate';
  return 'low';
}
