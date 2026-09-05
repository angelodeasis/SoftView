/**
 * Cancellation and stall-detection for the frame-capture scan loops (`frameSampler.ts`).
 *
 * A real `<video>` can silently stop delivering frames or `seeked` events partway through
 * a scan (a decode hiccup, background-tab power throttling, ...) with no error and no
 * further callbacks — the scan loop just waits forever, and since it only checked
 * `signal.aborted` from inside its own callback, Stop couldn't even cancel it. Both
 * problems share one fix: react to abort and to "no progress" independently of whatever
 * event-driven loop is doing the actual work.
 *
 * Browser + Node compatible (only `setTimeout`/`AbortSignal`), so this part is unit-tested
 * directly, unlike the rest of `frameSampler.ts`.
 */

export function abortError(): Error {
  const err = new Error('Video analysis was cancelled.');
  err.name = 'AbortError';
  return err;
}

export function stallError(): Error {
  const err = new Error(
    'SoftView stopped getting new video frames partway through — playback may have stalled.',
  );
  err.name = 'MediaStallError';
  return err;
}

export interface StallGuardOptions {
  readonly signal?: AbortSignal;
  /** No `bump()` within this long settles the guard with a {@link stallError}. */
  readonly stallTimeoutMs: number;
}

/**
 * Runs `run`, which must call the `bump` it's given every time it makes real progress
 * (a frame captured, a seek completed). Settles early — regardless of what `run` is
 * doing — if `signal` aborts or `bump` hasn't been called for `stallTimeoutMs`.
 */
export function withStallGuard<T>(
  run: (bump: () => void) => Promise<T>,
  opts: StallGuardOptions,
): Promise<T> {
  const { signal, stallTimeoutMs } = opts;
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onAbort = () => settle(() => reject(abortError()));
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => settle(() => reject(stallError())), stallTimeoutMs);
    };

    signal?.addEventListener('abort', onAbort);
    bump();

    run(bump).then(
      (value) => settle(() => resolve(value)),
      (err: unknown) => settle(() => reject(err)),
    );
  });
}
