/**
 * Play mode's detector: hands against pieces, one frame at a time, to contact events. A drum is seen face
 * on, so a **hit** is a fast stroke that stops or turns back over it (a tap on its face; where it stops is
 * the contact point, centre to rim); a slow arrival that stays is a **touch**, held until the finger leaves;
 * a fast pass across a string is a **pluck**, at the place it crossed. Each event carries the facts the
 * sound reads (`docs/design/drawn-pieces.md` section 4). Pure: no clock but the frames' own times.
 */
import type { Piece } from '../schema';
import { centroid, dist, nearestOnPolyline, pathLength, segmentsCross, sub, type Vec2 } from './geometry';
import { isOn, outlineOf } from './scene';

export type ContactKind = 'hit' | 'pluck' | 'touch' | 'release';

export interface ContactEvent {
  /** Engine time of the contact (seconds). */
  t: number;
  piece: string;
  kind: ContactKind;
  /** Which striker (the hand's index in the frame's stable order: 'Left' or 'Right'). */
  hand: string;
  /** Striker speed at contact, 0 (soft) to 1 (hardest). */
  speed: number;
  /** How abruptly the stroke stopped (1 dead stop, 0 brushed through). */
  sharpness: number;
  /** Drum: centre (0) to rim (1). String: position along it (0..1). */
  where: number;
  /** Approach angle: head-on 0, glancing 1. */
  angle: number;
  /** The contact point (display fractions). */
  x: number;
  y: number;
}

export interface StrikerSample {
  hand: string;
  t: number;
  /** Display fractions. */
  p: Vec2;
  /** The hand's size in display units, for scale-free speeds (wrist to middle knuckle). */
  handSize: number;
  /** Relative depth of the hand (0 near, 1 far), or null. */
  depth: number | null;
}

export const CONTACT_TUNING = {
  /** Speed (hand sizes per second) mapped to `speed` 1. Speeds at `hitSpeed` map to about 0.25. */
  fullSpeedOverHit: 4,
  /** A stroke has stopped when its speed falls below this fraction of the previous frame's, or turns back. */
  stopRatio: 0.45,
  /** A touch: inside, slower than this fraction of `hitSpeed`, for this long. */
  touchSpeedOverHit: 0.25,
  touchDwellS: 0.25,
  /** A pluck needs this fraction of `hitSpeed`. */
  pluckSpeedOverHit: 0.5,
  /** No second hit on the same piece by the same hand within this time. */
  refractoryS: 0.09,
  /** With depth match on, a hand this far in depth from a piece passes through it. */
  depthReach: 0.25,
} as const;

interface Track {
  prev: StrikerSample | null;
  v: Vec2;
  vPrev: Vec2;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const norm = (v: Vec2) => Math.hypot(v[0], v[1]);

export function createContactDetector(tuning: Partial<typeof CONTACT_TUNING> = {}) {
  const k = { ...CONTACT_TUNING, ...tuning };
  const tracks = new Map<string, Track>();
  const lastHit = new Map<string, number>();
  const touches = new Map<string, { since: number; active: boolean }>();
  const key = (hand: string, piece: string) => `${hand}|${piece}`;

  function radial(outline: readonly Vec2[], p: Vec2): number {
    const c = centroid(outline);
    const r = dist(p, c);
    const edge = nearestOnPolyline(p, outline, true).d;
    return r + edge > 0 ? clamp01(r / (r + edge)) : 0;
  }

  return {
    /**
     * One frame at engine time `t`: the strikers in view (a hand absent this frame is simply missing) and the scene.
     * `hitSpeed` is the dial's (hand sizes per second); `depthMatch` gates by depth.
     */
    update(t: number, samples: readonly StrikerSample[], pieces: readonly Piece[], { hitSpeed, depthMatch }: { hitSpeed: number; depthMatch: boolean }): ContactEvent[] {
      const out: ContactEvent[] = [];
      const seen = new Set<string>();
      const outlines = new Map(pieces.map((pc) => [pc.id, outlineOf(pc)] as const));
      const order = [...pieces].sort((a, b) => a.depth - b.depth);
      for (const s of samples) {
        seen.add(s.hand);
        const tr = tracks.get(s.hand) ?? { prev: null, v: [0, 0], vPrev: [0, 0] };
        const prev = tr.prev;
        if (prev && s.t > prev.t) {
          tr.vPrev = tr.v;
          const dt = s.t - prev.t;
          tr.v = [(s.p[0] - prev.p[0]) / dt, (s.p[1] - prev.p[1]) / dt];
        }
        const size = Math.max(1e-3, s.handSize);
        const speedNow = norm(tr.v) / size;
        const speedPrev = norm(tr.vPrev) / size;
        const toSpeed = (v: number) => clamp01(v / (hitSpeed * k.fullSpeedOverHit));
        for (const piece of order) {
          if (depthMatch && s.depth !== null && Math.abs(s.depth - piece.depth) > k.depthReach) continue;
          const outline = outlines.get(piece.id)!;
          const kk = key(s.hand, piece.id);
          if (piece.kind === 'string') {
            if (!prev) continue;
            const fast = speedNow >= hitSpeed * k.pluckSpeedOverHit;
            if (!fast) continue;
            for (let i = 1; i < outline.length; i++) {
              const along = segmentsCross(outline[i - 1]!, outline[i]!, prev.p, s.p);
              if (along === null) continue;
              const since = lastHit.get(kk) ?? -Infinity;
              if (s.t - since < k.refractoryS) break;
              lastHit.set(kk, s.t);
              const before = pathLength(outline.slice(0, i));
              const segLen = dist(outline[i - 1]!, outline[i]!);
              const total = pathLength(outline) || 1;
              const seg = sub(outline[i]!, outline[i - 1]!);
              const mv = tr.v;
              const cos = Math.abs(seg[0] * mv[0] + seg[1] * mv[1]) / Math.max(1e-9, norm(seg) * norm(mv));
              const x = outline[i - 1]![0] + seg[0] * along;
              const y = outline[i - 1]![1] + seg[1] * along;
              out.push({ t: s.t, piece: piece.id, kind: 'pluck', hand: s.hand, speed: toSpeed(speedNow), sharpness: 0, where: clamp01((before + along * segLen) / total), angle: clamp01(cos), x, y });
              break;
            }
            continue;
          }
          const inside = isOn(piece, s.p, outline);
          const touch = touches.get(kk);
          if (!inside) {
            if (touch?.active) out.push({ t: s.t, piece: piece.id, kind: 'release', hand: s.hand, speed: 0, sharpness: 0, where: 0, angle: 0, x: s.p[0], y: s.p[1] });
            touches.delete(kk);
            continue;
          }
          // A hit: fast last frame, and now stopped or turned back.
          const turned = tr.v[0] * tr.vPrev[0] + tr.v[1] * tr.vPrev[1] < 0;
          const stopped = speedNow < k.stopRatio * speedPrev;
          const since = lastHit.get(kk) ?? -Infinity;
          if (speedPrev >= hitSpeed && (turned || stopped) && s.t - since >= k.refractoryS) {
            lastHit.set(kk, s.t);
            const sharpness = turned ? 1 : clamp01(1 - speedNow / Math.max(1e-9, speedPrev));
            // Head-on is a stroke straight down (the drummer's stroke); sideways is glancing.
            const angle = clamp01(Math.abs(tr.vPrev[0]) / Math.max(1e-9, norm(tr.vPrev)));
            out.push({ t: s.t, piece: piece.id, kind: 'hit', hand: s.hand, speed: toSpeed(speedPrev), sharpness, where: radial(outline, s.p), angle, x: s.p[0], y: s.p[1] });
            touches.delete(kk);
            break; // one piece per stroke: the nearest the camera takes it
          }
          // A touch: slow and staying.
          if (speedNow < hitSpeed * k.touchSpeedOverHit) {
            const tt = touch ?? { since: s.t, active: false };
            if (!tt.active && s.t - tt.since >= k.touchDwellS) {
              tt.active = true;
              out.push({ t: s.t, piece: piece.id, kind: 'touch', hand: s.hand, speed: toSpeed(speedNow), sharpness: 0, where: radial(outline, s.p), angle: 0, x: s.p[0], y: s.p[1] });
            }
            touches.set(kk, tt);
          } else if (touch && !touch.active) {
            touches.delete(kk);
          }
        }
        tr.prev = s;
        tracks.set(s.hand, tr);
      }
      // A hand that left the frame releases what it was touching.
      for (const [kk, tt] of [...touches]) {
        const [hand, piece] = kk.split('|') as [string, string];
        if (seen.has(hand) && pieces.some((p) => p.id === piece)) continue;
        if (tt.active) out.push({ t, piece, kind: 'release', hand, speed: 0, sharpness: 0, where: 0, angle: 0, x: 0, y: 0 });
        touches.delete(kk);
      }
      for (const hand of [...tracks.keys()]) if (!seen.has(hand)) tracks.delete(hand);
      return out;
    },
    /** The touches held right now (for continuous modulation and the glow). */
    activeTouches(): { hand: string; piece: string }[] {
      return [...touches].filter(([, t]) => t.active).map(([kk]) => {
        const [hand, piece] = kk.split('|') as [string, string];
        return { hand, piece };
      });
    },
  };
}
