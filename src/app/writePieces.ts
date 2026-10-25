/**
 * The one write of the scene: the whole `drawnPieces` dial with a new list of pieces, through the SDK's
 * validated dial write (`applyDial`). The generic dial commands take scalars only (a leaf path cannot reach
 * into an array), so a drawn, moved or deleted piece, or a piece's card edited in the panel, rewrites the
 * list, the way thoremin's generative slice writes its array config.
 */
import { applyDial, dialValue } from '@thoremin/sdk-ui/dials';
import { DRAWN_DIAL_KEY } from '../dials';
import { DEFAULT_DRAWN_DIAL, type Piece } from '../schema';

/** Write `pieces` as the scene; false (and a console warning) when the dials refused it. */
export function writePieces(pieces: readonly Piece[]): boolean {
  const current = dialValue(DRAWN_DIAL_KEY);
  const base = current && typeof current === 'object' ? current : DEFAULT_DRAWN_DIAL;
  const r = applyDial(DRAWN_DIAL_KEY, { ...base, pieces });
  if (!r.ok) console.warn('drawn pieces: the scene was not saved', r);
  return r.ok;
}
