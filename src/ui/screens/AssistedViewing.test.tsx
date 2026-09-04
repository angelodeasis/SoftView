import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildAnalysisResult } from '../../core/events/analysisResult';
import type { MediaFacts } from '../../core/media/types';
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
});
