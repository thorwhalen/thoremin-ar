/**
 * `drawn-voice`: contact events to sound. Each piece plays its note (fixed, or from its size in the
 * instrument's scale) in its timbre (`auto`: skin for a drum, pluck for a string), shaped per stroke by its
 * Feel and Tone (`../lib/feel`). Hits and plucks strike; a touch holds a voice until its release. Scheduled
 * on the audio clock like thoremin's other struck voices.
 */
import { z } from 'zod';
import { defineNode, realtimeOutputAllowed, type NodeContext } from '@thoremin/dag';
import { scheduleAt, type TickClock } from '@thoremin/sdk/timing/clock_map';
import { timingFrom } from '@thoremin/sdk/timing/tracker';
import { DrawnDialSchema, type Piece } from '../schema';
import type { ContactEvent } from '../lib/contact';
import { controlsFor } from '../lib/feel';
import { noteOf } from '../lib/scene';
import { createWebAudioPieceSink, type PieceSink, type PieceSinkFactory, type Timbre } from '../lib/voice';

/** The resource key a host or test sets to replace the WebAudio sink. */
export const DRAWN_SINK_RESOURCE = 'createDrawnSink';

export const timbreOf = (piece: Piece): Timbre => (piece.sound === 'auto' ? (piece.kind === 'drum' ? 'skin' : 'pluck') : piece.sound);

const Params = z.object({});
type Params = z.infer<typeof Params>;

export const drawnVoiceNode = defineNode<Params>({
  type: 'drawn-voice',
  roles: ['synth'],
  title: 'Drawn pieces: voice',
  description: 'Sounds the drawn pieces: hits and plucks strike, touches hold until released; each stroke shaped by the piece\'s Feel and Tone (WebAudio from primitives, no samples).',
  inputs: [
    { name: 'contacts', kind: 'drawn-contacts' },
    { name: 'config', kind: 'drawn-pieces-config' },
    { name: 'scale', kind: 'number[]' },
    { name: 'mute', kind: 'boolean', default: false },
  ],
  outputs: [],
  params: Params,
  make() {
    let sink: PieceSink | null = null;
    let sinkAc: AudioContext | null = null;
    return {
      process(inputs, ctx: NodeContext) {
        const contacts = Array.isArray(inputs.contacts) ? (inputs.contacts as ContactEvent[]) : [];
        // Releases and the mute end held voices whatever else holds the output back: a held note
        // must never outlive the touch that started it.
        if (sink) {
          const now = sinkAc?.currentTime ?? 0;
          if (inputs.mute === true) sink.releaseAll(now);
          for (const c of contacts) if (c.kind === 'release') sink.release(`${c.hand}|${c.piece}`, now);
        }
        if (inputs.mute === true || contacts.length === 0) return {};
        if (!realtimeOutputAllowed(ctx)) return {};
        const ac = ctx.resources.audioContext as AudioContext | undefined;
        const master = ctx.resources.masterGain as AudioNode | undefined;
        const factory = ctx.resources[DRAWN_SINK_RESOURCE] as PieceSinkFactory | undefined;
        if (!factory && !(ac && master)) return {};
        if (!sink || sinkAc !== (ac ?? null)) {
          sink?.close();
          sink = factory ? factory(ac, master) : createWebAudioPieceSink(ac!, master!);
          sinkAc = ac ?? null;
        }
        const clock = (ac ?? { currentTime: 0 }) as { currentTime: number; state?: string };
        if (clock.state !== undefined && clock.state !== 'running') return {};
        const parsed = DrawnDialSchema.safeParse(inputs.config ?? {});
        if (!parsed.success) return {};
        const { pieces, volume } = parsed.data;
        const scale = Array.isArray(inputs.scale) ? (inputs.scale as number[]) : [];
        const at: TickClock = { clock, nowEngine: ctx.time, stage: timingFrom(ctx.resources).outputStage.value };
        for (const c of contacts) {
          const piece = pieces.find((p) => p.id === c.piece);
          if (c.kind === 'release' || !piece) continue;
          const key = `${c.hand}|${c.piece}`;
          const when = scheduleAt(c.t, at);
          const controls = controlsFor(c, piece);
          controls.gain *= volume;
          const midi = noteOf(piece, scale);
          if (c.kind === 'touch') sink.hold(key, timbreOf(piece), midi, controls, when);
          else sink.strike(timbreOf(piece), midi, controls, when);
        }
        return {};
      },
      dispose() {
        sink?.close();
        sink = null;
        sinkAc = null;
      },
    };
  },
});
