import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildAnalysisResult } from '../../core/events/analysisResult';
import type { AnalyzerRun } from '../../core/events/analysisResult';
import type { MediaFacts } from '../../core/media/types';
import type { RawEvent } from '../../core/events/model';
import { ResultsPanel } from './ResultsPanel';

const media: MediaFacts = {
  name: 'clip.mp4',
  sizeBytes: 1000,
  mimeType: 'video/mp4',
  kind: 'video',
  durationSec: 120,
};
const okRun: AnalyzerRun = {
  analyzerId: 'visual-flash',
  version: '1',
  params: {},
  durationMs: 5,
  sampleCount: 10,
  status: 'ok',
};
const raw = (over: Partial<RawEvent>): RawEvent => ({
  channel: 'visual',
  kind: 'flashing',
  startTime: 30,
  endTime: 33,
  peakTime: 31,
  severityScore: 0.8,
  confidence: 0.7,
  metrics: {},
  ...over,
});

describe('ResultsPanel', () => {
  it('summarizes the event count and shows list + timeline + limitations', () => {
    const result = buildAnalysisResult({
      media,
      runs: [okRun],
      rawEvents: [
        raw({ startTime: 30, endTime: 33 }),
        raw({ startTime: 90, endTime: 91, kind: 'luminance-spike' }),
      ],
      durationSec: 120,
    });
    const { container } = render(<ResultsPanel result={result} onSeek={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: /potential sensory events \(2\)/i }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.timeline__mark')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /jump to this moment/i })).toHaveLength(2);
    expect(screen.getByText(/what this analysis can and cannot tell you/i)).toBeInTheDocument();
  });

  it('marks a partial result as incomplete', () => {
    const result = buildAnalysisResult({
      media,
      runs: [okRun, { ...okRun, analyzerId: 'audio-loudness', status: 'failed' }],
      rawEvents: [],
      durationSec: 120,
    });
    render(<ResultsPanel result={result} onSeek={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/incomplete/i);
    expect(screen.getByText(/some analysis did not finish/i)).toBeInTheDocument();
  });
});
