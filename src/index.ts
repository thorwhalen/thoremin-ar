/**
 * The drawn pieces extension: draw a shape in the air with a pinch and it becomes a 3-D drum (a closed
 * stroke) or string (an open one) on the video; switch to play mode and strike, touch or pluck it, every
 * nuance of the stroke (speed, where, how sharply it stops) changing the sound a little. Design:
 * `docs/design/drawn-pieces.md`.
 *
 * LAZY (thoremin's `docs/design/lazy-extensions.md`): this file is the EAGER STUB, so it imports no node,
 * no geometry and no three.js. It carries what the app needs before anyone draws (the dial, the branch as
 * data, the overlay element as data, the instrument, the derivation) and names its node types in
 * `provides`; their code is `./lazy.ts`, loaded with a dynamic `import()` the first time a graph names one.
 */
import { defineExtension } from '@thoremin/sdk/instruments/extension';
import { DRAWN_BRANCHES, DRAWN_EXTENSION_ID, PIECES_ELEMENT } from './branches';
import { DRAWN_DIAL_KEY, DRAWN_DIAL_SLICES } from './dials';

/** The theremin voices silent and its guides hidden: the hands draw and strike. */
const SILENT_THEREMIN = {
  handMap: { maxGain: 0 },
  overlay: { scaleGuide: { show: false }, markers: { showNotes: false } },
} as const;

const dial = (s: unknown): { enabled?: boolean } => {
  const d = s && typeof s === 'object' ? (s as Record<string, unknown>)[DRAWN_DIAL_KEY] : undefined;
  return d && typeof d === 'object' ? (d as { enabled?: boolean }) : {};
};

export const DRAWN_EXTENSION = defineExtension({
  id: DRAWN_EXTENSION_ID,
  classes: [{ id: 'drawn', label: 'Drawn instruments', emoji: '🖍️', colour: 'hsl(30 70% 55%)' }],
  catalog: [{ id: 'drawn', label: 'Drawn pieces', emoji: '🖍️', class: 'drawn', usesScale: true, on: (s) => dial(s).enabled === true }],
  provides: ['drawn-hands', 'drawn-voice'],
  branches: DRAWN_BRANCHES,
  dials: DRAWN_DIAL_SLICES,
  overlay: [
    {
      name: PIECES_ELEMENT,
      category: 'guide',
      inputs: [
        { name: 'scene', kind: 'drawn-scene' },
        { name: 'contacts', kind: 'drawn-contacts' },
      ],
      config: { dialKey: DRAWN_DIAL_KEY },
    },
  ],
  instruments: [{ name: 'Drawn Pieces', patch: { ...SILENT_THEREMIN, [DRAWN_DIAL_KEY]: { enabled: true, mode: 'shape' } } }],
  derive: (s) => (dial(s).enabled ? ['drawn-pieces'] : []),
});

export default DRAWN_EXTENSION;
