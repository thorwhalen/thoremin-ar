/**
 * The drawn pieces' bridge from the engine to the dials and the panel: each finished edit the
 * `drawnHands` node emits (a piece drawn, moved or deleted) becomes one dial write, so the scene is saved
 * with the instrument; and the panel's live line (how many hands are in
 * view, whether one is drawing or touching).
 */
import { create } from 'zustand';
import { DRAWN_HANDS_NODE_ID } from '../branches';
import type { Piece } from '../schema';
import type { DrawnEdit, DrawnScene } from '../nodes/drawn_hands';

export interface DrawnLive {
  present: boolean;
  hands: number;
  drawing: boolean;
  holding: boolean;
  touching: number;
}

export const ABSENT_DRAWN_LIVE: DrawnLive = { present: false, hands: 0, drawing: false, holding: false, touching: 0 };

interface DrawnStatusState {
  live: DrawnLive;
  report: (l: DrawnLive) => void;
  reset: () => void;
}

export const useDrawnStatus = create<DrawnStatusState>((set) => ({
  live: ABSENT_DRAWN_LIVE,
  report: (live) => set({ live }),
  reset: () => set({ live: ABSENT_DRAWN_LIVE }),
}));

/** The one thing the reporter reads (the engine, or a test double). */
export interface OutputReader {
  getOutput(nodeId: string, port: string): unknown;
}

/** How an edit reaches the dials (`./writePieces` in the app; a test passes its own). */
export type WritePieces = (pieces: readonly Piece[]) => unknown;

export function makeDrawnReporter(engine: OutputReader, write: WritePieces, store: Pick<DrawnStatusState, 'report'> = useDrawnStatus.getState()): () => void {
  // Edits before this reporter existed (a previous engine's) are not replayed.
  let lastSeq = (engine.getOutput(DRAWN_HANDS_NODE_ID, 'edits') as DrawnEdit | null | undefined)?.seq ?? 0;
  let lastKey = '';
  return () => {
    const edit = engine.getOutput(DRAWN_HANDS_NODE_ID, 'edits') as DrawnEdit | null | undefined;
    if (edit && edit.seq > lastSeq) {
      lastSeq = edit.seq;
      write(edit.pieces);
    }
    const scene = engine.getOutput(DRAWN_HANDS_NODE_ID, 'scene') as DrawnScene | undefined;
    if (!scene) return;
    const live: DrawnLive = {
      present: scene.pointers.length > 0,
      hands: scene.pointers.length,
      drawing: scene.ink.length > 0,
      holding: scene.pointers.some((p) => p.holding !== null),
      touching: scene.touching.length,
    };
    const key = `${live.hands}|${live.drawing}|${live.holding}|${live.touching}`;
    if (key === lastKey) return;
    lastKey = key;
    store.report(live);
  };
}
