/**
 * The drawn pieces' look and animation timings, one table, shared by the flat 2-D drawing
 * (`./pieces.ts`) and the 3-D renderer (`../../render/gl_pieces.ts`).
 */

export const LOOK = {
  rings: 10,
  domeOverSize: 0.18,
  rimRadiusPx: 3,
  stringRadiusPx: 5,
  opacity: 0.72,
  rippleSeconds: 0.7,
  rippleWavesPerSize: 3,
  rippleAmpOverSize: 0.06,
  vibrateSeconds: 0.9,
  vibrateAmpPx: 10,
  vibrateHz: 9,
  inkWidthPx: 4,
  /** The hint's band: its top, as a fraction of the frame height (below the header, clear of the toolbar). */
  hintTop: 0.22,
} as const;

/** A piece's hue, stable per id: an FNV hash spread by the golden angle, so ids that differ by one
 *  character (`p1`, `p2`) get clearly different colours. */
export const hueOf = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Math.round(((h >>> 0) % 997) * 137.508) % 360;
};
