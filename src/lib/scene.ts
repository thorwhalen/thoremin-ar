/**
 * Pieces as geometry: a finished stroke becomes a piece (closed is a drum, open a string), a piece's
 * outline on screen (its stroke through the Shape dial, then its place, size and turn), what is under a
 * point, a piece's size and the pitch it plays. Pure, over the `drawn` dial's `Piece` values.
 */
import { MAX_STROKE_POINTS, type Piece, type PieceKind } from '../schema';
import { add, bounds, centroid, dist, nearestOnPolyline, pathLength, pointInPolygon, resample, rotate, scale, type Vec2 } from './geometry';
import { fitPrimitive, shapeAt, type Primitive } from './shapes';

export const SCENE_TUNING = {
  /** A stroke closes into a drum when its ends are within this fraction of its length. */
  closeGap: 0.12,
  /** Strokes shorter than this (display fractions) are ignored (a tap, not a drawing). */
  minLength: 0.06,
  /** How near a string (display fractions) counts as on it. */
  stringReach: 0.03,
  /** Pitch from size: the smallest and largest piece sizes (display fractions) mapped to the scale's top and bottom. */
  sizeSmall: 0.08,
  sizeLarge: 0.6,
} as const;

const round = (v: number) => Math.round(v * 1e4) / 1e4;

/** The stroke of a piece as points (local, relative to its centre). */
export function strokeOf(piece: Pick<Piece, 'stroke'>): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < piece.stroke.length; i += 2) out.push([piece.stroke[i]!, piece.stroke[i + 1]!]);
  return out;
}

/** Whether a stroke closes (its ends meet). */
export function isClosed(pts: readonly Vec2[]): boolean {
  if (pts.length < 4) return false;
  const len = pathLength(pts);
  return len > 0 && dist(pts[0]!, pts[pts.length - 1]!) <= SCENE_TUNING.closeGap * len;
}

let seq = 0;
/** A short id, unique within a scene. */
export const newPieceId = (taken: ReadonlySet<string>): string => {
  let id: string;
  do id = `p${(++seq).toString(36)}`;
  while (taken.has(id));
  return id;
};

/** A finished stroke (display fractions) as a new piece, or null when it is too short to be one. */
export function pieceFromStroke(pts: readonly Vec2[], { id, depth, shape }: { id: string; depth: number; shape: number }): Piece | null {
  if (pts.length < 3 || pathLength(pts) < SCENE_TUNING.minLength) return null;
  const closed = isClosed(pts);
  const kind: PieceKind = closed ? 'drum' : 'string';
  const body = closed ? pts.slice(0, -1) : pts;
  const sampled = resample(body, Math.min(MAX_STROKE_POINTS, Math.max(16, body.length)), closed);
  const c = centroid(sampled);
  const stroke = sampled.flatMap((p) => [round(p[0] - c[0]), round(p[1] - c[1])]);
  return { id, kind, stroke, x: round(c[0]), y: round(c[1]), scale: 1, rot: 0, shape, depth, sound: 'auto', note: null, feel: 0.6, tone: 0.5 };
}

const primitiveCache = new Map<string, Primitive | null>();
const outlineCache = new Map<string, Vec2[]>();
const CACHE_LIMIT = 256;
const remember = <T>(m: Map<string, T>, k: string, v: T): T => {
  if (m.size > CACHE_LIMIT) m.clear();
  m.set(k, v);
  return v;
};

/** The piece's outline in local coordinates (the stroke through the Shape dial), cached. */
export function localOutline(piece: Pick<Piece, 'stroke' | 'kind' | 'shape'>): Vec2[] {
  const strokeKey = piece.stroke.join(',');
  const key = `${piece.kind}|${piece.shape}|${strokeKey}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const closed = piece.kind === 'drum';
  const pts = strokeOf(piece);
  const pk = `${piece.kind}|${strokeKey}`;
  const prim = primitiveCache.has(pk) ? primitiveCache.get(pk)! : remember(primitiveCache, pk, fitPrimitive(pts, closed));
  return remember(outlineCache, key, shapeAt(pts, closed, piece.shape, prim));
}

/** The piece's outline on screen (display fractions). */
export function outlineOf(piece: Piece): Vec2[] {
  const c: Vec2 = [piece.x, piece.y];
  return localOutline(piece).map((p) => add(c, rotate(scale(p, piece.scale), piece.rot)));
}

/** A piece's size: the larger side of its outline's box (display fractions). */
export const sizeOf = (piece: Piece): number => bounds(outlineOf(piece)).size;

/** Whether a screen point is on the piece: inside a drum, or within reach of a string. */
export function isOn(piece: Piece, p: Vec2, outline: readonly Vec2[] = outlineOf(piece)): boolean {
  return piece.kind === 'drum' ? pointInPolygon(p, outline) : nearestOnPolyline(p, outline).d <= SCENE_TUNING.stringReach * piece.scale;
}

/** The topmost piece under a point (nearest the camera first), or null. */
export function pieceAt(pieces: readonly Piece[], p: Vec2): Piece | null {
  const order = [...pieces].sort((a, b) => a.depth - b.depth);
  return order.find((pc) => isOn(pc, p)) ?? null;
}

/**
 * The note a piece plays: its fixed note, or one of the scale's notes by size (the largest piece the
 * scale's lowest note, the smallest its highest), as a struck membrane or a string sounds lower when bigger.
 */
export function noteOf(piece: Piece, scaleNotes: readonly number[], fallback = 60): number {
  if (piece.note !== null) return piece.note;
  if (scaleNotes.length === 0) return fallback;
  const { sizeSmall, sizeLarge } = SCENE_TUNING;
  const u = Math.max(0, Math.min(1, (sizeOf(piece) - sizeSmall) / (sizeLarge - sizeSmall)));
  return scaleNotes[Math.round((1 - u) * (scaleNotes.length - 1))]!;
}

/** The piece moved so that its grabbed point follows the hand. */
export const movedBy = (piece: Piece, dx: number, dy: number): Piece => ({ ...piece, x: round(piece.x + dx), y: round(piece.y + dy) });

/** Whether a piece's centre has left the frame (dragged off the edge: delete). */
export const isOffFrame = (piece: Pick<Piece, 'x' | 'y'>, margin = 0.02): boolean => piece.x < -margin || piece.x > 1 + margin || piece.y < -margin || piece.y > 1 + margin;
