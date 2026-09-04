import type { RefObject } from 'react';
import { eventKindLabel } from '../../core/events/describe';
import type { SensoryEvent } from '../../core/events/model';
import { formatClock } from '../format';
import { seekTarget } from '../seekTarget';

interface Props {
  events: readonly SensoryEvent[];
  durationSec: number;
  onSeek: (seconds: number) => void;
  /**
   * When provided, a live playhead marker renders at `left: 0%` and the caller moves it
   * imperatively (e.g. from a `requestAnimationFrame` loop) by setting `style.left` —
   * used in Assisted Viewing so the same coloured overview keeps tracking playback,
   * rather than only being a static preview.
   */
  playheadRef?: RefObject<HTMLDivElement | null>;
}

/**
 * An overview bar — one marker per event, positioned by time, coloured by severity.
 * Purely visual: `aria-hidden`, markers are mouse-clickable but not focusable. The
 * {@link EventList} is the accessible path.
 */
export function EventTimeline({ events, durationSec, onSeek, playheadRef }: Props) {
  if (!(durationSec > 0)) return null;

  return (
    <div className="timeline" aria-hidden="true">
      {events.map((e) => {
        const left = Math.min(100, Math.max(0, (e.startTime / durationSec) * 100));
        const width = Math.max(0.8, ((e.endTime - e.startTime) / durationSec) * 100);
        return (
          <button
            key={e.id}
            type="button"
            tabIndex={-1}
            className={`timeline__mark timeline__mark--${e.severity}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${formatClock(seekTarget(e))} — ${eventKindLabel(e.kind)}`}
            onClick={() => onSeek(seekTarget(e))}
          />
        );
      })}
      {playheadRef && (
        <div ref={playheadRef} className="timeline__playhead" style={{ left: '0%' }} />
      )}
    </div>
  );
}
