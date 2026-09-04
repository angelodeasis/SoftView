/**
 * The one piece of shared app state: the analysis lifecycle (idle → running → done /
 * error) plus progress. Context + `useReducer`, no state library.
 *
 * `runMediaAnalysis` is injected via the provider's `run` prop so the store is testable
 * without touching the adapters.
 */

/* eslint-disable react-refresh/only-export-components -- provider + hook belong together */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { AnalysisResult } from '../core/events/analysisResult';
import {
  runMediaAnalysis as defaultRun,
  type MediaAnalysisInput,
  type MediaAnalysisProgress,
} from '../runtime/runMediaAnalysis';

export type AnalysisState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly fraction: number; readonly label: string }
  | { readonly status: 'done'; readonly result: AnalysisResult }
  | { readonly status: 'error'; readonly message: string };

type Action =
  | { type: 'start' }
  | { type: 'progress'; fraction: number; label: string }
  | { type: 'complete'; result: AnalysisResult }
  | { type: 'error'; message: string }
  | { type: 'reset' };

function reducer(state: AnalysisState, action: Action): AnalysisState {
  switch (action.type) {
    case 'start':
      return { status: 'running', fraction: 0, label: 'Starting…' };
    case 'progress':
      return state.status === 'running'
        ? { status: 'running', fraction: action.fraction, label: action.label }
        : state;
    case 'complete':
      return { status: 'done', result: action.result };
    case 'error':
      return { status: 'error', message: action.message };
    case 'reset':
      return { status: 'idle' };
  }
}

export interface AnalysisApi {
  readonly state: AnalysisState;
  analyze(input: MediaAnalysisInput): void;
  cancel(): void;
  reset(): void;
}

const AnalysisContext = createContext<AnalysisApi | null>(null);

type RunFn = (
  input: MediaAnalysisInput,
  progress?: MediaAnalysisProgress,
) => Promise<AnalysisResult>;

export function AnalysisProvider({
  children,
  run = defaultRun,
}: {
  children: ReactNode;
  run?: RunFn;
}) {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const analyze = useCallback(
    (input: MediaAnalysisInput) => {
      stop();
      const runToken = (token.current += 1);
      const ctrl = new AbortController();
      controller.current = ctrl;
      dispatch({ type: 'start' });

      run(input, {
        onProgress: ({ fraction, label }) => {
          if (token.current === runToken) dispatch({ type: 'progress', fraction, label });
        },
        signal: ctrl.signal,
      }).then(
        (result) => {
          if (token.current === runToken) dispatch({ type: 'complete', result });
        },
        (err: unknown) => {
          if (token.current === runToken) {
            dispatch({
              type: 'error',
              message: err instanceof Error ? err.message : 'Analysis could not be completed.',
            });
          }
        },
      );
    },
    [run, stop],
  );

  const cancel = useCallback(() => {
    stop();
    dispatch({ type: 'reset' });
  }, [stop]);

  const api = useMemo<AnalysisApi>(
    () => ({ state, analyze, cancel, reset: cancel }),
    [state, analyze, cancel],
  );

  return <AnalysisContext.Provider value={api}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisApi {
  const api = useContext(AnalysisContext);
  if (!api) throw new Error('useAnalysis must be used within <AnalysisProvider>');
  return api;
}
