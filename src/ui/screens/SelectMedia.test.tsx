import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SelectMedia } from './SelectMedia';

vi.mock('../../media/probeMetadata', () => ({
  probeMetadata: vi.fn().mockResolvedValue({ durationSec: 90 }),
}));

function chooseFile(file: File) {
  const input = screen.getByLabelText(/choose an mp4 or mp3 file/i);
  fireEvent.change(input, { target: { files: [file] } });
}

const mp3 = (name = 'song.mp3') => new File([new Uint8Array(1024)], name, { type: 'audio/mpeg' });

describe('SelectMedia', () => {
  it('renders the drop zone', () => {
    render(<SelectMedia />);
    expect(screen.getByLabelText(/choose an mp4 or mp3 file/i)).toBeInTheDocument();
  });

  it('rejects an unsupported file and shows no facts panel', () => {
    render(<SelectMedia />);
    chooseFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/supports mp4 video and mp3 audio/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('accepts an MP3, showing the facts panel, player, and probed duration', async () => {
    render(<SelectMedia />);
    chooseFile(mp3());

    const panel = await screen.findByRole('status');
    expect(panel).toHaveTextContent('song.mp3');
    expect(screen.getByLabelText(/preview of song\.mp3/i)).toBeInTheDocument();
    await waitFor(() => expect(panel).toHaveTextContent('1:30'));
  });

  it('clears a previous error when a valid file is chosen', async () => {
    render(<SelectMedia />);
    chooseFile(new File(['x'], 'bad.mov', { type: 'video/quicktime' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    chooseFile(mp3('ok.mp3'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
