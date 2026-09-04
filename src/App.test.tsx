import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildAnalysisResult } from './core/events/analysisResult';
import type { RawEvent } from './core/events/model';
import { AnalysisProvider } from './state/analysisStore';
import type { MediaAnalysisInput } from './runtime/runMediaAnalysis';
import { App } from './App';

vi.mock('./media/probeMetadata', () => ({
  probeMetadata: vi.fn().mockResolvedValue({ durationSec: 42 }),
}));

const flashEvent: RawEvent = {
  channel: 'visual',
  kind: 'flashing',
  startTime: 10,
  endTime: 13,
  peakTime: 11,
  severityScore: 0.8,
  confidence: 0.7,
  metrics: {},
};

function renderApp(run: (input: MediaAnalysisInput) => Promise<ReturnType<typeof buildResult>>) {
  return render(
    <AnalysisProvider run={run}>
      <App />
    </AnalysisProvider>,
  );
}

const buildResult = (input: MediaAnalysisInput) =>
  buildAnalysisResult({
    media: input.media,
    runs: [
      {
        analyzerId: 'audio-loudness',
        version: '1',
        params: {},
        durationMs: 5,
        sampleCount: 1,
        status: 'ok',
      },
    ],
    rawEvents: [flashEvent],
    durationSec: input.durationSec,
  });

function chooseMp3() {
  fireEvent.change(screen.getByLabelText(/choose an mp4 or mp3 file/i), {
    target: { files: [new File([new Uint8Array(64)], 'song.mp3', { type: 'audio/mpeg' })] },
  });
}

describe('App', () => {
  it('goes select → analyze → results', async () => {
    const run = vi.fn((input: MediaAnalysisInput) => Promise.resolve(buildResult(input)));
    renderApp(run);

    chooseMp3();
    const analyze = await screen.findByRole('button', { name: /analyze this file/i });
    await waitFor(() => expect(analyze).toBeEnabled()); // enabled once the probe returns a duration

    fireEvent.click(analyze);

    expect(
      await screen.findByRole('heading', { name: /potential sensory events \(1\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rapid flashing/i })).toBeInTheDocument();
    expect(screen.getByText(/what this analysis can and cannot tell you/i)).toBeInTheDocument();
    expect(run).toHaveBeenCalledOnce();
  });

  it('does not analyze until a file is selected', () => {
    renderApp(vi.fn());
    expect(screen.queryByRole('button', { name: /analyze/i })).not.toBeInTheDocument();
  });

  it('starts and exits Assisted Viewing from the results view', async () => {
    const run = vi.fn((input: MediaAnalysisInput) => Promise.resolve(buildResult(input)));
    renderApp(run);

    chooseMp3();
    const analyze = await screen.findByRole('button', { name: /analyze this file/i });
    await waitFor(() => expect(analyze).toBeEnabled());
    fireEvent.click(analyze);
    await screen.findByRole('heading', { name: /potential sensory events/i });

    fireEvent.click(screen.getByRole('button', { name: /start assisted viewing/i }));
    expect(screen.getByRole('heading', { name: /assisted viewing/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /potential sensory events/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /exit assisted viewing/i }));
    expect(
      await screen.findByRole('heading', { name: /potential sensory events/i }),
    ).toBeInTheDocument();
  });
});
