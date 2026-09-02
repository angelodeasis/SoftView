/**
 * Media domain types. Pure data — no DOM, no `File`. The browser layer (`src/media`)
 * builds these from a real `File`; the UI and, later, the analysis layer consume them.
 */

export type MediaKind = 'video' | 'audio';

export interface MediaFacts {
  /** Original file name, as chosen by the user. */
  readonly name: string;
  /** File size in bytes. */
  readonly sizeBytes: number;
  /** Reported MIME type (may be empty if the OS didn't provide one). */
  readonly mimeType: string;
  /** Whether SoftView will treat this as video or audio. */
  readonly kind: MediaKind;

  /** Duration in seconds, once metadata has loaded. */
  readonly durationSec?: number;
  /** Native pixel dimensions (video only), once metadata has loaded. */
  readonly width?: number;
  readonly height?: number;
}
