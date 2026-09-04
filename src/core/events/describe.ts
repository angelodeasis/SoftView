/**
 * Plain-language labels for events. Kept in core (not the UI) because the wording is
 * governed by the project rule that SoftView never calls media "safe" or an event
 * "dangerous" — a rule worth enforcing with a test (see `describe.test.ts`).
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

import type { SensoryChannel, SensoryEventKind, Severity } from './model';

const KIND_LABELS: Readonly<Record<SensoryEventKind, string>> = {
  'loudness-spike': 'Sudden loud sound',
  'sustained-loudness': 'Sustained loud section',
  clipping: 'Distorted (clipping) audio',
  flashing: 'Rapid flashing',
  'red-flash': 'Rapid red flashing',
  'luminance-spike': 'Bright flash',
  'scene-change': 'Scene change',
};

/** A short human label for an event kind. */
export function eventKindLabel(kind: SensoryEventKind): string {
  return KIND_LABELS[kind];
}

const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

/** The display label for a severity bucket. */
export function severityLabel(severity: Severity): string {
  return SEVERITY_LABELS[severity];
}

/**
 * How to talk about a 0..1 confidence — deliberately tentative, per the heuristic-only
 * framing.
 */
export function confidencePhrase(confidence: number): string {
  if (confidence >= 0.66) return 'likely';
  if (confidence >= 0.4) return 'possible';
  return 'uncertain';
}

/** "Audio" or "Visual". */
export function channelLabel(channel: SensoryChannel): string {
  return channel === 'audio' ? 'Audio' : 'Visual';
}
