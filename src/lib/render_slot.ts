/**
 * The seam between the pure overlay element and the 3-D renderer: the overlay (pure, in the node half)
 * draws the pieces flat in 2-D unless a renderer has been installed here, in which case it draws the
 * renderer's image. The three.js renderer (`../render/gl_pieces.ts`) is installed by the extension's lazy
 * UI half when it mounts, so three.js never enters the pure side (thoremin's extension boundary) and a
 * host without WebGL still sees every piece.
 */
import type { DrawnScene } from '../nodes/drawn_hands';
import type { ContactEvent } from './contact';

/** The last hit or pluck of a piece, for its ripple or vibration. */
export interface Pulse {
  t: number;
  x: number;
  y: number;
  speed: number;
  kind: ContactEvent['kind'];
}

export interface PieceRenderRequest {
  W: number;
  H: number;
  scene: DrawnScene;
  pulses: ReadonlyMap<string, Pulse>;
  /** Engine time (seconds), for the animations. */
  now: number;
}

/** Renders the pieces into an image the overlay copies, or null when it cannot (no WebGL). */
export type PieceRenderer = (req: PieceRenderRequest) => CanvasImageSource | null;

let installed: PieceRenderer | null = null;

/** Install (or, with null, remove) the renderer the overlay uses. */
export const setPieceRenderer = (r: PieceRenderer | null): void => {
  installed = r;
};

export const pieceRenderer = (): PieceRenderer | null => installed;
