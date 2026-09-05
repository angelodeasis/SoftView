import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildAnalysisResult } from '../../core/events/analysisResult';
import type { MediaFacts } from '../../core/media/types';
import { AnalysisProvider, useAnalysis } from '../../state/analysisStore';
import type { MediaAnalysisInput } from '../../runtime/runMediaAnalysis';
import { AnalyzeControls } from './AnalyzeControls';

const media: MediaFacts = {
  name: 's.mp3',
  sizeBytes: 1,
  mimeType: 'audio/mpeg',
  kind: 'audio',
  durationSec: 10,
};
const input: MediaAnalysisInput = { file: new Blob(), kind: 'audio', media, durationSec: 10 };
const done = () => buildAnalysisResult({ media, runs: [], rawEvents: [], durationSec: 10 });

function Harness({ run }: { run: Parameters<typeof AnalysisProvider>[0]['run'] }) {
  return (
    <AnalysisProvider run={run}>
      <Inner />
    </AnalysisProvider>
  );
}
function Inner() {
  const { analyze } = useAnalysis();
  return <AnalyzeControls onAnalyze={() => analyze(input)} />;
}

describe('AnalyzeControls', () => {
  it('shows the Analyze button when idle', () => {
    render(<Harness run={() => Promise.resolve(done())} />);
    expect(screen.getByRole('button', { name: /analyze this file/i })).toBeEnabled();
  });

  it('disables the button and shows the reason when analysis is not possible', () => {
    render(
      <AnalysisProvider run={() => new Promise(() => {})}>
        <AnalyzeControls disabledReason="needs duration" />
      </AnalysisProvider>,
    );
    expect(screen.getByRole('button', { name: /analyze this file/i })).toBeDisabled();
    expect(screen.getByText('needs duration')).toBeInTheDocument();
  });

  it('shows a progress bar and a Stop button while running', () => {
    render(<Harness run={() => new Promise(() => {})} />);
    fireEvent.click(screen.getByRole('button', { name: /analyze this file/i }));

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop analysis/i })).toBeInTheDocument();
  });

  it('Stop returns to the Analyze button', () => {
    render(<Harness run={() => new Promise(() => {})} />);
    fireEvent.click(screen.getByRole('button', { name: /analyze this file/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop analysis/i }));
    expect(screen.getByRole('button', { name: /analyze this file/i })).toBeInTheDocument();
  });

  it('offers "Analyze again" after a completed run', async () => {
    render(<Harness run={() => Promise.resolve(done())} />);
    fireEvent.click(screen.getByRole('button', { name: /analyze this file/i }));
    expect(await screen.findByRole('button', { name: /analyze again/i })).toBeInTheDocument();
  });

  it('surfaces a run error', async () => {
    const run = vi.fn(() => Promise.reject(new Error('worker died')));
    render(<Harness run={run} />);
    fireEvent.click(screen.getByRole('button', { name: /analyze this file/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('worker died');
  });

  it('shows the advisory when one is passed', () => {
    render(
      <AnalysisProvider run={() => new Promise(() => {})}>
        <AnalyzeControls
          onAnalyze={vi.fn()}
          advisory={{ level: 'warn', message: 'This is a long file.' }}
        />
      </AnalysisProvider>,
    );
    expect(screen.getByText('This is a long file.')).toHaveClass('advisory--warn');
  });

  it('shows nothing extra when there is no advisory', () => {
    render(<Harness run={() => new Promise(() => {})} />);
    expect(document.querySelector('.advisory')).toBeNull();
  });

  it('hints to keep the tab visible for video, not audio', () => {
    const { rerender } = render(
      <AnalysisProvider run={() => new Promise(() => {})}>
        <AnalyzeControls onAnalyze={vi.fn()} kind="video" />
      </AnalysisProvider>,
    );
    expect(screen.getByText(/keep this tab open and visible/i)).toBeInTheDocument();

    rerender(
      <AnalysisProvider run={() => new Promise(() => {})}>
        <AnalyzeControls onAnalyze={vi.fn()} kind="audio" />
      </AnalysisProvider>,
    );
    expect(screen.queryByText(/keep this tab open and visible/i)).toBeNull();
  });

  it('repeats the tab-visibility hint while a video analysis is running', () => {
    function VideoInner() {
      const { analyze } = useAnalysis();
      return <AnalyzeControls onAnalyze={() => analyze(input)} kind="video" />;
    }
    render(
      <AnalysisProvider run={() => new Promise(() => {})}>
        <VideoInner />
      </AnalysisProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /analyze this file/i }));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText(/keep this tab open and visible/i)).toBeInTheDocument();
  });
});
