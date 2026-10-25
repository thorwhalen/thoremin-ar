/**
 * Regressions from the first review: a held touch is released by a hit on it, by leaving play mode and
 * under the mute; two hands with the same label keep separate states; a line drawn back on itself is a
 * string, not an untouchable drum.
 */
import { describe, expect, it } from 'vitest';
import { createContactDetector, type StrikerSample } from '@thoremin/ext-draw/lib/contact';
import { pieceFromStroke } from '@thoremin/ext-draw/lib/scene';
import { drawnHandsNode, type DrawnScene } from '@thoremin/ext-draw/nodes/drawn_hands';
import { drawnVoiceNode, DRAWN_SINK_RESOURCE } from '@thoremin/ext-draw/nodes/drawn_voice';
import type { ContactEvent } from '@thoremin/ext-draw/lib/contact';
import { circlePath, frameOf, handAt } from './synthetic';

const drum = pieceFromStroke(circlePath(0.5, 0.5, 0.1), { id: 'd', depth: 0.5, shape: 1 })!;
const at = (t: number, x: number, y: number): StrikerSample => ({ hand: 'Right', t, p: [x, y], handSize: 0.1, depth: 0.5 });
const opts = { hitSpeed: 4, depthMatch: false };
const ctxAt = (tick: number, resources: Record<string, unknown> = {}) => ({ tick, time: tick / 30, dt: 1 / 30, resources });

describe('review fixes', () => {
  it('a hit on a held touch releases it first', () => {
    const d = createContactDetector();
    const evs: ContactEvent[] = [];
    let i = 0;
    for (; i < 12; i++) evs.push(...d.update(i / 30, [at(i / 30, 0.5, 0.45)], [drum], opts));
    // A fast flick that stops on the drum.
    for (const y of [0.35, 0.45, 0.55, 0.551]) evs.push(...d.update(i / 30, [at(i++ / 30, 0.5, y)], [drum], opts));
    const kinds = evs.map((e) => e.kind);
    expect(kinds.indexOf('release')).toBeGreaterThan(kinds.indexOf('touch'));
    expect(kinds.indexOf('release')).toBeLessThan(kinds.indexOf('hit'));
  });

  it('leaving play mode releases a held touch', () => {
    const node = drawnHandsNode.make(drawnHandsNode.params!.parse({}));
    const play = { enabled: true, mode: 'play', pieces: [drum] };
    const out: ContactEvent[] = [];
    for (let i = 0; i < 12; i++) out.push(...(node.process({ hands: frameOf([handAt(0.5, 0.5 + i * 0.0003)]), config: play }, ctxAt(i)) as { contacts: ContactEvent[] }).contacts);
    expect(out.map((c) => c.kind)).toEqual(['touch']);
    const after = node.process({ hands: frameOf([handAt(0.5, 0.5)]), config: { ...play, mode: 'shape' } }, ctxAt(13)) as { contacts: ContactEvent[] };
    expect(after.contacts.map((c) => c.kind)).toEqual(['release']);
  });

  it('two hands labelled alike get two pointers', () => {
    const node = drawnHandsNode.make(drawnHandsNode.params!.parse({}));
    const out = node.process({ hands: frameOf([handAt(0.2, 0.5), handAt(0.8, 0.5)]), config: { enabled: true, mode: 'play', pieces: [] } }, ctxAt(0)) as { scene: DrawnScene };
    expect(new Set(out.scene.pointers.map((p) => p.hand)).size).toBe(2);
  });

  it('a line drawn back on itself is a string', () => {
    const there: [number, number][] = Array.from({ length: 20 }, (_, k) => [0.2 + k * 0.02, 0.5]);
    const back = [...there, ...[...there].reverse()];
    expect(pieceFromStroke(back, { id: 'x', depth: 0.5, shape: 0.5 })!.kind).toBe('string');
  });

  it('the mute releases held voices', () => {
    const released: string[] = [];
    let all = 0;
    const sink = { strike() {}, hold() {}, release: (k: string) => released.push(k), releaseAll: () => void all++, close() {} };
    const voice = drawnVoiceNode.make(drawnVoiceNode.params!.parse({}));
    const res = { [DRAWN_SINK_RESOURCE]: () => sink };
    const touch: ContactEvent = { t: 0, piece: 'd', kind: 'touch', hand: 'Right', speed: 0.1, sharpness: 0, where: 0.2, angle: 0, x: 0.5, y: 0.5 };
    voice.process({ contacts: [touch], config: { pieces: [drum] }, scale: [60], mute: false }, ctxAt(0, res));
    voice.process({ contacts: [], config: { pieces: [drum] }, scale: [60], mute: true }, ctxAt(1, res));
    expect(all).toBe(1);
  });
});
