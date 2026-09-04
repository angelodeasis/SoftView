import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildAnalysisResult } from '../core/events/analysisResult';
import type { MediaFacts } from '../core/media/types';
import { AnalysisProvider, useAnalysis } from './analysisStore';

const media: MediaFacts = {
  name: 'song.mp3',
  sizeBytes: 1000,
  mimeType: 'audio/mpeg',
  kind: 'audio',
  durationSec: 30,
};
const input = { file: new Blob(), kind: 'audio' as const, media, durationSec: 30 };
const result = () => buildAnalysisResult({ media, runs: [], rawEvents: [], durationSec: 30 });

const wrapper = (run: Parameters<typeof AnalysisProvider>[0]['run']) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <AnalysisProvider run={run}>{children}</AnalysisProvider>;
  };

describe('useAnalysis', () => {
  it('drives idle → running → done', async () => {
    const run = vi.fn(() => Promise.resolve(result()));
    const { result: hook } = renderHook(() => useAnalysis(), { wrapper: wrapper(run) });

    expect(hook.current.state.status).toBe('idle');
    act(() => hook.current.analyze(input));
    expect(hook.current.state.status).toBe('running');
    await waitFor(() => expect(hook.current.state.status).toBe('done'));
  });

  it('forwards progress updates while running', async () => {
    let emit: (u: { fraction: number; label: string }) => void = () => {};
    const run = vi.fn(
      (_i, progress) =>
        new Promise<ReturnType<typeof result>>(() => {
          emit = progress!.onProgress!;
        }),
    );
    const { result: hook } = renderHook(() => useAnalysis(), { wrapper: wrapper(run) });

    act(() => hook.current.analyze(input));
    act(() => emit({ fraction: 0.4, label: 'Analyzing video…' }));
    expect(hook.current.state).toMatchObject({ status: 'running', fraction: 0.4 });
  });

  it('cancel aborts the run and returns to idle, ignoring a late resolution', async () => {
    let resolveRun: (r: ReturnType<typeof result>) => void = () => {};
    let capturedSignal: AbortSignal | undefined;
    const run = vi.fn((_i, progress) => {
      capturedSignal = progress!.signal;
      return new Promise<ReturnType<typeof result>>((res) => {
        resolveRun = res;
      });
    });
    const { result: hook } = renderHook(() => useAnalysis(), { wrapper: wrapper(run) });

    act(() => hook.current.analyze(input));
    act(() => hook.current.cancel());

    expect(capturedSignal?.aborted).toBe(true);
    expect(hook.current.state.status).toBe('idle');

    await act(async () => resolveRun(result()));
    expect(hook.current.state.status).toBe('idle');
  });

  it('surfaces a rejected run as an error', async () => {
    const run = vi.fn(() => Promise.reject(new Error('worker failed')));
    const { result: hook } = renderHook(() => useAnalysis(), { wrapper: wrapper(run) });
    act(() => hook.current.analyze(input));
    await waitFor(() =>
      expect(hook.current.state).toMatchObject({ status: 'error', message: 'worker failed' }),
    );
  });

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useAnalysis();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/AnalysisProvider/);
    expect(screen.queryByText(/./)).toBeNull();
  });
});
