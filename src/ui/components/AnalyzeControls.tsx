import type { MediaAdvisory } from '../../core/media/largeFileAdvisory';
import type { MediaKind } from '../../core/media/types';
import { useAnalysis } from '../../state/analysisStore';

interface Props {
  /** Start analysis. Undefined disables the button (e.g. duration not yet known). */
  onAnalyze?: () => void;
  disabledReason?: string;
  /** Surfaced again here (also shown in the facts panel) right at the point of commitment. */
  advisory?: MediaAdvisory | null;
  kind?: MediaKind;
}

// Video analysis plays the file in the background to sample frames — a backgrounded
// tab can have the browser throttle that for battery savings, which slows (not breaks)
// analysis. Worth setting expectations for, since it isn't obvious from the outside.
const TAB_VISIBILITY_HINT = 'Keep this tab open and visible for it to finish quickest.';

function analyzeNote(disabledReason: string | undefined, kind: MediaKind | undefined): string {
  if (disabledReason) return disabledReason;
  const base = 'Analysis runs entirely on your device.';
  return kind === 'video'
    ? `${base} Video analysis can take several minutes. ${TAB_VISIBILITY_HINT}`
    : base;
}

/**
 * The Analyze button and, while a run is in progress, a progress bar + Stop control.
 * Reads the analysis lifecycle from {@link useAnalysis}.
 */
export function AnalyzeControls({ onAnalyze, disabledReason, advisory, kind }: Props) {
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
        {kind === 'video' && <p className="analyze__note">{TAB_VISIBILITY_HINT}</p>}
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
      <p className="analyze__note">{analyzeNote(disabledReason, kind)}</p>
    </div>
  );
}
