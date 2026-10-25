/**
 * The Shape dial: a drawn stroke morphed from freeform (0) through smooth (0.5) to the nearest perfect
 * shape (1). The lower half simplifies and splines the stroke; the upper half fits a primitive (circle,
 * ellipse, rectangle, triangle for a closed stroke; line or arc for an open one) and interpolates toward
 * it point by point. A stroke no primitive fits stops at smooth: the dial never forces a shape that is not
 * there. Pure: points in, points out.
 */
import { bounds, catmullRom, centroid, dist, lerp, nearestOnPolyline, resample, signedArea, simplify, type Vec2 } from './geometry';

export type PrimitiveName = 'circle' | 'ellipse' | 'rectangle' | 'triangle' | 'line' | 'arc';

export interface Primitive {
  name: PrimitiveName;
  points: Vec2[];
  /** 0 (fits badly) to 1 (the stroke is this shape). */
  confidence: number;
}

/** The tunables, one table (`docs/design/drawn-pieces.md` section 2). */
export const SHAPE_TUNING = {
  /** Points every rendered outline is resampled to. */
  outlinePoints: 96,
  /** RDP tolerance at the top of the smoothing half, as a fraction of the stroke's size. */
  maxSimplify: 0.04,
  /** Spline samples per simplified segment. */
  splineSamples: 8,
  /** Mean fit error, as a fraction of the stroke's size, at which confidence reaches 0. */
  fitErrorAtZero: 0.12,
  /** Below this confidence the upper half of the dial stops at smooth. */
  minConfidence: 0.35,
  /** An ellipse whose minor/major ratio is above this snaps to a circle. */
  circleRatio: 0.85,
  /** Turns tried for the rectangle's minimum-area box (over a quarter turn). */
  rectangleTurns: 36,
  /** An arc whose radius exceeds this many stroke sizes is a line. */
  lineRadius: 4,
} as const;

function pca(pts: readonly Vec2[]): { c: Vec2; axis: Vec2; l1: number; l2: number } {
  const c = centroid(pts);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - c[0];
    const dy = y - c[1];
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const n = Math.max(1, pts.length);
  sxx /= n;
  syy /= n;
  sxy /= n;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(0, tr / 2 - disc);
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c, axis: [Math.cos(th), Math.sin(th)], l1, l2 };
}

function ellipsePoints(c: Vec2, axis: Vec2, a: number, b: number, n: number): Vec2[] {
  const perp: Vec2 = [-axis[1], axis[0]];
  return Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n;
    const u = a * Math.cos(t);
    const v = b * Math.sin(t);
    return [c[0] + axis[0] * u + perp[0] * v, c[1] + axis[1] * u + perp[1] * v] as Vec2;
  });
}

/** The minimum-area box around the points, searched over turns (PCA's axis is arbitrary for a square). */
function rectanglePoints(pts: readonly Vec2[], c: Vec2): Vec2[] {
  let best: { area: number; axis: Vec2; u0: number; u1: number; v0: number; v1: number } | null = null;
  for (let k = 0; k < SHAPE_TUNING.rectangleTurns; k++) {
    const th = (Math.PI / 2) * (k / SHAPE_TUNING.rectangleTurns);
    const axis: Vec2 = [Math.cos(th), Math.sin(th)];
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of pts) {
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      const u = dx * axis[0] + dy * axis[1];
      const v = -dx * axis[1] + dy * axis[0];
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, axis, u0, u1, v0, v1 };
  }
  const { axis, u0, u1, v0, v1 } = best!;
  const at = (u: number, v: number): Vec2 => [c[0] + axis[0] * u - axis[1] * v, c[1] + axis[1] * u + axis[0] * v];
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
}

function trianglePoints(pts: readonly Vec2[]): Vec2[] {
  const c = centroid(pts);
  const far = (from: Vec2) => pts.reduce((best, p) => (dist(p, from) > dist(best, from) ? p : best), pts[0]!);
  const a = far(c);
  const b = far(a);
  const area = (p: Vec2) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]));
  const cc = pts.reduce((best, p) => (area(p) > area(best) ? p : best), pts[0]!);
  return [a, b, cc];
}

/** Algebraic (Kasa) circle fit: centre and radius, or null for collinear points. */
function circleFit(pts: readonly Vec2[]): { c: Vec2; r: number } | null {
  const m = centroid(pts);
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const [x, y] of pts) {
    const u = x - m[0];
    const v = y - m[1];
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const r1 = (suuu + suvv) / 2;
  const r2 = (svvv + svuu) / 2;
  const uc = (r1 * svv - r2 * suv) / det;
  const vc = (r2 * suu - r1 * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / pts.length);
  return { c: [m[0] + uc, m[1] + vc], r };
}

function arcPoints(stroke: readonly Vec2[], c: Vec2, r: number, n: number): Vec2[] {
  const ang = (p: Vec2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  // Unwrap the angle along the stroke so the arc follows the stroke's direction and span.
  let prev = ang(stroke[0]!);
  const start = prev;
  let acc = 0;
  for (let i = 1; i < stroke.length; i++) {
    const a = ang(stroke[i]!);
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    acc += d;
    prev = a;
  }
  return Array.from({ length: n }, (_, k) => {
    const t = start + (acc * k) / (n - 1);
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as Vec2;
  });
}

function fitError(stroke: readonly Vec2[], shape: readonly Vec2[], closed: boolean, size: number): number {
  if (size === 0) return Infinity;
  let s = 0;
  for (const p of stroke) s += nearestOnPolyline(p, shape, closed).d;
  // Symmetric: a shape much bigger than the stroke must fit badly too.
  for (const q of resample(shape, stroke.length, closed)) s += nearestOnPolyline(q, stroke, closed).d;
  return s / (2 * stroke.length * size);
}

/** The best-fitting primitive for a stroke, with its confidence. */
export function fitPrimitive(stroke: readonly Vec2[], closed: boolean): Primitive | null {
  if (stroke.length < 3) return null;
  const n = SHAPE_TUNING.outlinePoints;
  const pts = resample(stroke, 64, closed);
  const size = bounds(pts).size;
  const candidates: { name: PrimitiveName; points: Vec2[] }[] = [];
  if (closed) {
    const { c, axis, l1, l2 } = pca(pts);
    const a = Math.sqrt(2 * l1);
    const b = Math.sqrt(2 * l2);
    if (b / Math.max(a, 1e-9) > SHAPE_TUNING.circleRatio) {
      const r = pts.reduce((s, p) => s + dist(p, c), 0) / pts.length;
      candidates.push({ name: 'circle', points: ellipsePoints(c, [1, 0], r, r, n) });
    } else {
      candidates.push({ name: 'ellipse', points: ellipsePoints(c, axis, a, b, n) });
    }
    candidates.push({ name: 'rectangle', points: rectanglePoints(pts, c) });
    candidates.push({ name: 'triangle', points: trianglePoints(pts) });
  } else {
    const fit = circleFit(pts);
    if (fit && fit.r < SHAPE_TUNING.lineRadius * size) candidates.push({ name: 'arc', points: arcPoints(pts, fit.c, fit.r, n) });
    candidates.push({ name: 'line', points: [pts[0]!, pts[pts.length - 1]!] });
  }
  let best: Primitive | null = null;
  for (const cand of candidates) {
    const err = fitError(pts, cand.points, closed, size);
    const confidence = Math.max(0, 1 - err / SHAPE_TUNING.fitErrorAtZero);
    if (!best || confidence > best.confidence) best = { ...cand, confidence };
  }
  return best;
}

/** Resample a primitive to `n` points, starting nearest `first` and turning the same way as `like`. */
function aligned(prim: readonly Vec2[], like: readonly Vec2[], closed: boolean, n: number): Vec2[] {
  let pts = resample(prim, n, closed);
  if (!closed) {
    // An open primitive runs from the stroke's start to its end.
    return dist(pts[0]!, like[0]!) <= dist(pts[n - 1]!, like[0]!) ? pts : pts.reverse();
  }
  if (Math.sign(signedArea(pts)) !== Math.sign(signedArea(like))) pts = pts.reverse();
  let k = 0;
  for (let i = 1; i < n; i++) if (dist(pts[i]!, like[0]!) < dist(pts[k]!, like[0]!)) k = i;
  return [...pts.slice(k), ...pts.slice(0, k)];
}

function smoothed(raw: readonly Vec2[], closed: boolean, u: number): Vec2[] {
  const n = SHAPE_TUNING.outlinePoints;
  if (u <= 0) return resample(raw, n, closed);
  const size = bounds(raw).size;
  const tol = u * SHAPE_TUNING.maxSimplify * size;
  let pts = simplify(closed ? [...raw, raw[0]!] : raw, tol);
  if (closed && pts.length > 1 && dist(pts[0]!, pts[pts.length - 1]!) === 0) pts = pts.slice(0, -1);
  const spline = pts.length >= 3 ? catmullRom(pts, SHAPE_TUNING.splineSamples, closed) : pts;
  const smooth = resample(spline, n, closed);
  // Blend from the raw stroke so the lowest settings change little.
  const rawN = resample(raw, n, closed);
  return smooth.map((p, i) => lerp(rawN[i]!, p, Math.min(1, u * 1.5)));
}

/**
 * The outline a piece shows at Shape value `s` (0..1): `outlinePoints` points. `primitive` may be passed
 * when already fitted (it depends only on the stroke).
 */
export function shapeAt(raw: readonly Vec2[], closed: boolean, s: number, primitive?: Primitive | null): Vec2[] {
  if (raw.length < 2) return [...raw];
  const v = Math.max(0, Math.min(1, s));
  if (v <= 0.5) return smoothed(raw, closed, v / 0.5);
  const smooth = smoothed(raw, closed, 1);
  const prim = primitive === undefined ? fitPrimitive(raw, closed) : primitive;
  if (!prim || prim.confidence < SHAPE_TUNING.minConfidence) return smooth;
  const target = aligned(prim.points, smooth, closed, smooth.length);
  const w = (v - 0.5) / 0.5;
  return smooth.map((p, i) => lerp(p, target[i]!, w));
}
