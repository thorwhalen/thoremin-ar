/**
 * The DRAWN PIECES section of the settings panel. Up front: Shape or Play, then one card per piece with
 * its three dials (Shape, Feel, Tone) and its sound; the instrument's volume and the Shape new pieces start
 * with. Folded under Advanced: the hit threshold and the depth match. Every discrete control dispatches
 * (the single write path); sliders write on drag.
 */
import { useState } from 'react';
import { dispatchDialSetIn, useDialsSettings } from '@thoremin/sdk-ui/dials';
import { writePieces } from '../app/writePieces';
import { CollapsibleSection, selectCls } from '@thoremin/sdk-ui/primitives';
import { DEFAULT_DRAWN_DIAL, PIECE_SOUNDS, type DrawnDialParams, type Piece, type PieceSound } from '../schema';
import { useDrawnStatus } from '../app/drawnStatus';
import { toggleDrawnMode } from '../ui';
import { DRAWN_DIAL_KEY } from '../dials';

const SOUND_LABELS: Record<PieceSound, string> = { auto: 'Auto (skin or pluck)', skin: 'Skin', wood: 'Wood', metal: 'Metal', glass: 'Glass', pluck: 'Pluck' };

/** What the hands are doing right now. */
export function DrawnReadout() {
  const live = useDrawnStatus((s) => s.live);
  const text = !live.present ? 'Show a hand to the camera' : live.drawing ? 'Drawing…' : live.holding ? 'Moving a piece' : live.touching > 0 ? `Touching ${live.touching}` : `${live.hands} hand${live.hands === 1 ? '' : 's'} in view`;
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/80" data-testid="drawn-live">
      {text}
    </div>
  );
}

function Slider({ label, hint, value, onChange, left, right }: { label: string; hint: string; value: number; onChange: (v: number) => void; left: string; right: string }) {
  return (
    <label className="block text-xs" title={hint}>
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-white/40">
          {left} · {right}
        </span>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={value} className="w-full" onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function PieceCard({ pieces, index, open, onOpen }: { pieces: readonly Piece[]; index: number; open: boolean; onOpen: () => void }) {
  const piece = pieces[index]!;
  // The whole list in one write: the scene is one value (a leaf path cannot reach into the list).
  const set = (field: keyof Piece, value: unknown) => writePieces(pieces.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  return (
    <div className="rounded-lg border border-white/10 p-2">
      <button type="button" className="flex w-full items-center justify-between text-left text-xs" onClick={onOpen}>
        <span>
          {piece.kind === 'drum' ? '🥁' : '〰️'} {piece.kind === 'drum' ? 'Drum' : 'String'} {index + 1}
        </span>
        <span className="text-white/40">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Slider label="Shape" hint="Freeform keeps your stroke as drawn; perfect snaps it to the nearest circle, rectangle, triangle, line or arc." value={piece.shape} left="freeform" right="perfect" onChange={(v) => set('shape', v)} />
          <Slider label="Feel" hint="How much your touch matters: at the left every stroke sounds the same; at the right speed, place and sharpness all change the sound." value={piece.feel} left="steady" right="expressive" onChange={(v) => set('feel', v)} />
          <Slider label="Tone" hint="Dark, soft and long at the left; bright, hard and short at the right." value={piece.tone} left="dark" right="bright" onChange={(v) => set('tone', v)} />
          <label className="flex items-center justify-between gap-2 text-xs">
            Sound
            <select className={selectCls} value={piece.sound} onChange={(e) => set('sound', e.target.value)}>
              {PIECE_SOUNDS.map((s) => (
                <option key={s} value={s}>
                  {SOUND_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" title="Auto: bigger pieces play lower notes of the instrument's scale.">
            Note
            <select className={selectCls} value={piece.note === null ? 'auto' : String(piece.note)} onChange={(e) => set('note', e.target.value === 'auto' ? null : Number(e.target.value))}>
              <option value="auto">Auto (from size)</option>
              {Array.from({ length: 37 }, (_, i) => 36 + i).map((m) => (
                <option key={m} value={m}>
                  {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12]}
                  {Math.floor(m / 12) - 1}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            Kind
            <select className={selectCls} value={piece.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="drum">Drum (hit, touch)</option>
              <option value="string">String (pluck)</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

export function DrawnControls() {
  const { state } = useDialsSettings();
  const c: DrawnDialParams = { ...DEFAULT_DRAWN_DIAL, ...((state.effective[DRAWN_DIAL_KEY] ?? {}) as Partial<DrawnDialParams>) };
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <DrawnReadout />
      <p className="text-[10px] leading-relaxed text-white/50">
        Pinch and draw in the air: close the shape for a drum, leave it open for a string. Pinch a piece to move it; drag it off the edge to delete it. Then press D (or the button) to play: tap a drum, rest a finger on it, or swipe across a string.
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={c.enabled} onChange={(e) => dispatchDialSetIn(`${DRAWN_DIAL_KEY}.enabled`, e.target.checked)} />
        Drawn pieces on
      </label>
      <div className="flex gap-1" role="group" aria-label="Mode">
        {(['shape', 'play'] as const).map((m) => (
          <button key={m} type="button" disabled={!c.enabled} aria-pressed={c.mode === m} className={`flex-1 rounded-md px-2 py-1 text-xs ${c.mode === m ? 'bg-amber-500/80 text-black' : 'bg-white/10'}`} onClick={() => c.mode !== m && toggleDrawnMode()}>
            {m === 'shape' ? '✏️ Shape' : '🥁 Play'}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span>Volume</span>
        <input type="range" min={0} max={1} step={0.01} value={c.volume} className="w-[55%]" onChange={(e) => dispatchDialSetIn(`${DRAWN_DIAL_KEY}.volume`, Number(e.target.value))} />
      </label>
      <Slider label="Shape of new pieces" hint="Where the Shape dial of each new piece starts." value={c.defaultShape} left="freeform" right="perfect" onChange={(v) => dispatchDialSetIn(`${DRAWN_DIAL_KEY}.defaultShape`, v)} />
      <div className="space-y-1">
        {c.pieces.length === 0 && <p className="text-xs text-white/40">No pieces yet: draw one.</p>}
        {c.pieces.map((p, i) => (
          <PieceCard key={p.id} pieces={c.pieces} index={i} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} />
        ))}
        {c.pieces.length > 0 && (
          <button type="button" className="text-xs text-red-300/80 underline" onClick={() => writePieces([])}>
            Clear all pieces
          </button>
        )}
      </div>
      <CollapsibleSection label="Advanced" defaultOpen={false}>
        <label className="flex items-center justify-between gap-2 text-xs" title="How fast a stroke must be (hand lengths per second) to count as a hit rather than a touch.">
          <span>Hit threshold ({c.hitSpeed.toFixed(1)})</span>
          <input type="range" min={0.5} max={20} step={0.5} value={c.hitSpeed} className="w-[45%]" onChange={(e) => dispatchDialSetIn(`${DRAWN_DIAL_KEY}.hitSpeed`, Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 text-xs" title="Only strike pieces near your hand's distance from the camera (rough with a webcam).">
          <input type="checkbox" checked={c.depthMatch} onChange={(e) => dispatchDialSetIn(`${DRAWN_DIAL_KEY}.depthMatch`, e.target.checked)} />
          Match the hand's depth
        </label>
      </CollapsibleSection>
    </div>
  );
}
