/**
 * The drawn pieces' branch: the hands against the scene (drawing, moving, striking), the voice, and the
 * 3-D pieces on the video.
 */
import { defineBranch } from '@thoremin/sdk/instruments/branch';
import { TRUNK } from '@thoremin/sdk/instruments/trunk';
import { overlayElementId, overlayPortName } from '@thoremin/sdk/instruments/extension';
import { DRAWN_DIAL_KEY } from './dials';

export const DRAWN_EXTENSION_ID = 'drawn-pieces';
export const DRAWN_HANDS_NODE_ID = 'drawnHands';
export const DRAWN_VOICE_NODE_ID = 'drawnVoice';
/** The overlay element's name (its implementation is `./overlay/pieces_3d`, in the lazy half). */
export const PIECES_ELEMENT = 'pieces';

const ui = (port: string) => ({ node: TRUNK.ui, port });
const overlay = (input: string) => ({ node: TRUNK.overlay, port: overlayPortName(DRAWN_EXTENSION_ID, PIECES_ELEMENT, input) });
const to = (from: { node: string; port: string }, toRef: { node: string; port: string }) => ({ from, to: toRef });

export const drawnPieces = defineBranch({
  id: 'drawn-pieces',
  description: 'Drawn pieces: shapes drawn in the air with a pinch become drums and strings on the video, played by the fingertips.',
  nodes: [
    { id: DRAWN_HANDS_NODE_ID, type: 'drawn-hands', params: {} },
    { id: DRAWN_VOICE_NODE_ID, type: 'drawn-voice', params: {} },
  ],
  edges: [
    to({ node: TRUNK.hands, port: 'hands' }, { node: DRAWN_HANDS_NODE_ID, port: 'hands' }),
    to(ui(DRAWN_DIAL_KEY), { node: DRAWN_HANDS_NODE_ID, port: 'config' }),
    to({ node: DRAWN_HANDS_NODE_ID, port: 'contacts' }, { node: DRAWN_VOICE_NODE_ID, port: 'contacts' }),
    to(ui(DRAWN_DIAL_KEY), { node: DRAWN_VOICE_NODE_ID, port: 'config' }),
    to(ui('scaleRight'), { node: DRAWN_VOICE_NODE_ID, port: 'scale' }),
    to(ui('muteStrikes'), { node: DRAWN_VOICE_NODE_ID, port: 'mute' }),
    to({ node: DRAWN_HANDS_NODE_ID, port: 'scene' }, overlay('scene')),
    to({ node: DRAWN_HANDS_NODE_ID, port: 'contacts' }, overlay('contacts')),
  ],
  overlay: [overlayElementId(DRAWN_EXTENSION_ID, PIECES_ELEMENT)],
});

export const DRAWN_BRANCHES = [drawnPieces] as const;
