/**
 * Feel and Tone: at Feel 0 every stroke sounds the same; at Feel 1 a harder, sharper, rim stroke is louder,
 * brighter and higher; Tone moves the neutral point; the jitter is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { controlsFor } from '@thoremin/ext-draw/lib/feel';

const soft = { speed: 0.2, sharpness: 0.1, where: 0.1, angle: 0, t: 1, piece: 'p1' };
const hard = { speed: 0.9, sharpness: 0.9, where: 0.9, angle: 0, t: 2, piece: 'p1' };

describe('Feel and Tone', () => {
  it('Feel 0: every stroke the same', () => {
    expect(controlsFor(soft, { feel: 0, tone: 0.5 })).toEqual(controlsFor(hard, { feel: 0, tone: 0.5 }));
  });
  it('Feel 1: hard strokes louder, brighter, higher, shorter', () => {
    const a = controlsFor(soft, { feel: 1, tone: 0.5 });
    const b = controlsFor(hard, { feel: 1, tone: 0.5 });
    expect(b.gain).toBeGreaterThan(a.gain * 2);
    expect(b.brightness).toBeGreaterThan(a.brightness);
    expect(b.pitchCents).toBeGreaterThan(a.pitchCents);
    expect(b.decay).toBeLessThan(a.decay);
  });
  it('Tone: bright is brighter, noisier and shorter than dark', () => {
    const dark = controlsFor(soft, { feel: 0, tone: 0 });
    const bright = controlsFor(soft, { feel: 0, tone: 1 });
    expect(bright.brightness).toBeGreaterThan(dark.brightness);
    expect(bright.noise).toBeGreaterThan(dark.noise);
    expect(bright.decay).toBeLessThan(dark.decay);
  });
  it('the jitter replays exactly', () => {
    expect(controlsFor(hard, { feel: 0.7, tone: 0.5 })).toEqual(controlsFor(hard, { feel: 0.7, tone: 0.5 }));
  });
});
