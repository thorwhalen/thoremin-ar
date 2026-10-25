/**
 * The `drawn` dial's schema: the scene of drawn pieces and how they are drawn and played. Its own module,
 * importing only Zod, so the extension's EAGER stub (`./index.ts`, `./dials.ts`) carries the dial without
 * pulling the nodes, three.js or the geometry into the main chunk (thoremin's
 * `docs/design/lazy-extensions.md`).
 */
import { z } from 'zod';

/** What a piece is: a closed stroke is a drum, an open one a string. */
export const PIECE_KINDS = ['drum', 'string'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** A piece's voice. `auto` picks by kind: skin for a drum, pluck for a string. */
export const PIECE_SOUNDS = ['auto', 'skin', 'wood', 'metal', 'glass', 'pluck'] as const;
export type PieceSound = (typeof PIECE_SOUNDS)[number];

/** Most points a stored stroke keeps (it is resampled to this at commit). */
export const MAX_STROKE_POINTS = 128;
/** Most pieces in a scene. */
export const MAX_PIECES = 24;

export const PieceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(PIECE_KINDS),
  /** The stroke as drawn, flattened [x0, y0, x1, y1, ...], relative to the piece's centre, in display fractions. */
  stroke: z.array(z.number()).max(2 * MAX_STROKE_POINTS),
  /** Where the piece's centre is (display fractions of the mirrored frame). */
  x: z.number().default(0.5),
  y: z.number().default(0.5),
  /** Size and turn applied on top of the stroke (two-hand scale and rotate, the card). */
  scale: z.number().min(0.1).max(10).default(1),
  rot: z.number().default(0),
  /** The Shape dial: 0 freeform, 0.5 smooth, 1 the nearest perfect shape. */
  shape: z.number().min(0).max(1).default(0.6),
  /** Relative depth (0 nearest the camera, 1 farthest), from the hand's size when drawn. */
  depth: z.number().min(0).max(1).default(0.5),
  sound: z.enum(PIECE_SOUNDS).default('auto'),
  /** A fixed MIDI note, or null for pitch from size (bigger is lower), in the instrument's scale. */
  note: z.number().int().min(0).max(127).nullable().default(null),
  /** How much the touch matters: 0 every stroke the same, 1 every nuance heard. */
  feel: z.number().min(0).max(1).default(0.6),
  /** Dark, soft and long (0) to bright, hard and short (1). */
  tone: z.number().min(0).max(1).default(0.5),
});
export type Piece = z.infer<typeof PieceSchema>;

export const DRAWN_MODES = ['shape', 'play'] as const;
export type DrawnMode = (typeof DRAWN_MODES)[number];

const Params = z.object({
  /** The instrument is on. Off by default: nothing new happens for a player who never asks. */
  enabled: z.boolean().default(false),
  /** Shape: a pinch draws or moves pieces. Play: the hands strike, touch and pluck them. */
  mode: z.enum(DRAWN_MODES).default('shape'),
  pieces: z.array(PieceSchema).max(MAX_PIECES).default([]),
  /** The Shape a new piece starts with. */
  defaultShape: z.number().min(0).max(1).default(0.6),
  /** Volume of every piece, 0..1. */
  volume: z.number().min(0).max(1).default(0.7),
  /** Advanced: the striker speed (hand sizes per second) above which entering a piece is a hit, not a touch. */
  hitSpeed: z.number().min(0.5).max(20).default(4).meta({ facets: ['advanced'] }),
  /** Advanced: only strike pieces near the hand's depth (webcam depth is rough; off by default). */
  depthMatch: z.boolean().default(false).meta({ facets: ['advanced'] }),
});
export const DrawnDialSchema = Params;
export type DrawnDialParams = z.infer<typeof Params>;
export const DEFAULT_DRAWN_DIAL: DrawnDialParams = DrawnDialSchema.parse({});
