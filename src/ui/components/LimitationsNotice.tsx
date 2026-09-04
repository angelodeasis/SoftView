import type { AnalysisResult } from '../../core/events/analysisResult';

/**
 * Always shown with a result. Surfaces the standing limitations and, when a run did not
 * finish, a prominent notice + the specific warnings.
 */
export function LimitationsNotice({ result }: { result: AnalysisResult }) {
  return (
    <section className="limitations" role="note" aria-labelledby="limitations-heading">
      <h3 id="limitations-heading">What this analysis can and cannot tell you</h3>

      {result.status === 'partial' && (
        <p className="limitations__partial">
          Some analysis did not finish, so these results may be incomplete.
        </p>
      )}

      {result.warnings.length > 0 && (
        <ul className="limitations__warnings">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <ul className="limitations__list">
        {result.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
