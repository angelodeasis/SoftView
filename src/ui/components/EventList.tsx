import {
  channelLabel,
  confidencePhrase,
  eventKindLabel,
  severityLabel,
} from '../../core/events/describe';
import type { SensoryEvent } from '../../core/events/model';
import { formatClock } from '../format';
import { seekTarget } from '../seekTarget';

interface Props {
  events: readonly SensoryEvent[];
  onSeek: (seconds: number) => void;
}

/** The accessible, primary view of the detected events. */
export function EventList({ events, onSeek }: Props) {
  if (events.length === 0) {
    return (
      <p className="events__empty">
        No potential sensory events were detected. This does not mean the media contains none — see
        the limitations below.
      </p>
    );
  }

  return (
    <ol className="events">
      {events.map((e) => {
        const label = eventKindLabel(e.kind);
        const start = formatClock(seekTarget(e));
        return (
          <li key={e.id} className="events__item">
            <button
              type="button"
              className="events__seek"
              onClick={() => onSeek(seekTarget(e))}
              aria-label={`${start}, ${label}, ${severityLabel(e.severity)} severity, ${confidencePhrase(
                e.confidence,
              )} — jump to this moment`}
            >
              <span className="events__time">{start}</span>
              <span className="events__kind">{label}</span>
              <span className={`events__severity events__severity--${e.severity}`}>
                {severityLabel(e.severity)}
              </span>
              <span className="events__confidence">{confidencePhrase(e.confidence)}</span>
            </button>
            <details className="events__detail">
              <summary aria-label={`Details for ${start}, ${label}`}>Details</summary>
              <dl>
                <div>
                  <dt>Span</dt>
                  <dd>
                    {formatClock(e.startTime)}–{formatClock(e.endTime)}
                  </dd>
                </div>
                <div>
                  <dt>Channel</dt>
                  <dd>{channelLabel(e.channel)}</dd>
                </div>
                {Object.entries(e.metrics).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{Number.isInteger(v) ? v : v.toFixed(2)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
