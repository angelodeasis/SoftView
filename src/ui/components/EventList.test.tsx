import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SensoryEvent } from '../../core/events/model';
import { EventList } from './EventList';

const event = (over: Partial<SensoryEvent> = {}): SensoryEvent => ({
  id: 'audio:loudness-spike:12000',
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 12,
  endTime: 13,
  peakTime: 12,
  severityScore: 0.5,
  severity: 'moderate',
  confidence: 0.7,
  metrics: { riseDb: 14 },
  ...over,
});

describe('EventList', () => {
  it('shows an empty-state note when there are no events', () => {
    render(<EventList events={[]} onSeek={vi.fn()} />);
    expect(screen.getByText(/no potential sensory events were detected/i)).toBeInTheDocument();
  });

  it('renders one seek button per event with a plain-language name', () => {
    render(<EventList events={[event()]} onSeek={vi.fn()} />);
    expect(
      screen.getByRole('button', {
        name: /0:12, Sudden loud sound, Moderate severity, likely — jump to this moment/i,
      }),
    ).toBeInTheDocument();
  });

  it('seeks to just before the event start (not the peak) when a row is activated', () => {
    // peakTime is a windowed statistic that can lag the true onset; seeking there could
    // land after (or past) the moment a listener would notice. startTime, with a small
    // lead-in, is what actually lets them hear/see it from the beginning.
    const onSeek = vi.fn();
    render(<EventList events={[event({ startTime: 12, peakTime: 12.8 })]} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole('button', { name: /jump to this moment/i }));
    expect(onSeek).toHaveBeenCalledWith(11.8);
  });

  it('exposes metrics in the details disclosure', () => {
    render(<EventList events={[event({ metrics: { riseDb: 14 } })]} onSeek={vi.fn()} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('riseDb')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });
});
