/**
 * Geometry and the Shape dial: a wobbly circle fits a circle, a rough line fits a line, the dial morphs from
 * the stroke (0) to the primitive (1), and a scribble no primitive fits stops at smooth.
 */
import { describe, expect, it } from 'vitest';
import { bounds, centroid, dist, nearestOnPolyline, pathLength, pointInPolygon, resample, simplify, type Vec2 } from '@thoremin/ext-draw/lib/geometry';
import { fitPrimitive, shapeAt, SHAPE_TUNING } from '@thoremin/ext-draw/lib/shapes';

const wobblyCircle = (n = 60, wobble = 0.03): Vec2[] => Array.from({ length: n }, (_, k) => {
  const t = (2 * Math.PI * k) / n;
  const r = 0.2 * (1 + wobble * Math.sin(7 * t));
  return [0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t)];
});

describe('geometry', () => {
  it('resamples evenly and keeps the length', () => {
    const line: Vec2[] = [[0, 0], [1, 0]];
    const r = resample(line, 11);
    expect(r).toHaveLength(11);
    expect(r[5]![0]).toBeCloseTo(0.5);
    expect(pathLength(r)).toBeCloseTo(1);
  });
  it('simplifies a straight run to its ends', () => {
    expect(simplify([[0, 0], [0.5, 0.001], [1, 0]], 0.01)).toHaveLength(2);
  });
  it('point in polygon, nearest point on a polyline', () => {
    const sq: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(pointInPolygon([0.5, 0.5], sq)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], sq)).toBe(false);
    expect(nearestOnPolyline([0.5, 0.2], [[0, 0], [1, 0]]).along).toBeCloseTo(0.5);
  });
});

describe('the Shape dial', () => {
  it('a wobbly closed stroke fits a circle', () => {
    const fit = fitPrimitive(wobblyCircle(), true);
    expect(fit?.name).toBe('circle');
    expect(fit!.confidence).toBeGreaterThan(0.6);
  });
  it('a rough open stroke fits a line', () => {
    const pts: Vec2[] = Array.from({ length: 30 }, (_, k) => [0.1 + k * 0.02, 0.5 + 0.004 * Math.sin(k)]);
    expect(fitPrimitive(pts, false)?.name).toBe('line');
  });
  it('a closed square fits a rectangle', () => {
    const sq: Vec2[] = [...resample([[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]], 60, true)];
    expect(fitPrimitive(sq, true)?.name).toBe('rectangle');
  });
  it('morphs from the stroke to the perfect circle', () => {
    const raw = wobblyCircle(60, 0.08);
    const c = centroid(raw);
    const spread = (pts: Vec2[]) => {
      const d = pts.map((p) => dist(p, c));
      return Math.max(...d) - Math.min(...d);
    };
    const s0 = spread(shapeAt(raw, true, 0));
    const s1 = spread(shapeAt(raw, true, 1));
    expect(shapeAt(raw, true, 0.6)).toHaveLength(SHAPE_TUNING.outlinePoints);
    expect(s1).toBeLessThan(s0 * 0.25);
  });
  it('a scribble no primitive fits stays smooth at the top of the dial', () => {
    const scribble: Vec2[] = Array.from({ length: 80 }, (_, k) => [0.5 + 0.2 * Math.cos(k * 0.4) * Math.sin(k * 0.13), 0.5 + 0.2 * Math.sin(k * 0.29)]);
    const fit = fitPrimitive(scribble, false);
    const top = shapeAt(scribble, false, 1, fit && fit.confidence >= SHAPE_TUNING.minConfidence ? fit : null);
    expect(bounds(top).size).toBeGreaterThan(0.1);
  });
});
