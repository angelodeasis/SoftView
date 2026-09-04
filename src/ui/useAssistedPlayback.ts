import { useEffect, useRef, useState, type RefObject } from 'react';
import { mitigationAt } from '../core/assistedViewing/envelope';
import { eventKindLabel } from '../core/events/describe';
import type { SensoryEvent } from '../core/events/model';

export interface AssistedPlaybackState {
  /** A plain-language label for whatever is currently being softened, or `null`. */
  readonly status: string | null;
}

export interface PlayheadTarget {
  readonly ref: RefObject<HTMLElement | null>;
  readonly durationSec: number;
}

/**
 * Drives Assisted Viewing on a media element: a `requestAnimationFrame` loop reads
 * `currentTime`, asks the pure {@link mitigationAt} what to do, and applies it to
 * `volume` / a brightness+saturation filter. Runs continuously (not gated on
 * play/pause) so a paused seek still reflects the right state. When `playhead` is given,
 * the same tick also moves its element's `left` so the event-timeline overview keeps
 * tracking playback.
 *
 * DOM-mutation wiring, not a capture adapter — stays in `src/ui/`. Not unit-tested here
 * (rAF + live DOM mutation); verified in the real-browser pass, matching
 * `src/adapters/video/frameSampler.ts`'s precedent.
 */
export function useAssistedPlayback(
  ref: RefObject<HTMLMediaElement | null>,
  events: readonly SensoryEvent[],
  playhead?: PlayheadTarget,
): AssistedPlaybackState {
  const [status, setStatus] = useState<string | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  useEffect(() => {
    let frame: number;

    const tick = () => {
      const el = ref.current;
      if (el) {
        const t = el.currentTime;
        const level = mitigationAt(eventsRef.current, t);
        el.volume = level.volume;
        el.style.filter = `brightness(${level.brightness}) saturate(${level.saturation})`;
        const active = level.activeAudioEvent ?? level.activeVisualEvent;
        setStatus(active ? `Softening: ${eventKindLabel(active.kind)}` : null);

        const target = playheadRef.current;
        if (target?.ref.current && target.durationSec > 0) {
          const percent = Math.min(100, Math.max(0, (t / target.durationSec) * 100));
          target.ref.current.style.left = `${percent}%`;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref]);

  return { status };
}
