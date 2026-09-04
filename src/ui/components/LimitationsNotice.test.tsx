import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BASE_LIMITATIONS, buildAnalysisResult } from '../../core/events/analysisResult';
import type { AnalyzerRun } from '../../core/events/analysisResult';
import type { MediaFacts } from '../../core/media/types';
import { LimitationsNotice } from './LimitationsNotice';

const media: MediaFacts = {
  name: 'clip.mp4',
  sizeBytes: 1000,
  mimeType: 'video/mp4',
  kind: 'video',
  durationSec: 60,
};
const okRun: AnalyzerRun = {
  analyzerId: 'audio-loudness',
  version: '1',
  params: {},
  durationMs: 5,
  sampleCount: 10,
  status: 'ok',
};

describe('LimitationsNotice', () => {
  it('always lists the base limitations', () => {
    render(
      <LimitationsNotice
        result={buildAnalysisResult({ media, runs: [okRun], rawEvents: [], durationSec: 60 })}
      />,
    );
    for (const line of BASE_LIMITATIONS) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });

  it('shows a partial notice and the warnings when a run did not finish', () => {
    render(
      <LimitationsNotice
        result={buildAnalysisResult({
          media,
          runs: [okRun, { ...okRun, analyzerId: 'visual-flash', status: 'skipped' }],
          rawEvents: [],
          durationSec: 60,
          warnings: ['Part of the video (2:10–2:19) could not be re-scanned in detail.'],
        })}
      />,
    );
    expect(screen.getByText(/some analysis did not finish/i)).toBeInTheDocument();
    expect(screen.getByText(/could not be re-scanned in detail/i)).toBeInTheDocument();
  });
});
