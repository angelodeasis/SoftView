import { describe, expect, it } from 'vitest';
import type { SensoryEvent, Severity } from '../events/model';
import {
  DEFAULT_AUDIO_TARGETS,
  DEFAULT_SATURATION_TARGETS,
  DEFAULT_VISUAL_TARGETS,
  mitigationAt,
} from './envelope';

const event = (over: Partial<SensoryEvent> = {}): SensoryEvent => ({
  id: 'x',
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 10,
  endTime: 12,
  severityScore: 0.5,
  severity: 'moderate',
  confidence: 0.6,
  metrics: {},
  ...over,
});

describe('mitigationAt', () => {
  it('is a no-op far from any event', () => {
    const level = mitigationAt([event({ startTime: 10, endTime: 12 })], 0);
    expect(level).toMatchObject({ volume: 1, brightness: 1, saturation: 1 });
    expect(level.activeAudioEvent).toBeUndefined();
    expect(level.activeVisualEvent).toBeUndefined();
  });

  it('applies the full severity target inside the hold region', () => {
    const level = mitigationAt([event({ startTime: 10, endTime: 12, severity: 'moderate' })], 11);
    expect(level.volume).toBeCloseTo(DEFAULT_AUDIO_TARGETS.moderate, 5);
    expect(level.brightness).toBe(1); // audio event doesn't touch brightness
    expect(level.activeAudioEvent?.id).toBe('x');
  });

  it('ramps linearly through the lead-in fade', () => {
    const target = DEFAULT_AUDIO_TARGETS.moderate;
    const level = mitigationAt(
      [event({ startTime: 10, endTime: 12 })],
      9.25, // halfway through the default 1.5s fade before startTime
    );
    expect(level.volume).toBeCloseTo(1 - 0.5 * (1 - target), 5);
  });

  it('ramps back up symmetrically through the lead-out fade', () => {
    const target = DEFAULT_AUDIO_TARGETS.moderate;
    const level = mitigationAt([event({ startTime: 10, endTime: 12 })], 12.75);
    expect(level.volume).toBeCloseTo(1 - 0.5 * (1 - target), 5);
  });

  it('is exactly the full reduction right at the start boundary', () => {
    const level = mitigationAt([event({ startTime: 10, endTime: 12, severity: 'high' })], 10);
    expect(level.volume).toBeCloseTo(DEFAULT_AUDIO_TARGETS.high, 5);
  });

  it('lets the deepest overlapping cut win', () => {
    const events = [
      event({ id: 'mild', startTime: 10, endTime: 14, severity: 'low' }),
      event({ id: 'severe', startTime: 11, endTime: 12, severity: 'high' }),
    ];
    const level = mitigationAt(events, 11.5);
    expect(level.volume).toBeCloseTo(DEFAULT_AUDIO_TARGETS.high, 5);
    expect(level.activeAudioEvent?.id).toBe('severe');
  });

  it('dims brightness for visual events but never for scene-change', () => {
    const flash = event({
      id: 'flash',
      channel: 'visual',
      kind: 'flashing',
      startTime: 5,
      endTime: 6,
      severity: 'high',
    });
    const cut = event({
      id: 'cut',
      channel: 'visual',
      kind: 'scene-change',
      startTime: 5,
      endTime: 6,
      severity: 'high',
    });

    const withFlash = mitigationAt([flash], 5.5);
    expect(withFlash.brightness).toBeCloseTo(DEFAULT_VISUAL_TARGETS.high, 5);
    expect(withFlash.saturation).toBeCloseTo(DEFAULT_SATURATION_TARGETS.high, 5);
    expect(withFlash.volume).toBe(1); // channel isolation

    const withSceneChange = mitigationAt([cut], 5.5);
    expect(withSceneChange.brightness).toBe(1);
    expect(withSceneChange.saturation).toBe(1);
    expect(withSceneChange.activeVisualEvent).toBeUndefined();
  });

  it('goes fully grayscale at high severity, and follows brightness partway through a fade', () => {
    const flash = event({
      channel: 'visual',
      kind: 'flashing',
      startTime: 5,
      endTime: 6,
      severity: 'high',
    });

    const held = mitigationAt([flash], 5.5);
    expect(held.saturation).toBeCloseTo(0, 5);

    const fadingIn = mitigationAt([flash], 4.25); // halfway through the lead-in fade
    expect(fadingIn.saturation).toBeCloseTo(1 - 0.5 * (1 - DEFAULT_SATURATION_TARGETS.high), 5);
    expect(fadingIn.brightness).toBeCloseTo(1 - 0.5 * (1 - DEFAULT_VISUAL_TARGETS.high), 5);
  });

  it('scales saturation by severity for lower buckets too', () => {
    const flash = event({
      channel: 'visual',
      kind: 'flashing',
      startTime: 5,
      endTime: 6,
      severity: 'low',
    });
    const level = mitigationAt([flash], 5.5);
    expect(level.saturation).toBeCloseTo(DEFAULT_SATURATION_TARGETS.low, 5);
  });

  it('supports custom targets and fade duration', () => {
    const targets: Record<Severity, number> = { low: 0.9, moderate: 0.9, high: 0.9 };
    const level = mitigationAt([event({ startTime: 10, endTime: 12 })], 11, {
      fadeSec: 0.1,
      audioTargets: targets,
    });
    expect(level.volume).toBeCloseTo(0.9, 5);
  });

  it('treats a zero fade as an instant step', () => {
    const level = mitigationAt([event({ startTime: 10, endTime: 12 })], 9.99, { fadeSec: 0 });
    expect(level.volume).toBe(1);
  });
});
