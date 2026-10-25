/**
 * 2-D polyline geometry for drawn pieces: lengths, resampling, simplification (Ramer-Douglas-Peucker),
 * smoothing (centripetal Catmull-Rom), area and centroid, point-in-polygon, and the nearest point of a
 * polyline. Pure, no DOM: points are display fractions (x right, y down, both 0..1 of the mirrored frame).
 */

export type Vec2 = readonly [number, number];

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const rotate = (a: Vec2, th: number): Vec2 => [a[0] * Math.cos(th) - a[1] * Math.sin(th), a[0] * Math.sin(th) + a[1] * Math.cos(th)];

/** Total length; a closed polyline includes the edge back to its start. */
export function pathLength(pts: readonly Vec2[], closed = false): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  if (closed && pts.length > 2) s += dist(pts[pts.length - 1]!, pts[0]!);
  return s;
}

/** `n` points evenly spaced along the polyline (by arc length). */
export function resample(pts: readonly Vec2[], n: number, closed = false): Vec2[] {
  if (pts.length === 0 || n <= 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]!);
  const src = closed ? [...pts, pts[0]!] : [...pts];
  const total = pathLength(src);
  if (total === 0) return Array.from({ length: n }, () => pts[0]!);
  const step = total / (closed ? n : n - 1);
  const out: Vec2[] = [src[0]!];
  let seg = 1;
  let acc = 0;
  for (let k = 1; k < n; k++) {
    const target = k * step;
    while (seg < src.length - 1 && acc + dist(src[seg - 1]!, src[seg]!) < target) {
      acc += dist(src[seg - 1]!, src[seg]!);
      seg++;
    }
    const a = src[seg - 1]!;
    const b = src[seg]!;
    const d = dist(a, b);
    out.push(d === 0 ? a : lerp(a, b, Math.min(1, (target - acc) / d)));
  }
  return out;
}

function perpendicular(p: Vec2, a: Vec2, b: Vec2): number {
  const d = dist(a, b);
  if (d === 0) return dist(p, a);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / d;
}

/** Ramer-Douglas-Peucker: drop points closer than `tol` to the line through their neighbours. */
export function simplify(pts: readonly Vec2[], tol: number): Vec2[] {
  if (pts.length < 3 || tol <= 0) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = perpendicular(pts[k]!, pts[i]!, pts[j]!);
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return pts.filter((_, k) => keep[k] === 1);
}

/** Centripetal Catmull-Rom through the points, `perSegment` samples per segment. */
export function catmullRom(pts: readonly Vec2[], perSegment: number, closed = false): Vec2[] {
  const n = pts.length;
  if (n < 3) return [...pts];
  const at = (i: number): Vec2 => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const out: Vec2[] = [];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const knot = (a: Vec2, b: Vec2) => Math.max(1e-6, Math.sqrt(dist(a, b)));
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let s = 0; s < perSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / perSegment;
      const a1 = lerp(p0, p1, t / t1);
      const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, t / t2);
      const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerp(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  if (!closed) out.push(pts[n - 1]!);
  return out;
}

/** Signed shoelace area (positive counter-clockwise in a y-up frame). */
export function signedArea(pts: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(pts: readonly Vec2[]): Vec2 {
  if (pts.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

export function bounds(pts: readonly Vec2[]): { min: Vec2; max: Vec2; size: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { min: [x0, y0], max: [x1, y1], size: Math.max(x1 - x0, y1 - y0, 0) };
}

/** Even-odd rule. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The nearest point of the polyline to `p`: its distance and its position along the line (0..1 of the length). */
export function nearestOnPolyline(p: Vec2, pts: readonly Vec2[], closed = false): { d: number; along: number; at: Vec2 } {
  const src = closed && pts.length > 2 ? [...pts, pts[0]!] : pts;
  const total = pathLength(src) || 1;
  let best = { d: Infinity, along: 0, at: src[0] ?? ([0, 0] as Vec2) };
  let acc = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1]!;
    const b = src[i]!;
    const ab = sub(b, a);
    const len2 = ab[0] * ab[0] + ab[1] * ab[1];
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2));
    const q = lerp(a, b, t);
    const d = dist(p, q);
    const segLen = Math.sqrt(len2);
    if (d < best.d) best = { d, along: (acc + t * segLen) / total, at: q };
    acc += segLen;
  }
  return best;
}

/** Whether segments p1-p2 and q1-q2 cross, and where along p (0..1). */
export function segmentsCross(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): number | null {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const den = r[0] * s[1] - r[1] * s[0];
  if (den === 0) return null;
  const qp = sub(q1, p1);
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
