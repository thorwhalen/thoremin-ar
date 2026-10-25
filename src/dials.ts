/**
 * The drawn pieces' one dial: `drawnPieces`, the scene (every piece with its stroke, Shape, sound, Feel and
 * Tone), the mode (shape or play), and how hard a stroke must be to count as a hit. Saved with the
 * instrument, like the air drum's pads.
 *
 * Pure: Zod only (the schema is `./schema`, so this eager file never imports a node).
 */
import { dialSlice } from '@thoremin/sdk/instruments/extension';
import { DEFAULT_DRAWN_DIAL, DrawnDialSchema } from './schema';

export const DRAWN_DIAL_KEY = 'drawnPieces';

export const DRAWN_DIAL_SLICES = [
  dialSlice({
    key: DRAWN_DIAL_KEY,
    schema: DrawnDialSchema.default(DEFAULT_DRAWN_DIAL),
    kind: 'drawn-pieces-config',
    meta: {
      facets: ['Drawn pieces'],
      title: 'Drawn pieces',
      description: 'Shapes drawn in the air with a pinch and played with the fingertips: the pieces (drums and strings), shaping or playing, the Shape a new piece starts with, the volume, and how hard a stroke must be to count as a hit',
    },
  }),
] as const;
