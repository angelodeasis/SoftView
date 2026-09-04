import { eventKindLabel } from '../../core/events/describe';
import type { SensoryEvent } from '../../core/events/model';
import { formatClock } from '../format';
import { seekTarget } from '../seekTarget';

interface Props {
  events: readonly SensoryEvent[];
  durationSec: number;
  onSeek: (seconds: number) => void;
}

/**
 * A static overview bar — one marker per event, positioned by time, coloured by
 * severity. Purely visual: `aria-hidden`, markers are mouse-clickable but not focusable.
 * The {@link EventList} is the accessible path.
 */
export function EventTimeline({ events, durationSec, onSeek }: Props) {
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
    </div>
  );
}
