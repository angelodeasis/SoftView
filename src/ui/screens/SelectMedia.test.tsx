import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaDescriptor } from '../../media/MediaDescriptor';
import { SelectMedia } from './SelectMedia';

vi.mock('../../media/probeMetadata', () => ({
  probeMetadata: vi.fn().mockResolvedValue({ durationSec: 90 }),
}));

/** SelectMedia is controlled; this harness holds the descriptor like App does. */
function Harness({ onChange }: { onChange?: (d: MediaDescriptor) => void }) {
  const [descriptor, setDescriptor] = useState<MediaDescriptor | null>(null);
  return (
    <SelectMedia
      descriptor={descriptor}
      onSelect={(d) => {
        setDescriptor(d);
        onChange?.(d);
      }}
    />
  );
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText(/choose an mp4 or mp3 file/i), {
    target: { files: [file] },
  });
}

const mp3 = (name = 'song.mp3') => new File([new Uint8Array(1024)], name, { type: 'audio/mpeg' });

describe('SelectMedia', () => {
  it('renders the drop zone', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/choose an mp4 or mp3 file/i)).toBeInTheDocument();
  });

  it('rejects an unsupported file and shows no facts panel', () => {
    render(<Harness />);
    chooseFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/supports mp4 video and mp3 audio/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('accepts an MP3, showing the facts panel and the probed duration', async () => {
    render(<Harness />);
    chooseFile(mp3());

    const panel = await screen.findByRole('status');
    expect(panel).toHaveTextContent('song.mp3');
    await waitFor(() => expect(panel).toHaveTextContent('1:30'));
  });

  it('reports the selected descriptor to the parent', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    chooseFile(mp3('pick.mp3'));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const last = onChange.mock.calls.at(-1)![0] as MediaDescriptor;
    expect(last.facts.name).toBe('pick.mp3');
    expect(last.facts.durationSec).toBe(90);
  });

  it('clears a previous error when a valid file is chosen', async () => {
    render(<Harness />);
    chooseFile(new File(['x'], 'bad.mov', { type: 'video/quicktime' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    chooseFile(mp3('ok.mp3'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
