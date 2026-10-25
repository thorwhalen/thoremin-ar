/**
 * `drawn-hands`: the hands against the scene of drawn pieces. In **Shape** mode a pinch draws (ink from
 * pen-down to release, which becomes a drum when it closes and a string when it does not) or, started on a
 * piece, grabs and moves it (dropped off the frame, it is deleted). In **Play** mode the index fingertips
 * strike, touch and pluck the pieces (`../lib/contact`). The scene's SSOT is the `drawn` dial: this node
 * never writes it, it emits each finished edit on `edits` (with a sequence number) and the extension's
 * status hook writes it, one atomic dial patch per edit, so undo and saving work as for any dial.
 */
import { z } from 'zod';
import { defineNode, type NodeContext } from '@thoremin/dag';
import type { HandsFrame } from '@thoremin/sdk/nodes/domain';
import { frameTime } from '@thoremin/sdk/nodes/domain';
import { DrawnDialSchema, type DrawnDialParams, type Piece } from '../schema';
import type { Vec2 } from '../lib/geometry';
import { dist } from '../lib/geometry';
import { createContactDetector, type ContactEvent, type StrikerSample } from '../lib/contact';
import { createOneEuro2D, createPinchTracker, displayOf, LM, palmDepth, pinchRatio } from '../lib/pinch';
import { isOffFrame, movedBy, newPieceId, pieceAt, pieceFromStroke } from '../lib/scene';

/** What the overlay draws: the scene as it is this frame (a dragged piece where the hand has it). */
export interface DrawnScene {
  mode: DrawnDialParams['mode'];
  pieces: Piece[];
  /** Strokes being drawn, one per pinching hand. */
  ink: Vec2[][];
  /** Each hand's pointer: where it is, whether it pinches, what it holds. */
  pointers: { hand: string; p: Vec2; down: boolean; holding: string | null }[];
  /** Pieces a hand touches right now. */
  touching: string[];
}

/** A finished edit for the status hook to write into the dial. */
export interface DrawnEdit {
  seq: number;
  pieces: Piece[];
  /** What happened, for the toast and the undo label. */
  what: 'add' | 'move' | 'delete';
}

/** Ink points closer than this (display fractions) to the previous one are skipped. */
const INK_STEP = 0.004;

const Params = z.object({});
type Params = z.infer<typeof Params>;

interface HandState {
  pinch: ReturnType<typeof createPinchTracker>;
  pointFilter: ReturnType<typeof createOneEuro2D>;
  tipFilter: ReturnType<typeof createOneEuro2D>;
  ink: Vec2[] | null;
  /** The piece held, and where its centre sits relative to the pinch point (absolute, so a dial change mid-drag cannot make it drift). */
  grab: { id: string; offset: Vec2 } | null;
  depth: number;
}

export const drawnHandsNode = defineNode<Params>({
  type: 'drawn-hands',
  roles: ['feature', 'mapping'],
  title: 'Drawn pieces: hands',
  description: 'Shape mode: a pinch draws a piece (closed is a drum, open a string) or grabs and moves one. Play mode: the fingertips hit, touch and pluck the pieces. Emits the live scene, finished edits for the dial, and contact events for the voice.',
  inputs: [
    { name: 'hands', kind: 'hands-frame' },
    { name: 'config', kind: 'drawn-pieces-config' },
  ],
  outputs: [
    { name: 'scene', kind: 'drawn-scene' },
    { name: 'edits', kind: 'drawn-edit' },
    { name: 'contacts', kind: 'drawn-contacts' },
  ],
  params: Params,
  make() {
    const hands = new Map<string, HandState>();
    const contact = createContactDetector();
    let seq = 0;
    let lastEdit: DrawnEdit | null = null;
    let configRef: unknown = null;
    let local: Piece[] | null = null;
    let activeKey = '';
    const stateOf = (hand: string): HandState => {
      let s = hands.get(hand);
      if (!s) {
        s = { pinch: createPinchTracker(), pointFilter: createOneEuro2D(), tipFilter: createOneEuro2D(), ink: null, grab: null, depth: 0.5 };
        hands.set(hand, s);
      }
      return s;
    };
    return {
      process(inputs, ctx: NodeContext) {
        const parsed = DrawnDialSchema.safeParse(inputs.config ?? {});
        const config: DrawnDialParams = parsed.success ? parsed.data : DrawnDialSchema.parse({});
        // The dial's pieces changed (our own edit landed, or the panel edited): they are the truth again.
        const piecesRef = (inputs.config as { pieces?: unknown } | undefined)?.pieces;
        if (piecesRef !== configRef) {
          configRef = piecesRef;
          local = null;
        }
        let pieces = local ?? config.pieces;
        const frame = inputs.hands as HandsFrame | undefined;
        const t = frameTime(frame, ctx);
        // Leaving play (or switching off) releases every held note; any mode change drops half-made
        // ink, grabs and pinches, so nothing carries over into the other mode.
        const key = config.enabled ? config.mode : 'off';
        let released: ContactEvent[] = [];
        if (key !== activeKey) {
          released = contact.releaseAll(t);
          hands.clear();
          activeKey = key;
        }
        const empty: DrawnScene = { mode: config.mode, pieces, ink: [], pointers: [], touching: [] };
        if (!config.enabled) return { scene: empty, edits: lastEdit, contacts: released };
        const commit = (next: Piece[], what: DrawnEdit['what']) => {
          local = next;
          pieces = next;
          lastEdit = { seq: ++seq, pieces: next, what };
        };
        const W = frame?.width ?? 0;
        const H = frame?.height ?? 0;
        const present = new Set<string>();
        const samples: StrikerSample[] = [];
        const pointers: DrawnScene['pointers'] = [];
        const seenLabels = new Map<string, number>();
        for (const hand of frame?.hands ?? []) {
          const kps = hand.keypoints;
          if (!W || !H || kps.length < 21) continue;
          // MediaPipe can label both hands alike: a repeated label gets its own id, so two hands never share a state.
          const n = seenLabels.get(hand.handedness) ?? 0;
          seenLabels.set(hand.handedness, n + 1);
          const id = n === 0 ? hand.handedness : `${hand.handedness}#${n}`;
          present.add(id);
          const s = stateOf(id);
          const mid = (a: number, b: number): Vec2 => {
            const p = displayOf(kps[a]!, W, H);
            const q = displayOf(kps[b]!, W, H);
            return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          };
          const pinchPoint = s.pointFilter.filter(t, mid(LM.thumbTip, LM.indexTip));
          const tip = s.tipFilter.filter(t, displayOf(kps[LM.indexTip]!, W, H));
          s.depth = palmDepth(kps, W) ?? s.depth;
          const handSize = dist(displayOf(kps[LM.wrist]!, W, H), displayOf(kps[LM.middleMcp]!, W, H));
          if (config.mode === 'play') {
            samples.push({ hand: id, t, p: tip, handSize, depth: s.depth });
            pointers.push({ hand: id, p: tip, down: false, holding: null });
            continue;
          }
          const r = s.pinch.update(t, pinchRatio(kps), pinchPoint);
          if (r.edge === 'down') {
            const at = r.anchor ?? r.point;
            const under = pieceAt(pieces, at);
            if (under) s.grab = { id: under.id, offset: [under.x - r.point[0], under.y - r.point[1]] };
            else s.ink = [at];
          } else if (r.down) {
            if (s.ink) {
              const last = s.ink[s.ink.length - 1]!;
              if (dist(last, r.point) >= INK_STEP) s.ink.push(r.point);
            } else if (s.grab) {
              const g = s.grab;
              const [x, y] = [r.point[0] + g.offset[0], r.point[1] + g.offset[1]];
              pieces = pieces.map((pc) => (pc.id === g.id ? movedBy(pc, x - pc.x, y - pc.y) : pc));
              local = pieces;
            }
          } else if (r.edge === 'up') {
            if (s.ink) {
              const piece = pieceFromStroke(s.ink, { id: newPieceId(new Set(pieces.map((p) => p.id))), depth: s.depth, shape: config.defaultShape });
              if (piece) commit([...pieces, piece].slice(-24), 'add');
              s.ink = null;
            } else if (s.grab) {
              const g = s.grab;
              const moved = pieces.find((p) => p.id === g.id);
              if (moved && isOffFrame(moved)) commit(pieces.filter((p) => p.id !== g.id), 'delete');
              else commit(pieces, 'move');
              s.grab = null;
            }
          }
          pointers.push({ hand: id, p: r.point, down: r.down, holding: s.grab?.id ?? null });
        }
        // A hand gone: its pinch ends through the tracker's grace (fed with no hand).
        for (const [id, s] of hands) {
          if (present.has(id)) continue;
          const r = s.pinch.update(t, null, null);
          if (r.edge === 'up') {
            if (s.ink) {
              const piece = pieceFromStroke(s.ink, { id: newPieceId(new Set(pieces.map((p) => p.id))), depth: s.depth, shape: config.defaultShape });
              if (piece) commit([...pieces, piece].slice(-24), 'add');
            } else if (s.grab) commit(pieces, 'move');
            s.ink = null;
            s.grab = null;
          }
        }
        let contacts: ContactEvent[] = released;
        if (config.mode === 'play') contacts = [...released, ...contact.update(t, samples, pieces, { hitSpeed: config.hitSpeed, depthMatch: config.depthMatch })];
        const ink = [...hands.values()].flatMap((s) => (s.ink ? [s.ink] : []));
        const touching = config.mode === 'play' ? contact.activeTouches().map((x) => x.piece) : [];
        return { scene: { mode: config.mode, pieces, ink, pointers, touching } satisfies DrawnScene, edits: lastEdit, contacts };
      },
    };
  },
});
