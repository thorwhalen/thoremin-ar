/**
 * Humanising, as two dials and one formula each (`docs/design/drawn-pieces.md` section 5). **Tone** sets
 * the neutral sound (dark, soft and long at 0; bright, hard and short at 1); **Feel** sets how far the
 * contact's facts (speed, sharpness, where, angle) move each stroke away from it. At Feel 0 every stroke
 * sounds the same; at Feel 1 the piece answers like an acoustic instrument. A small seeded jitter keeps
 * identical strokes from being machine-identical while a recording still replays exactly.
 */
import type { ContactEvent } from './contact';

/** The five controls every voice takes. */
export interface VoiceControls {
  /** Peak gain, 0..1 (before the instrument volume). */
  gain: number;
  /** 0 dark to 1 bright. */
  brightness: number;
  /** Pitch offset from the piece's note, cents. */
  pitchCents: number;
  /** Decay time multiplier (1 = the timbre's own). */
  decay: number;
  /** Noise share of the attack, 0..1. */
  noise: number;
}

/** Every coefficient of the two formulas, in one table, to tune by ear. */
export const FEEL_TUNING = {
  /** Perceptual curve on speed: soft strokes stay audible. */
  gamma: 1.6,
  /** Brightness weights of speed, sharpness and where; the glancing angle's darkening. */
  brightSpeed: 0.5,
  brightSharp: 0.3,
  brightWhere: 0.2,
  brightAngle: 0.15,
  /** Cents at the rim (a membrane rises in pitch near its edge) and per unit of speed above the middle. */
  centsWhere: 30,
  centsSpeed: 15,
  /** Decay shortening at the rim and for a dead stop. */
  decayWhere: 0.4,
  decaySharp: 0.3,
  /** The jitter at Feel above 0: gain share and cents. */
  jitterGain: 0.02,
  jitterCents: 3,
  /** Tone: brightness, noise and decay at Tone 0 and their change to Tone 1. */
  toneBright0: 0.2,
  toneBrightSpan: 0.6,
  toneNoise0: 0.05,
  toneNoiseSpan: 0.35,
  toneDecay0: 1.4,
  toneDecaySpan: -0.9,
} as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A deterministic hash of a string and a number, to [-1, 1). */
function jitter(seed: string, n: number): number {
  let h = 2166136261 ^ Math.floor(n * 1000);
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** The neutral sound at Tone `t`. */
export function neutral(tone: number): Pick<VoiceControls, 'brightness' | 'noise' | 'decay'> {
  const k = FEEL_TUNING;
  const t = clamp01(tone);
  return { brightness: k.toneBright0 + k.toneBrightSpan * t, noise: k.toneNoise0 + k.toneNoiseSpan * t, decay: k.toneDecay0 + k.toneDecaySpan * t };
}

/** A contact's sound: the piece's Tone and Feel applied to the contact's facts. */
export function controlsFor(contact: Pick<ContactEvent, 'speed' | 'sharpness' | 'where' | 'angle' | 't' | 'piece'>, { feel, tone }: { feel: number; tone: number }): VoiceControls {
  const k = FEEL_TUNING;
  const f = clamp01(feel);
  const n = neutral(tone);
  const speed = clamp01(contact.speed);
  const sharp = clamp01(contact.sharpness);
  const where = clamp01(contact.where);
  const angle = clamp01(contact.angle);
  const j = f > 0 ? jitter(contact.piece, contact.t) : 0;
  const j2 = f > 0 ? jitter(contact.piece, contact.t + 0.5) : 0;
  return {
    gain: clamp01((1 - f + f * Math.pow(speed, k.gamma)) * (1 + k.jitterGain * j)),
    brightness: clamp01(n.brightness + f * (k.brightSpeed * speed + k.brightSharp * sharp + k.brightWhere * where) - k.brightAngle * f * angle),
    pitchCents: f * (k.centsWhere * where + k.centsSpeed * (speed - 0.5)) + k.jitterCents * j2,
    decay: n.decay * (1 - k.decayWhere * f * where) * (1 - k.decaySharp * f * sharp),
    noise: clamp01(n.noise * (1 + f * (sharp - 0.5))),
  };
}
