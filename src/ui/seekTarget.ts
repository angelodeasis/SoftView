import type { SensoryEvent } from '../core/events/model';

/** Lead-in before an event's reported start, so playback doesn't launch mid-onset. */
const LEAD_IN_SEC = 0.2;

/**
 * Where to seek the player for "jump to this moment".
 *
 * Deliberately anchored to `startTime` (with a small lead-in) rather than `peakTime`.
 * Several analyzers report intensity through a *windowed* metric (audio loudness is a
 * trailing short-term RMS) that only reaches its measured peak once the window has
 * filled with the event — for a short burst that can be hundreds of milliseconds after
 * the true onset, so seeking to `peakTime` can land after (or even past) the moment a
 * listener would actually notice. `startTime` comes from the first sample that tripped
 * the detector, which sits much closer to the true onset — found via real-browser
 * testing on a loud beep whose reported spike seeked in after the beep had nearly ended.
 */
export function seekTarget(event: SensoryEvent): number {
  return Math.max(0, event.startTime - LEAD_IN_SEC);
}
