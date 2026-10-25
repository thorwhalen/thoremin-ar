/**
 * The drawn pieces' overlay element: the pieces on the video, the ink being drawn, the pointers and a one-line
 * hint. The pieces come from the installed 3-D renderer when there is one (`../../lib/render_slot.ts`, the
 * three.js renderer the lazy UI half installs), else they are drawn flat in 2-D with the same feedback (a
 * flash on a hit, a glow on a touch). Pure: canvas 2-D calls only.
 */
import type { OverlayElementImpl, OverlayFrame } from '@thoremin/sdk/instruments/extension';
import type { DrawnScene } from '../drawn_hands';
import type { ContactEvent } from '../../lib/contact';
import { outlineOf } from '../../lib/scene';
import { pieceRenderer, type Pulse } from '../../lib/render_slot';
import { PIECES_ELEMENT } from '../../branches';
import { hueOf, LOOK } from './look';

function drawFlat(g: CanvasRenderingContext2D, W: number, H: number, scene: DrawnScene, pulses: ReadonlyMap<string, Pulse>, now: number) {
  for (const piece of [...scene.pieces].sort((a, b) => b.depth - a.depth)) {
    const outline = outlineOf(piece);
    if (outline.length < 2) continue;
    const glow = scene.touching.includes(piece.id);
    const pulse = pulses.get(piece.id);
    const flash = pulse ? Math.max(0, 1 - (now - pulse.t) / LOOK.rippleSeconds) : 0;
    const hue = hueOf(piece.id);
    g.beginPath();
    outline.forEach((p, i) => (i === 0 ? g.moveTo(p[0] * W, p[1] * H) : g.lineTo(p[0] * W, p[1] * H)));
    if (piece.kind === 'drum') {
      g.lineTo(outline[0]![0] * W, outline[0]![1] * H);
      g.fillStyle = `hsla(${hue}, 65%, ${glow ? 70 : 55 + 25 * flash}%, ${LOOK.opacity})`;
      g.fill();
    }
    g.lineWidth = piece.kind === 'drum' ? LOOK.rimRadiusPx * 2 : LOOK.stringRadiusPx * 2;
    g.strokeStyle = `hsl(${hue}, 70%, ${35 + 30 * flash}%)`;
    g.stroke();
  }
}

function drawInk(g: CanvasRenderingContext2D, W: number, H: number, scene: DrawnScene) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = LOOK.inkWidthPx;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  for (const stroke of scene.ink) {
    if (stroke.length < 2) continue;
    g.beginPath();
    stroke.forEach((p, i) => (i === 0 ? g.moveTo(p[0] * W, p[1] * H) : g.lineTo(p[0] * W, p[1] * H)));
    g.stroke();
  }
  for (const ptr of scene.pointers) {
    g.beginPath();
    g.arc(ptr.p[0] * W, ptr.p[1] * H, ptr.down ? 7 : 10, 0, 2 * Math.PI);
    g.fillStyle = ptr.down ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)';
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1.5;
    g.fill();
    g.stroke();
  }
}

function drawHint(g: CanvasRenderingContext2D, W: number, H: number, scene: DrawnScene) {
  const text =
    scene.mode === 'shape'
      ? scene.pieces.length === 0
        ? 'Pinch and draw a shape. Close it for a drum, leave it open for a string. Press D to play.'
        : 'Shape mode: pinch to draw, pinch a piece to move it, drag it off the edge to delete. D: play.'
      : 'Play mode: tap a drum, rest a finger on it, swipe across a string. D: back to shapes.';
  const fontPx = Math.round(H * 0.026);
  g.font = `${fontPx}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  // An estimate, not measureText: the band only needs to sit behind the line.
  const w = Math.min(W - 20, text.length * fontPx * 0.5);
  const y = H * LOOK.hintTop;
  g.fillRect(W / 2 - w / 2 - 10, y - fontPx, w + 20, 2 * fontPx);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillText(text, W / 2, y);
}

export const piecesElement: OverlayElementImpl = {
  name: PIECES_ELEMENT,
  update(frame: OverlayFrame, inputs, memo) {
    const pulses = (memo.pulses as Map<string, Pulse> | undefined) ?? new Map<string, Pulse>();
    memo.pulses = pulses;
    for (const c of (inputs.contacts as ContactEvent[] | undefined) ?? []) {
      if (c.kind === 'hit' || c.kind === 'pluck') pulses.set(c.piece, { t: frame.t, x: c.x, y: c.y, speed: c.speed, kind: c.kind });
    }
  },
  draw(g, frame, inputs, memo) {
    const scene = inputs.scene as DrawnScene | undefined;
    if (!scene) return;
    const { W, H } = frame;
    const pulses = (memo.pulses as Map<string, Pulse> | undefined) ?? new Map<string, Pulse>();
    const image = pieceRenderer()?.({ W, H, scene, pulses, now: frame.t }) ?? null;
    if (image) g.drawImage(image, 0, 0, W, H);
    else drawFlat(g, W, H, scene, pulses, frame.t);
    drawInk(g, W, H, scene);
    if (!frame.overlayOnly) drawHint(g, W, H, scene);
  },
};
