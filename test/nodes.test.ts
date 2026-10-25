/**
 * The nodes end to end on synthetic hands: drawing a circle with a pinch emits an edit with a drum; a
 * pinch on that drum drags it and dropping it off the frame deletes it; in play mode a tap is a hit the
 * voice strikes at the piece's note; the reporter writes each edit once into the dial; the overlay draws.
 */
import { describe, expect, it } from 'vitest';
import { drawnHandsNode, type DrawnEdit, type DrawnScene } from '@thoremin/ext-draw/nodes/drawn_hands';
import { drawnVoiceNode, DRAWN_SINK_RESOURCE } from '@thoremin/ext-draw/nodes/drawn_voice';
import { makeDrawnReporter } from '@thoremin/ext-draw/app/drawnStatus';
import { piecesElement } from '@thoremin/ext-draw/nodes/overlay/pieces';
import type { ContactEvent } from '@thoremin/ext-draw/lib/contact';
import type { Piece } from '@thoremin/ext-draw/schema';
import { makeRecordingCanvas } from '../helpers/canvas';
import { circlePath, frameOf, handAt } from './synthetic';

const ctxAt = (tick: number, resources: Record<string, unknown> = {}) => ({ tick, time: tick / 30, dt: 1 / 30, resources });
type Out = { scene: DrawnScene; edits: DrawnEdit | null; contacts: ContactEvent[] };

function drawCircle() {
  const node = drawnHandsNode.make(drawnHandsNode.params!.parse({}));
  const config = { enabled: true, mode: 'shape', pieces: [] as Piece[] };
  const path = circlePath(0.5, 0.5, 0.12);
  const outs: Out[] = [];
  let tick = 0;
  // Open hand at the start, pinch along the path, open again.
  for (let i = 0; i < 3; i++) outs.push(node.process({ hands: frameOf([handAt(path[0]![0], path[0]![1])]), config }, ctxAt(tick++)) as Out);
  for (const [x, y] of path) outs.push(node.process({ hands: frameOf([handAt(x, y, { pinch: true })]), config }, ctxAt(tick++)) as Out);
  for (let i = 0; i < 4; i++) outs.push(node.process({ hands: frameOf([handAt(path[0]![0], path[0]![1])]), config }, ctxAt(tick++)) as Out);
  return { node, outs, tick };
}

describe('drawn-hands', () => {
  it('a pinched closed stroke becomes a drum, emitted once as an edit', () => {
    const { outs } = drawCircle();
    expect(outs.some((o) => o.scene.ink.length > 0)).toBe(true);
    const edit = outs[outs.length - 1]!.edits!;
    expect(edit.what).toBe('add');
    expect(edit.pieces).toHaveLength(1);
    expect(edit.pieces[0]!.kind).toBe('drum');
    expect(edit.pieces[0]!.x).toBeCloseTo(0.5, 1);
  });

  it('a pinch on a piece drags it; dropped off the frame, it is deleted', () => {
    const { outs } = drawCircle();
    const pieces = outs[outs.length - 1]!.edits!.pieces;
    const node = drawnHandsNode.make(drawnHandsNode.params!.parse({}));
    const config = { enabled: true, mode: 'shape', pieces };
    let tick = 0;
    const run = (x: number, y: number, pinch: boolean) => node.process({ hands: frameOf([handAt(x, y, { pinch })]), config }, ctxAt(tick++)) as Out;
    run(0.5, 0.5, false);
    run(0.5, 0.5, false);
    for (let i = 0; i < 3; i++) run(0.5, 0.5, true);
    const mid = run(0.7, 0.5, true);
    expect(mid.scene.pieces[0]!.x).toBeGreaterThan(0.6);
    expect(mid.scene.pointers[0]!.holding).toBe(pieces[0]!.id);
    for (let i = 0; i < 12; i++) run(0.7 + i * 0.05, 0.5, true);
    let last = run(1.3, 0.5, false);
    last = run(1.3, 0.5, false);
    expect(last.edits!.what).toBe('delete');
    expect(last.edits!.pieces).toHaveLength(0);
  });

  it('in play mode a tap that stops on the drum is a hit, and the voice strikes it', () => {
    const { outs } = drawCircle();
    const pieces = outs[outs.length - 1]!.edits!.pieces;
    const node = drawnHandsNode.make(drawnHandsNode.params!.parse({}));
    const config = { enabled: true, mode: 'play', pieces, volume: 1 };
    const contacts: ContactEvent[] = [];
    let tick = 0;
    for (const y of [0.3, 0.38, 0.44, 0.5, 0.5, 0.5]) contacts.push(...(node.process({ hands: frameOf([handAt(0.5, y)]), config }, ctxAt(tick++)) as Out).contacts);
    expect(contacts.filter((c) => c.kind === 'hit')).toHaveLength(1);

    const struck: { timbre: string; midi: number; gain: number }[] = [];
    const sink = { strike: (timbre: string, midi: number, c: { gain: number }) => struck.push({ timbre, midi, gain: c.gain }), hold() {}, release() {}, close() {} };
    const voice = drawnVoiceNode.make(drawnVoiceNode.params!.parse({}));
    voice.process({ contacts, config, scale: [60, 62, 64, 65, 67], mute: false }, ctxAt(0, { [DRAWN_SINK_RESOURCE]: () => sink }));
    expect(struck).toHaveLength(1);
    expect(struck[0]!.timbre).toBe('skin');
    expect([60, 62, 64, 65, 67]).toContain(struck[0]!.midi);
    expect(struck[0]!.gain).toBeGreaterThan(0);
  });

  it('is silent and drawless while off', () => {
    const node = drawnHandsNode.make(drawnHandsNode.params!.parse({}));
    const out = node.process({ hands: frameOf([handAt(0.5, 0.5, { pinch: true })]), config: { enabled: false } }, ctxAt(0)) as Out;
    expect(out.scene.pointers).toHaveLength(0);
    expect(out.contacts).toHaveLength(0);
  });
});

describe('the reporter and the overlay', () => {
  it('writes each edit into the dial once, not the edits of an earlier engine', () => {
    const { outs } = drawCircle();
    const last = outs[outs.length - 1]!;
    const writes: unknown[][] = [];
    let edits: DrawnEdit | null = { ...last.edits!, seq: 1 };
    const engine = { getOutput: (_n: string, port: string) => (port === 'edits' ? edits : last.scene) };
    const report = makeDrawnReporter(engine, (pieces) => writes.push([...pieces]), { report() {} });
    report();
    expect(writes).toHaveLength(0);
    edits = { ...last.edits!, seq: 2 };
    report();
    report();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(1);
  });

  it('draws the pieces flat without WebGL, plus the hint', () => {
    const { outs } = drawCircle();
    const pieces = outs[outs.length - 1]!.edits!.pieces;
    const rc = makeRecordingCanvas();
    const g = rc.canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    const scene: DrawnScene = { mode: 'play', pieces, ink: [], pointers: [{ hand: 'Right', p: [0.5, 0.5], down: false, holding: null }], touching: [] };
    const memo: Record<string, unknown> = {};
    const frame = { W: 1280, H: 720, t: 1 };
    piecesElement.update!(frame, { scene, contacts: [] }, memo);
    piecesElement.draw(g, frame, { scene, contacts: [] }, memo);
    expect(rc.count('fill')).toBeGreaterThan(0);
    expect(rc.texts().some((t) => t.startsWith('Play mode'))).toBe(true);
  });
});
