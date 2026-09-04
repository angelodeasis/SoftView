import type { MediaAdvisory } from '../../core/media/largeFileAdvisory';
import { useAnalysis } from '../../state/analysisStore';

interface Props {
  /** Start analysis. Undefined disables the button (e.g. duration not yet known). */
  onAnalyze?: () => void;
  disabledReason?: string;
  /** Surfaced again here (also shown in the facts panel) right at the point of commitment. */
  advisory?: MediaAdvisory | null;
}

/**
 * The Analyze button and, while a run is in progress, a progress bar + Stop control.
 * Reads the analysis lifecycle from {@link useAnalysis}.
 */
export function AnalyzeControls({ onAnalyze, disabledReason, advisory }: Props) {
  const { state, cancel } = useAnalysis();

  if (state.status === 'running') {
    const percent = Math.round(state.fraction * 100);
    return (
      <div className="analyze">
        <div
          className="analyze__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${state.label} ${percent}%`}
        >
          <span className="analyze__fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="analyze__status" aria-live="polite">
          {state.label} ({percent}%)
        </p>
        <button type="button" onClick={cancel}>
          Stop analysis
        </button>
      </div>
    );
  }

  return (
    <div className="analyze">
      <button type="button" onClick={onAnalyze} disabled={!onAnalyze}>
        {state.status === 'done' || state.status === 'error'
          ? 'Analyze again'
          : 'Analyze this file'}
      </button>
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {advisory && <p className={`advisory advisory--${advisory.level}`}>{advisory.message}</p>}
      <p className="analyze__note">
        {disabledReason ??
          'Analysis runs entirely on your device. Video analysis can take several minutes.'}
      </p>
    </div>
  );
}
