/**
 * The drawn pieces' React half, DEFERRED: the Drawn pieces section and the status hook that writes each
 * finished edit into the `drawn` dial and mirrors the live state into the readout, and the 3-D renderer it
 * installs for the overlay. Loaded by the host's
 * build with a dynamic `import()` when the section opens or the extension's nodes load; the eager stub is
 * `./ui.tsx`.
 */
import type { ExtensionUi } from '@thoremin/sdk-ui/types';
import { DrawnControls, DrawnReadout } from './panels/drawn';
import { ABSENT_DRAWN_LIVE, makeDrawnReporter, useDrawnStatus } from './app/drawnStatus';
import { writePieces } from './app/writePieces';
import { DRAWN_EXTENSION_ID, DRAWN_HANDS_NODE_ID } from './branches';
import { DRAWN_SECTION } from './ui';
import { setPieceRenderer } from './lib/render_slot';
import { createGlPieceRenderer } from './render/gl_pieces';

export const DRAWN_UI: ExtensionUi = {
  id: DRAWN_EXTENSION_ID,
  panels: [{ instrumentId: 'drawn', section: DRAWN_SECTION, Controls: DrawnControls, Readout: DrawnReadout }],
  statusHooks: [
    {
      nodeId: DRAWN_HANDS_NODE_ID,
      make: (engine) => makeDrawnReporter(engine, writePieces),
      onRemoved: () => useDrawnStatus.getState().report(ABSENT_DRAWN_LIVE),
      reset: () => useDrawnStatus.getState().reset(),
    },
  ],
  // The 3-D renderer (three.js), installed for the pure overlay element while this half is mounted.
  onMount: [
    () => {
      const renderer = createGlPieceRenderer();
      setPieceRenderer(renderer);
      return () => {
        setPieceRenderer(null);
        renderer.dispose();
      };
    },
  ],
};

export default DRAWN_UI;
