/**
 * The pieces' voices, from WebAudio primitives (no samples to load): a membrane (`skin`), a wood block, a
 * metal plate, a glass, and a plucked string, each struck with the five controls of `./feel`. A touch is a
 * sustained voice held until its release. The sink is an interface so tests and other hosts can replace it.
 */
import type { PieceSound } from '../schema';
import type { VoiceControls } from './feel';

export type Timbre = Exclude<PieceSound, 'auto'>;

export interface PieceSink {
  strike(timbre: Timbre, midi: number, c: VoiceControls, when: number): void;
  /** Start a held voice under `key` (a hand on a piece). */
  hold(key: string, timbre: Timbre, midi: number, c: VoiceControls, when: number): void;
  release(key: string, when: number): void;
  /** Release every held voice. */
  releaseAll(when: number): void;
  close(): void;
}

export type PieceSinkFactory = (ac: AudioContext | undefined, destination: AudioNode | undefined) => PieceSink;

/** Partials (multiples of the fundamental) and base decay (seconds) per struck timbre. */
export const TIMBRES: Record<Timbre, { partials: readonly number[]; decay: number; gain: number; drop: number }> = {
  skin: { partials: [1, 1.59, 2.14], decay: 0.55, gain: 0.9, drop: 0.5 },
  wood: { partials: [1, 2.76, 5.4], decay: 0.14, gain: 0.7, drop: 0.05 },
  metal: { partials: [1, 2.76, 5.4, 8.93], decay: 1.6, gain: 0.35, drop: 0 },
  glass: { partials: [1, 2.32, 4.25, 6.63], decay: 1.2, gain: 0.35, drop: 0 },
  pluck: { partials: [1], decay: 1.8, gain: 0.5, drop: 0 },
};

const FLOOR = 0.0001;
const ATTACK_S = 0.004;
const HOLD_ATTACK_S = 0.08;
const HOLD_RELEASE_TAU_S = 0.12;
const STOP_MARGIN_S = 0.05;

const freqOf = (midi: number, cents: number) => 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200);

export function createWebAudioPieceSink(ac: AudioContext, destination: AudioNode): PieceSink {
  let noise: AudioBuffer | null = null;
  const held = new Map<string, { osc: OscillatorNode; env: GainNode }>();
  const noiseBuffer = () => {
    if (noise) return noise;
    const len = Math.floor(ac.sampleRate * 0.5);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    // A fixed LCG, not Math.random: the same noise every session.
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    return noise;
  };
  const env = (peak: number, when: number, decay: number) => {
    const g = ac.createGain();
    g.gain.setValueAtTime(FLOOR, when);
    g.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, peak), when + ATTACK_S);
    g.gain.exponentialRampToValueAtTime(FLOOR, when + ATTACK_S + decay);
    g.connect(destination);
    return g;
  };
  const burst = (c: VoiceControls, when: number, peak: number) => {
    if (c.noise <= 0) return;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer();
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(800 + 7000 * c.brightness, when);
    f.Q.setValueAtTime(0.9, when);
    const decay = 0.03 + 0.05 * c.decay;
    const g = env(peak * c.noise, when, decay);
    src.connect(f);
    f.connect(g);
    src.start(when);
    src.stop(when + decay + STOP_MARGIN_S);
  };
  return {
    strike(timbre, midi, c, when) {
      if (!(c.gain > 0)) return;
      const tb = TIMBRES[timbre];
      const f0 = freqOf(midi, c.pitchCents);
      const decay = tb.decay * c.decay;
      const peak = tb.gain * c.gain;
      if (timbre === 'pluck') {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0, when);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        const nyq = ac.sampleRate * 0.45;
        lp.frequency.setValueAtTime(Math.min(nyq, f0 * (4 + 20 * c.brightness)), when);
        lp.frequency.exponentialRampToValueAtTime(Math.min(nyq, f0 * 2.5), when + 0.3);
        const g = env(peak, when, decay);
        osc.connect(lp);
        lp.connect(g);
        osc.start(when);
        osc.stop(when + decay + STOP_MARGIN_S);
        burst(c, when, peak * 0.3);
        return;
      }
      tb.partials.forEach((m, i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        const f = f0 * m;
        if (f > ac.sampleRate * 0.45) return;
        osc.frequency.setValueAtTime(f * (1 + tb.drop), when);
        osc.frequency.exponentialRampToValueAtTime(f, when + 0.04);
        // Upper partials ring shorter and louder with brightness.
        const share = i === 0 ? 1 : c.brightness * Math.pow(0.6, i);
        const g = env(peak * share, when, decay / (1 + 0.6 * i));
        osc.connect(g);
        osc.start(when);
        osc.stop(when + ATTACK_S + decay + STOP_MARGIN_S);
      });
      burst(c, when, peak);
    },
    hold(key, timbre, midi, c, when) {
      if (held.has(key)) return;
      const osc = ac.createOscillator();
      osc.type = timbre === 'pluck' || timbre === 'skin' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freqOf(midi, c.pitchCents), when);
      const g = ac.createGain();
      g.gain.setValueAtTime(FLOOR, when);
      g.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, TIMBRES[timbre].gain * 0.5 * Math.max(0.2, c.gain)), when + HOLD_ATTACK_S);
      osc.connect(g);
      g.connect(destination);
      osc.start(when);
      held.set(key, { osc, env: g });
    },
    release(key, when) {
      const h = held.get(key);
      if (!h) return;
      h.env.gain.cancelScheduledValues(when);
      h.env.gain.setTargetAtTime(0, when, HOLD_RELEASE_TAU_S);
      h.osc.stop(when + 6 * HOLD_RELEASE_TAU_S);
      held.delete(key);
    },
    releaseAll(when) {
      for (const k of [...held.keys()]) this.release(k, when);
    },
    close() {
      this.releaseAll(ac.currentTime);
      noise = null;
    },
  };
}
