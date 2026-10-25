/**
 * The pinch tracker (hysteresis, debounce, grace, the pen-down anchor) and the contact detector (a tap that
 * stops on a drum is a hit, centre and rim told apart; a slow rest is a touch then a release; a swipe
 * across a string is a pluck at its place).
 */
import { describe, expect, it } from 'vitest';
import { createPinchTracker } from '@thoremin/ext-draw/lib/pinch';
import { createContactDetector, type StrikerSample } from '@thoremin/ext-draw/lib/contact';
import { pieceFromStroke } from '@thoremin/ext-draw/lib/scene';
import { circlePath } from './synthetic';

describe('pinch', () => {
  it('needs two frames to switch, keeps through a short loss, anchors before the close', () => {
    const p = createPinchTracker();
    const dt = 1 / 30;
    expect(p.update(0, 1, [0.1, 0.1]).down).toBe(false);
    expect(p.update(dt, 0.2, [0.2, 0.2]).down).toBe(false);
    const r = p.update(2 * dt, 0.2, [0.3, 0.3]);
    expect(r.edge).toBe('down');
    expect(r.anchor).toEqual([0.1, 0.1]);
    // Between the thresholds: still down (hysteresis).
    expect(p.update(3 * dt, 0.4, [0.3, 0.3]).down).toBe(true);
    // A dropped frame keeps it.
    expect(p.update(4 * dt, null, null).down).toBe(true);
    // A long loss releases.
    expect(p.update(4 * dt + 0.3, null, null).edge).toBe('up');
  });
});

describe('contact', () => {
  const drum = pieceFromStroke(circlePath(0.5, 0.5, 0.1), { id: 'd', depth: 0.5, shape: 1 })!;
  const string = pieceFromStroke([[0.2, 0.2], [0.5, 0.2], [0.8, 0.2]], { id: 's', depth: 0.5, shape: 0.5 })!;
  const at = (t: number, x: number, y: number): StrikerSample => ({ hand: 'Right', t, p: [x, y], handSize: 0.1, depth: 0.5 });
  const opts = { hitSpeed: 4, depthMatch: false };

  it('reads the pieces as a drum and a string', () => {
    expect(drum.kind).toBe('drum');
    expect(string.kind).toBe('string');
  });

  it('a fast downward stroke that stops on the drum is a hit; the centre is softer-edged than the rim', () => {
    const run = (x: number, yStop: number) => {
      const d = createContactDetector();
      const ys = [yStop - 0.15, yStop - 0.1, yStop - 0.05, yStop, yStop + 0.001];
      return ys.flatMap((y, i) => d.update(i / 30, [at(i / 30, x, y)], [drum], opts));
    };
    const centre = run(0.5, 0.5).filter((e) => e.kind === 'hit');
    expect(centre).toHaveLength(1);
    expect(centre[0]!.where).toBeLessThan(0.2);
    expect(centre[0]!.speed).toBeGreaterThan(0.3);
    const rim = run(0.5, 0.5 + 0.16).filter((e) => e.kind === 'hit');
    expect(rim[0]!.where).toBeGreaterThan(0.7);
  });

  it('a slow rest is a touch, and leaving releases it', () => {
    const d = createContactDetector();
    const evs = [];
    for (let i = 0; i < 15; i++) evs.push(...d.update(i / 30, [at(i / 30, 0.5, 0.5 + i * 0.0005)], [drum], opts));
    evs.push(...d.update(1, [at(1, 0.9, 0.9)], [drum], opts));
    expect(evs.map((e) => e.kind)).toEqual(['touch', 'release']);
  });

  it('a fast swipe across the string is a pluck where it crossed', () => {
    const d = createContactDetector();
    const evs = [at(0, 0.35, 0.15), at(1 / 30, 0.35, 0.25)].flatMap((s) => d.update(s.t, [s], [string], opts));
    expect(evs).toHaveLength(1);
    expect(evs[0]!.kind).toBe('pluck');
    expect(evs[0]!.where).toBeGreaterThan(0.15);
    expect(evs[0]!.where).toBeLessThan(0.35);
  });
});
