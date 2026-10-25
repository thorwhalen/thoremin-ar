/**
 * The hand as a pen and a striker: a latched, debounced pinch (hysteresis on the thumb-index distance
 * over the hand's size, a few frames to switch, a grace period through tracking loss, and the pen-down
 * point taken from just before the fingers closed so the click does not drag the ink), a 2-D One Euro
 * filter for the pinch point and the fingertip, and a relative depth from the palm's apparent width.
 * Pure state machines driven one frame at a time (`docs/design/drawn-pieces.md` sections 1 and 4).
 */
import type { Vec2 } from './geometry';

/** MediaPipe hand landmark indices used here. */
export const LM = { wrist: 0, thumbTip: 4, indexMcp: 5, indexTip: 8, middleMcp: 9, pinkyMcp: 17 } as const;

export const PINCH_TUNING = {
  /** Pinched below this thumb-index distance (over wrist-to-middle-knuckle). */
  onRatio: 0.32,
  /** Released above this one (the gap is the hysteresis). */
  offRatio: 0.48,
  /** Frames the new state must hold before it switches (debounce). */
  onFrames: 2,
  offFrames: 2,
  /** A pinch survives this long without a hand (a dropped frame or two). */
  lossGraceS: 0.15,
  /** The pen goes down where the point was this long before the pinch registered. */
  lookbackS: 0.08,
  /** Palm width (index to pinky knuckle, fraction of frame width) read as nearest and farthest. */
  palmNear: 0.16,
  palmFar: 0.04,
} as const;

export type PinchEdge = 'down' | 'up' | null;

export interface PinchReading {
  down: boolean;
  edge: PinchEdge;
  /** The pinch point (thumb and index tips' midpoint), filtered. */
  point: Vec2;
  /** On a `down` edge: where the pen went down (from just before the fingers closed). */
  anchor: Vec2 | null;
}

export function createPinchTracker(tuning: Partial<typeof PINCH_TUNING> = {}) {
  const k = { ...PINCH_TUNING, ...tuning };
  let down = false;
  let streak = 0;
  let lastSeen = -Infinity;
  let last: Vec2 = [0.5, 0.5];
  const history: { t: number; p: Vec2 }[] = [];
  return {
    /** One frame: `ratio` null when the hand is not in view. */
    update(t: number, ratio: number | null, point: Vec2 | null): PinchReading {
      if (ratio === null || point === null) {
        if (down && t - lastSeen > k.lossGraceS) {
          down = false;
          streak = 0;
          return { down, edge: 'up', point: last, anchor: null };
        }
        return { down, edge: null, point: last, anchor: null };
      }
      lastSeen = t;
      last = point;
      history.push({ t, p: point });
      while (history.length > 1 && history[0]!.t < t - 2 * k.lookbackS) history.shift();
      const wants = down ? ratio < k.offRatio : ratio < k.onRatio;
      if (wants === down) {
        streak = 0;
        return { down, edge: null, point, anchor: null };
      }
      streak++;
      if (streak < (down ? k.offFrames : k.onFrames)) return { down, edge: null, point, anchor: null };
      down = wants;
      streak = 0;
      if (!down) return { down, edge: 'up', point, anchor: null };
      const before = history.find((h) => h.t >= t - k.lookbackS) ?? history[0]!;
      return { down, edge: 'down', point, anchor: before.p };
    },
    get down() {
      return down;
    },
  };
}

/** One Euro filter (Casiez et al. 2012) on a 2-D point: low jitter at rest, low lag in motion. */
export function createOneEuro2D({ minCutoff = 1.5, beta = 8, dCutoff = 1 }: { minCutoff?: number; beta?: number; dCutoff?: number } = {}) {
  let prev: Vec2 | null = null;
  let dPrev: Vec2 = [0, 0];
  let tPrev = 0;
  const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return {
    filter(t: number, p: Vec2): Vec2 {
      if (!prev || t <= tPrev) {
        prev = p;
        tPrev = t;
        return p;
      }
      const dt = t - tPrev;
      const d: Vec2 = [(p[0] - prev[0]) / dt, (p[1] - prev[1]) / dt];
      const ad = alpha(dCutoff, dt);
      dPrev = [dPrev[0] + ad * (d[0] - dPrev[0]), dPrev[1] + ad * (d[1] - dPrev[1])];
      const a = alpha(minCutoff + beta * Math.hypot(dPrev[0], dPrev[1]), dt);
      prev = [prev[0] + a * (p[0] - prev[0]), prev[1] + a * (p[1] - prev[1])];
      tPrev = t;
      return prev;
    },
    reset() {
      prev = null;
      dPrev = [0, 0];
    },
  };
}

/** A keypoint in display fractions (mirrored), from source pixels. */
export const displayOf = (kp: { x: number; y: number }, width: number, height: number): Vec2 => [1 - kp.x / width, kp.y / height];

/** Thumb-index distance over wrist-to-middle-knuckle distance, in source pixels (scale-free). */
export function pinchRatio(kps: readonly { x: number; y: number }[]): number | null {
  const a = kps[LM.thumbTip];
  const b = kps[LM.indexTip];
  const w = kps[LM.wrist];
  const m = kps[LM.middleMcp];
  if (!a || !b || !w || !m) return null;
  const size = Math.hypot(w.x - m.x, w.y - m.y);
  return size > 0 ? Math.hypot(a.x - b.x, a.y - b.y) / size : null;
}

/** Relative depth from the palm's apparent width: 0 nearest the camera, 1 farthest. */
export function palmDepth(kps: readonly { x: number; y: number }[], width: number, tuning: Partial<typeof PINCH_TUNING> = {}): number | null {
  const k = { ...PINCH_TUNING, ...tuning };
  const a = kps[LM.indexMcp];
  const b = kps[LM.pinkyMcp];
  if (!a || !b || width <= 0) return null;
  const w = Math.hypot(a.x - b.x, a.y - b.y) / width;
  return Math.max(0, Math.min(1, (k.palmNear - w) / (k.palmNear - k.palmFar)));
}
