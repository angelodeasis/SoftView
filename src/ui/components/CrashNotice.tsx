interface Props {
  onReset: () => void;
}

/** The fallback shown by {@link ErrorBoundary} when something in the analysis/results
 * area crashes. */
export function CrashNotice({ onReset }: Props) {
  return (
    <div className="crash" role="alert">
      <h2>Something went wrong</h2>
      <p>
        SoftView hit an unexpected problem while analyzing or displaying this media. Your file was
        never uploaded — this was a local problem, not a data issue.
      </p>
      <button type="button" onClick={onReset}>
        Back to start
      </button>
    </div>
  );
}
