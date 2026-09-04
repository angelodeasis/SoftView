import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MediaPlayer } from './MediaPlayer';

describe('MediaPlayer', () => {
  it('renders a video element for video kind', () => {
    render(<MediaPlayer src="blob:x" kind="video" label="Preview of clip.mp4" />);
    expect(screen.getByLabelText('Preview of clip.mp4').tagName).toBe('VIDEO');
  });

  it('renders an audio element for audio kind', () => {
    render(<MediaPlayer src="blob:x" kind="audio" label="Preview of song.mp3" />);
    expect(screen.getByLabelText('Preview of song.mp3').tagName).toBe('AUDIO');
  });

  it('shows a fallback message and drops the ref when the element errors', () => {
    const ref = createRef<HTMLVideoElement | HTMLAudioElement>();
    render(<MediaPlayer ref={ref} src="blob:x" kind="video" label="Preview of clip.mp4" />);

    fireEvent.error(screen.getByLabelText('Preview of clip.mp4'));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be played back/i);
    expect(screen.queryByLabelText('Preview of clip.mp4')).not.toBeInTheDocument();
    expect(ref.current).toBeNull();
  });
});
