/**
 * Synthetic hands for the drawn pieces' tests: 21 MediaPipe keypoints placed so that the index tip is at a
 * given DISPLAY point (the mirrored frame's fractions), pinched or open. Only the landmarks the extension
 * reads are meaningful (wrist, thumb tip, index and pinky knuckles, index tip, middle knuckle).
 */
import type { Hand, HandsFrame } from '@thoremin/sdk/nodes/domain';

export const W = 1280;
export const H = 720;

/** A hand whose index tip is at display point (x, y); `pinch` closes the thumb on it. */
export function handAt(x: number, y: number, { pinch = false, handedness = 'Right' as 'Left' | 'Right', size = 90 } = {}): Hand {
  const tx = (1 - x) * W;
  const ty = y * H;
  const kps = Array.from({ length: 21 }, () => ({ x: tx, y: ty + size }));
  kps[0] = { x: tx, y: ty + 1.6 * size }; // wrist
  kps[9] = { x: tx, y: ty + 0.6 * size }; // middle knuckle: wrist to it is `size`
  kps[5] = { x: tx - 0.35 * size, y: ty + 0.6 * size }; // index knuckle
  kps[17] = { x: tx + 0.35 * size, y: ty + 0.65 * size }; // pinky knuckle
  kps[8] = { x: tx, y: ty }; // index tip
  kps[4] = pinch ? { x: tx + 0.08 * size, y: ty + 0.04 * size } : { x: tx - 0.9 * size, y: ty + 0.5 * size }; // thumb tip
  return { handedness, keypoints: kps, score: 0.95 };
}

export const frameOf = (hands: Hand[]): HandsFrame => ({ width: W, height: H, hands });

/** Points around a circle, in display fractions. */
export const circlePath = (cx: number, cy: number, r: number, n = 40): [number, number][] =>
  Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n) * (W / H)]);
