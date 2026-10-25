# Drawn pieces: draw a shape in the air, then play it

Design for thoremin-ar's first instrument (2026-10-25). The player draws a curve with a hand in front of the webcam; it becomes a 3-D object shown over the video (a **piece**); the player then hits, touches or plucks it, and every small difference in where, how fast and how sharply the hand arrives changes the sound a little, the way it does on a real drum or string. It loads lazily, like [thoremin-asl](https://github.com/thorwhalen/thoremin-asl): nothing of it reaches a player who never picks it.

Background: [02 draw and move with a webcam](../research/02-draw-and-move-with-a-webcam.md), [05 related work](../research/05-related-work-instruments.md), [99 recommendations](../research/99-recommendations.md) (R1, R4, R5, R9, R10).

## In short

- **Two modes, one gesture.** In **Shape** mode a pinch draws (or, started on a piece, grabs and moves it). In **Play** mode the hands strike, touch and pluck. One key (`D`) and one on-screen button switch modes; nothing else to learn.
- **What you draw decides what it is.** A closed curve becomes a **drum** (a domed membrane); an open curve becomes a **string** (a tube you pluck or strike along its length). Size sets pitch: bigger is lower.
- **One drawing dial: Shape**, from *freeform* (exactly your stroke) through *smooth* to *perfect* (snapped to the nearest circle, ellipse, rectangle, triangle, line or arc). It is a continuous morph, not three modes, and it can be changed after drawing because the raw stroke is kept.
- **Two playing dials per piece: Feel and Tone.** *Feel* is how much the touch matters (from "every hit the same" to "every nuance heard"); *Tone* runs from dark and soft to bright and hard. Each dial drives several sound parameters through one formula, so two knobs give most of the expressive range.
- **Everything else is folded under Advanced**, with defaults that work.

## 1. Who does what, step by step

1. The player picks **Drawn Pieces** in the Instruments view. The extension loads (target: under 250 kB, most of it three.js). It starts in **Shape** mode with an empty scene and a one-line hint: *"Pinch and draw a shape. Close it for a drum, leave it open for a string. Press D to play."*
2. **Draw**: pinch (thumb and index together) and move. Ink follows the pinch point. Release ends the stroke. If the end is near the start (within 8 % of the stroke's length) the curve closes into a drum; otherwise it is a string. The piece appears at once, rendered in 3-D, and its first sound plays softly so the player hears what it is.
3. **Move**: in Shape mode, a pinch that starts on a piece grabs it; it follows the hand and drops on release. Two pinches on the same piece scale and rotate it. Dragging a piece off the edge of the frame deletes it (with an Undo toast).
4. **Play**: press `D` (or the button). Ink is off; a fingertip (index tip by default, or a virtual stick like the air drum's) is the striker. Moving it into a piece fast is a **hit**; arriving slowly and staying is a **touch** (a sustained sound you shape by moving inside the piece); crossing a string sideways is a **pluck**.
5. **Assign**: tapping a piece in the panel (or pinching it and holding still for a second in Shape mode) opens its card: sound, Feel, Tone, and the Shape dial for that piece.

### Why these choices

- **Modes instead of gestures for everything**: a webcam cannot tell a pinch meant to draw from one meant to play (the Midas touch problem, [01](../research/01-lingo-and-taxonomy.md)). A mode is the cheapest reliable gate, and the toggle is one key. A dedicated drawing pose (index pointing) was considered and rejected for v1: it collides with the pointing the chord wheel uses, and pinch is already tuned in thoremin (`gesture_classifier`, `pinchOn` 0.6, `pinchOff` 0.45).
- **The shape decides the instrument**: no menu to pick "drum or string" before drawing. A player who wants the other kind redraws or toggles it on the card.
- **Size to pitch**: what a child expects of a drum or a string, so the scene is musical before anything is assigned. The pitch is quantised to the app's current key and scale, so pieces drawn at random sizes still sound in tune.

## 2. The Shape dial (freeform to perfect)

One slider, 0 to 1, stored per piece with the raw stroke so it can be changed afterwards.

| Value | What the player sees | How |
|---|---|---|
| 0 | the stroke exactly as drawn, wobbles included | raw samples, only the 1€ filter applied while drawing |
| 0 to 0.5 | progressively smoother | Ramer-Douglas-Peucker simplification with a tolerance rising with the value, then a centripetal Catmull-Rom spline |
| 0.5 to 1 | the smooth curve morphs into the nearest perfect shape | a template recogniser ($1/$P family) picks circle, ellipse, rectangle, triangle, line or arc; the curve is resampled to N points and interpolated point by point toward the fitted primitive |
| 1 | a perfect shape | the fitted primitive |

Default 0.6: smooth and a little tidied, still recognisably the player's hand. If no primitive fits well (recogniser score below a threshold), the upper half of the slider stops at "smooth": the dial never forces a shape that is not there.

## 3. From curve to 3-D surface

A webcam gives no reliable depth, so the scene is camera-relative: pieces live in a plane facing the player, at a depth taken from the hand's apparent size when drawing (palm width: a hand nearer the camera draws a nearer piece). That depth orders pieces (a nearer piece is drawn in front and is struck first) and scales their thickness; it never needs to be metric.

- **Drum** (closed curve): the curve is triangulated (earcut) into a membrane, pushed into a shallow dome (height proportional to the square root of the area), given a rim (the curve swept with a small tube) and a short skirt for thickness. Lit with one key light and an environment term so it reads as an object, semi-transparent so the player still sees their hands.
- **String** (open curve): a tube swept along the curve (radius from the stroke speed, thinner when drawn fast), with small end caps as anchors.
- **Feedback** (there is no haptic touch, so the eyes and ears do the work, [05](../research/05-related-work-instruments.md)): a hit ripples the membrane from the contact point with an amplitude from the velocity; a pluck makes the string vibrate as a standing wave; a touch glows where the finger is.

Rendering: three.js draws into an offscreen WebGL canvas the size of the overlay, and the extension's overlay element copies it onto thoremin's existing 2-D overlay canvas (`g.drawImage`). This keeps thoremin's overlay contract (`OverlayElementImpl.draw(g, …)`) untouched, so no core change is needed, and three.js stays a lazy dependency. The overlay element is on the extension's pure side, which may not import three.js, so the renderer is a strategy installed through a small slot (`src/lib/render_slot.ts`) by the lazy UI half when it mounts; without it (no WebGL, a test) the element draws the pieces flat in 2-D. Cost: one draw call per piece; a copy of the canvas per frame, a fraction of a millisecond at 720p.

## 4. Contact: hit, touch, pluck

The striker is the index fingertip, smoothed by a 1€ filter, in display coordinates; optionally the air drum's virtual stick from the thumb-index grip. Each tick, for each piece:

- **Hit**: the striker enters the piece's outline with speed above `hitSpeed`. The impact time is predicted sub-frame from the approach (the same method as the air drum, thoremin's `ictus` impact predictor, so a hit can sound before the frame that shows it). The contact is read at the boundary crossing.
- **Touch**: the striker enters slowly and stays. A note starts with a soft attack and sustains while the finger is inside; moving inside modulates it (position to brightness and pitch bend); leaving releases it.
- **Pluck** (strings): the striker's path crosses the string. Velocity of the crossing is the strength; where along the string it crossed sets the harmonic content (near an end is brighter and thinner, the middle rounder), as on a real string.

Every contact produces one **contact event** with the facts the sound needs:

| Fact | Meaning | Range |
|---|---|---|
| `speed` | striker speed at contact, normalised by hand size | 0 to 1 (soft to hardest seen) |
| `sharpness` | deceleration over the last frames: a stroke that stops dead versus one that brushes through | 0 to 1 |
| `where` | drum: radial distance from the centre (0) to the rim (1); string: position along it (0 to 1) | 0 to 1 |
| `angle` | approach angle relative to the surface normal (head-on 0, glancing 1) | 0 to 1 |
| `depthMatch` | how close the hand's depth is to the piece's (Advanced; off by default since webcam depth is rough) | 0 to 1 |

## 5. Humanising: Feel and Tone

The sound engine for a hit is thoremin's sample-free drum voice (velocity to gain and brightness; the rim raises pitch, shortens decay and adds noise), for a pluck its Karplus-Strong pluck voice, for a touch a synth voice from the app's sound presets. Each voice exposes the same five controls: **gain, brightness, pitch offset, decay, noise**. The contact facts reach those controls through two dials per piece, with one formula each, so the player never wires a modulation matrix:

- **Feel** `f` in [0, 1] scales how much the facts move the sound away from a neutral strike:
  - gain = g0 · (1 − f + f · speed^γ), with γ = 1.6 (a perceptual curve: soft strokes stay audible)
  - brightness = b0 + f · (0.5 · speed + 0.3 · sharpness + 0.2 · where) − 0.15 · f · angle
  - pitch offset (cents) = f · (30 · where + 15 · (speed − 0.5)), as a struck membrane rises in pitch near the rim and when hit hard
  - decay = d0 · (1 − 0.4 · f · where) · (1 − 0.3 · f · sharpness)
  - plus a tiny seeded jitter (± 2 % gain, ± 3 cents) at f > 0, so even identical strokes are not machine-identical; seeded per piece, so a recording replays exactly
- **Tone** `t` in [0, 1] sets the neutral point: b0 = 0.2 + 0.6 · t, noise = 0.05 + 0.35 · t, d0 = 1.4 − 0.9 · t (dark, soft and long at 0; bright, hard and short at 1).

At Feel 0 every stroke sounds the same (a drum machine); at Feel 1 the same object answers like an acoustic instrument. The coefficients are the starting point and are tuned by ear with recorded strokes; they live in one table in the code, not scattered. Advanced exposes the individual weights for a player who wants to sculpt the mapping, but the two dials are the intended surface.

Why these facts first: speed and position are the two that every acoustic percussion and string player controls deliberately ([05](../research/05-related-work-instruments.md)), and both are measured well by a webcam. Sharpness and angle are subtler and noisier, so they get smaller weights. Depth is the least reliable and is off by default.

## 6. How it fits thoremin

A lazy extension `@thoremin/ext-draw` in this repository, wired the way thoremin-asl is (`extensions.json` entry with a `lazy` half, the package pinned by commit).

| Part | Kind | Role |
|---|---|---|
| `drawnPieces` dial | zod schema, `dialSlice` | the scene (pieces with raw stroke, Shape, depth, kind, sound, Feel, Tone) and the mode; saved with the instrument like the air drum's pads |
| `drawn-hands` | node | pinch state with hysteresis, debounce and a latched anchor; the Shape-mode state machine (ink, close or open, grab, delete); the Play-mode detector (hit, touch, pluck) with the facts of section 4 |
| `drawn-voice` | sink node | contact events to sound through Feel and Tone, on the app's audio clock |
| `pieces` | overlay element | the pieces (3-D through the installed renderer, else flat), the ink, the pointers, the hint |
| status hook + key | UI | writes each finished edit into the `drawnPieces` dial (the whole list through `applyDial`: the generic dial commands take scalars only), the `D` toggle |
| panel | UI | the piece list and the piece card |

Pure functions carry the logic (stroke processing, shape fitting, contact detection, the Feel and Tone formulas), so they are tested without a camera. The tests drive them with synthetic strokes, as thoremin's air-drum tests do.

## 7. Build order

1. **Silent drawing**: pointer, editor, Shape dial, 3-D render, move and delete. Done when a player draws a circle and a line, moves them, and changes the Shape of each afterwards.
2. **Hit**: contact detection on drums, drum voice, Feel and Tone, ripple. Done when two drums of different sizes play two pitches and soft and hard strokes sound clearly different at Feel 1 and identical at Feel 0.
3. **Pluck and touch**: strings, pluck voice, sustained touch.
4. **Polish**: virtual stick striker, two-hand scale and rotate, depth match, recorded-stroke tuning of the coefficients, undo for drawn edits (a command family), sub-frame impact prediction.

Shipped in v1 (2026-10-25): steps 1 to 3, without two-hand scale and rotate (a piece keeps the size it was drawn at) and without the virtual stick.

## 8. Decisions taken by default (change any of them)

| Question | Default | Alternative |
|---|---|---|
| How to switch between drawing and playing | a mode, key `D` plus a button | a drawing pose, or the left hand draws and the right plays |
| What decides drum versus string | closed or open curve | a choice before drawing |
| Pitch | from size, quantised to the app's key | a fixed note per piece, set on its card |
| Striker | index fingertip | the air drum's virtual stick |
| Depth | camera-relative, from palm size, ordering only | none at all (pure 2-D) |
| Dials up front | Shape, Feel, Tone | more, unfolded |
