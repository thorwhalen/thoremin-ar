/**
 * The drawn pieces' deferred half: the node definitions and the overlay element's drawing code (and
 * through it three.js). Never imported statically: the host's build loads it with a dynamic `import()`
 * the first time a graph names `drawn-hands` or `drawn-voice` (thoremin's `docs/design/lazy-extensions.md`).
 */
import type { NodeDef } from '@thoremin/dag';
import type { ExtensionNodes } from '@thoremin/sdk/instruments/extension';
import { drawnHandsNode } from './nodes/drawn_hands';
import { drawnVoiceNode } from './nodes/drawn_voice';
import { piecesElement } from './nodes/overlay/pieces';

const DRAWN_NODES: ExtensionNodes = {
  nodes: [drawnHandsNode, drawnVoiceNode] as unknown as NodeDef<unknown>[],
  overlayElements: [piecesElement],
};

export default DRAWN_NODES;
