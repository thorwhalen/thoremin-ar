/**
 * The drawn pieces' React half, EAGER STUB: the editor section it will contribute and the `D` key that
 * switches between shaping and playing (eager, so the key works before the deferred half loads). The
 * section's components and the status hook are `./lazy_ui.tsx`, loaded on demand. No React import: data
 * and one small action.
 */
import type { ExtensionUiStub } from '@thoremin/sdk-ui/types';
import { dialValue, dispatchDialSetIn } from '@thoremin/sdk-ui/dials';
import { DRAWN_DIAL_KEY } from './dials';
import { DRAWN_EXTENSION_ID } from './branches';

export const DRAWN_SECTION = 'Drawn pieces';

const current = (): { enabled?: boolean; mode?: string } => {
  const d = dialValue(DRAWN_DIAL_KEY);
  return d && typeof d === 'object' ? (d as { enabled?: boolean; mode?: string }) : {};
};

/** Shape mode to play mode and back. */
export const toggleDrawnMode = (): void => dispatchDialSetIn(`${DRAWN_DIAL_KEY}.mode`, current().mode === 'play' ? 'shape' : 'play');

export const DRAWN_UI_STUB: ExtensionUiStub = {
  id: DRAWN_EXTENSION_ID,
  panels: [{ instrumentId: 'drawn', section: DRAWN_SECTION }],
  keybindings: [{ key: 'd', run: toggleDrawnMode, when: () => (current().enabled ? 'dispatch' : 'pass'), help: 'drawn pieces: switch between shaping and playing (when they are on)' }],
};

export default DRAWN_UI_STUB;
