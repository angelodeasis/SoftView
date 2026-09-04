import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { SensoryEvent } from '../../core/events/model';
import { EventTimeline } from './EventTimeline';

const event = (id: string, startTime: number, endTime: number): SensoryEvent => ({
  id,
  channel: 'visual',
  kind: 'flashing',
  startTime,
  endTime,
  peakTime: (startTime + endTime) / 2,
  severityScore: 0.8,
  severity: 'high',
  confidence: 0.7,
  metrics: {},
});

describe('EventTimeline', () => {
  it('renders one marker per event, positioned by time', () => {
    const { container } = render(
      <EventTimeline
        events={[event('a', 0, 10), event('b', 50, 60)]}
        durationSec={100}
        onSeek={vi.fn()}
      />,
    );
    const marks = container.querySelectorAll('.timeline__mark');
    expect(marks).toHaveLength(2);
    expect((marks[1] as HTMLElement).style.left).toBe('50%');
  });

  it('seeks to just before the event start (not the peak) when a marker is clicked', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <EventTimeline events={[event('a', 20, 30)]} durationSec={100} onSeek={onSeek} />,
    );
    fireEvent.click(container.querySelector('.timeline__mark')!);
    expect(onSeek).toHaveBeenCalledWith(19.8);
  });

  it('renders nothing without a positive duration', () => {
    const { container } = render(
      <EventTimeline events={[event('a', 1, 2)]} durationSec={0} onSeek={vi.fn()} />,
    );
    expect(container.querySelector('.timeline')).toBeNull();
  });

  it('renders a live playhead only when a ref is passed, attached to the given element', () => {
    const without = render(
      <EventTimeline events={[event('a', 0, 10)]} durationSec={100} onSeek={vi.fn()} />,
    );
    expect(without.container.querySelector('.timeline__playhead')).toBeNull();
    without.unmount();

    const playheadRef = createRef<HTMLDivElement>();
    const { container } = render(
      <EventTimeline
        events={[event('a', 0, 10)]}
        durationSec={100}
        onSeek={vi.fn()}
        playheadRef={playheadRef}
      />,
    );
    const playhead = container.querySelector('.timeline__playhead');
    expect(playhead).not.toBeNull();
    expect(playheadRef.current).toBe(playhead);
  });
});
