import type { AnalysisResult } from '../../core/events/analysisResult';
import { EventList } from './EventList';
import { EventTimeline } from './EventTimeline';
import { LimitationsNotice } from './LimitationsNotice';

interface Props {
  result: AnalysisResult;
  onSeek: (seconds: number) => void;
  onStartAssistedViewing: () => void;
}

/** The full results view: summary, overview bar, event list, limitations, and the way
 * into Assisted Viewing. */
export function ResultsPanel({ result, onSeek, onStartAssistedViewing }: Props) {
  const n = result.events.length;
  const durationSec = result.media.durationSec ?? 0;

  return (
    <section className="results" aria-labelledby="results-heading">
      <h2 id="results-heading">
        Potential sensory events ({n})
        {result.status === 'partial' && <span className="results__partial"> · incomplete</span>}
      </h2>

      <EventTimeline events={result.events} durationSec={durationSec} onSeek={onSeek} />
      <EventList events={result.events} onSeek={onSeek} />
      <LimitationsNotice result={result} />

      <button type="button" className="results__start-assisted" onClick={onStartAssistedViewing}>
        Start Assisted Viewing
      </button>
    </section>
  );
}
