import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildAnalysisResult } from '../../core/events/analysisResult';
import type { MediaFacts } from '../../core/media/types';
import type { RawEvent } from '../../core/events/model';
import type { MediaDescriptor } from '../../media/MediaDescriptor';
import { AssistedViewing } from './AssistedViewing';

const facts: MediaFacts = {
  name: 'clip.mp4',
  sizeBytes: 1000,
  mimeType: 'video/mp4',
  kind: 'video',
  durationSec: 30,
};

const descriptor: MediaDescriptor = {
  file: new File([], 'clip.mp4'),
  kind: 'video',
  objectUrl: 'blob:softview/fake',
  facts,
  revoke: vi.fn(),
};

const result = buildAnalysisResult({
  media: facts,
  runs: [],
  rawEvents: [],
  durationSec: 30,
});

const flash: RawEvent = {
  channel: 'visual',
  kind: 'flashing',
  startTime: 10,
  endTime: 12,
  peakTime: 11,
  severityScore: 0.8,
  confidence: 0.7,
  metrics: {},
};
const resultWithEvents = buildAnalysisResult({
  media: facts,
  runs: [],
  rawEvents: [flash],
  durationSec: 30,
});

describe('AssistedViewing', () => {
  it('renders the player, a status line, and an exit control', () => {
    render(<AssistedViewing descriptor={descriptor} result={result} onExit={vi.fn()} />);

    expect(screen.getByLabelText(/assisted playback of clip\.mp4/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exit assisted viewing/i })).toBeInTheDocument();
  });

  it('calls onExit when the exit button is activated', () => {
    const onExit = vi.fn();
    render(<AssistedViewing descriptor={descriptor} result={result} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /exit assisted viewing/i }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('moves focus to its heading on mount, since it replaces the button that opened it', () => {
    render(<AssistedViewing descriptor={descriptor} result={result} onExit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /assisted viewing/i })).toHaveFocus();
  });

  it('shows the same coloured overview as the review screen, with a live playhead', () => {
    const { container } = render(
      <AssistedViewing descriptor={descriptor} result={resultWithEvents} onExit={vi.fn()} />,
    );
    expect(container.querySelectorAll('.timeline__mark')).toHaveLength(1);
    expect(container.querySelector('.timeline__playhead')).not.toBeNull();
  });

  it('seeks the assisted player when a timeline marker is clicked', () => {
    const { container } = render(
      <AssistedViewing descriptor={descriptor} result={resultWithEvents} onExit={vi.fn()} />,
    );
    const video = screen.getByLabelText(/assisted playback of clip\.mp4/i) as HTMLVideoElement;
    fireEvent.click(container.querySelector('.timeline__mark')!);
    expect(video.currentTime).toBeCloseTo(9.8, 5); // startTime (10) minus the 0.2s lead-in
  });
});
