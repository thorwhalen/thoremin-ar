# Drawing and moving virtual objects with the hands, through a plain webcam, in the browser

Research note, 2026-10-25. Part 02 of the thoremin-ar research set. Facts that move (versions, licences, browser support, sizes) were checked on 2026-10-25 and say where. Anything marked "estimate" or "to measure" is my inference, not a published figure.

## In short

- **Everything this needs already exists in thoremin in embryo.** `hand-features` computes a palm-span-normalised pinch (0 apart, 1 touching) in `src/nodes/features/hand_features.ts`; `gesture-classifier` turns it into a pinch pose with hysteresis (on 0.6, off 0.45); a scalar `one-euro` node exists; the canvas overlay draws the mirrored video and landmarks; extensions can contribute overlay elements and lazy node code. What is missing is a pointer (a smoothed, mirrored, screen-space cursor with a latched pinch), a stroke and a scene store.
- **Pinch is a state machine, not a threshold.** Use two thresholds (hysteresis), a short on/off debounce, a grace period for tracking loss, and latch the cursor position from a few frames before the pinch is detected. The "Heisenberg effect" (the confirming gesture moves the thing you were aiming with) is documented for hand input in VR and is the main reason a drawn stroke starts and ends with a hook [9].
- **Anchor the cursor on the midpoint of thumb and index tips, or on the palm, not on the index tip.** The index tip moves toward the thumb as the pinch closes, so it is the worst possible pointer at the instant of the click.
- **Depth from a single camera is relative, not metric, and that is fine.** MediaPipe's z is relative to the wrist and its world landmarks are metres from the hand centre [1], so neither says how far the hand is from the camera. Apparent palm size gives a usable relative distance (z proportional to 1/size) that needs one per-user calibration to become metric. A monocular depth network (Depth Anything V2 Small, 25 M parameters, Apache-2.0) runs in the browser but costs GPU time the hand model needs; keep it out of v1.
- **For ink: One Euro filter, then resample, then perfect-freehand for the look.** `perfect-freehand` (MIT) turns a point list into a pressure-like variable-width outline; with no stylus, use pinch tightness or hand speed as pressure. Ramer-Douglas-Peucker (epsilon about 2 px at 256 px scale is what Quick Draw uses) and centripetal Catmull-Rom or Schneider Bezier fitting handle storage and smoothness. Shape snapping is a solved small problem ($1/$P/$Q, BSD, a few hundred lines).
- **The musical payoff is large and cheap.** A stroke is a melody contour, a single-cycle wavetable (`createPeriodicWave` takes the Fourier terms), an automation curve or a score you scrub. A placed object is a pad, a zone, an XY puck or a fader. Physics objects that collide trigger notes. Each is one typed node over a `Stroke` or `SceneObjects` value, shipped as a lazy extension (working name `ext-draw`).
- **Latency is dominated by the camera and the model, as in the audio path, but visual registration adds a new defect:** the video shown is newer than the landmarks, so ink lags the fingertip you can see. Draw the video frame the landmarks came from, or accept the offset (section 12).
- **Recommended first cut:** `pinch-state` (hysteresis, debounce, latch) plus `cursor-smooth` (2D One Euro) plus `stroke-capture` plus a canvas ink layer with perfect-freehand, no audio; then add `scene-objects` (grab and drag), then the audio mappings. A sketch is in section 15.

## 1. What thoremin already has (so we build on it)

Grepped in the repo at the time of writing; paths are repo-relative.

| Piece | Where | State |
|---|---|---|
| Hand tracking, 21 image keypoints in pixels plus optional metric world landmarks | `packages/sdk/src/nodes/domain/hands.ts` (`Hand`, `HandsFrame`), source `src/nodes/sources/webcam_hands.ts` | MediaPipe `HandLandmarker`, GPU or CPU delegate, optional worker runner (`hands.worker.ts`), `numHands` from a host resource |
| Pinch scalar | `src/nodes/features/hand_features.ts` | `pinchDist = dist2d(thumbTip, indexTip) / handScale`, mapped linearly so `pinchTouch` 0.25 gives 1 and `pinchApart` 1.2 gives 0. Per-hand `{present, x, y, wristX, wristY, openness, pinch, fingers}`, mirrored when `mirrorX` is set |
| Richer pinch distances | `packages/sdk/src/features/hand_catalog.ts` | Thumb to each fingertip over palm span in 3D world coordinates; its doc says about 1.3 open and under 0.4 pinched |
| Discrete pose with hysteresis | `src/nodes/features/gesture_classifier.ts` | `pinchOn` 0.6, `pinchOff` 0.45, fist and open with a 0.05 margin, enter and exit edge events; no debounce, no tracking-loss grace |
| Pose to command bindings | `src/app/gestures/` | fist, open and pinch can be bound to commands (pinch resets master volume by default) |
| Handedness dwell | dial `hands.handednessDwell` | absorbs Left/Right label flicker for N frames; the same idea this note needs for pinch debounce |
| Smoothing | `src/nodes/mapping/one_euro.ts` | scalar 1 euro filter, `minCutoff` 1.0, `beta` 0.01, `dCutoff` 1.0, `ctx.dt` as the timestep, replay-deterministic |
| Mirroring | `src/nodes/output/overlay/view.ts` (`mirrorX`), `.../elements/backdrop.ts` | the backdrop flips the video with `scale(-1, 1)` and draws it stretched to the canvas; landmarks are mapped by `x / frame.width * W`, then flipped |
| Overlay extensibility | `src/nodes/output/overlay_contributions.ts` | an extension contributes an overlay element that draws with only its declared inputs and the frame geometry, and is a no-op until a lazy extension has loaded |
| Latency evidence | `docs/research/latency-budget-and-browser-realtime.md` | hand movement to loudspeaker is about 100 ms plus camera hardware; the DAG tick is 0.27 ms; inference 20.5 ms |
| Extension model | `docs/design/lazy-extensions.md`, `packages/sdk/src/instruments/extension.ts` | an extension declares `provides` node types, dial slices, branches, instruments and `transient` ports; the deferred half is a dynamic `import()` |

Gaps this note fills: no screen-space pointer node, the pinch has no latched position, no per-axis 2D filter (the One Euro node is scalar, so x and y would be filtered independently and lag anisotropically), no stroke or scene value, no registration transform shared by overlay and mapping (the backdrop stretches the video; it does not crop to cover).

## 2. Pinch detection

### 2.1 The signal

Thumb tip (landmark 4) to index tip (landmark 8), divided by a hand-size scale so the number does not change when the hand moves toward or away from the camera. thoremin divides by `handScale` in 2D pixels; the catalog variants divide by palm span in 3D world coordinates. Prefer the 3D world distance when available: seen from the front, thumb and index tips can overlap in the image while being centimetres apart in depth, and a 2D distance reads that as a pinch. The world landmarks are metric-relative to the hand centre, roughly invariant to where the hand is in the frame [1][3]. The cost is that the world z is predicted, not measured, so it is noisier than x and y. Cheap compromise: require both (2D ratio below the on threshold) and (3D ratio below a looser one) to enter, either to stay.

### 2.2 Thresholds from shipped systems

| System | Entry | Exit | Note |
|---|---|---|---|
| Meta Quest grab spec [7] | thumb-index distance 1.6 cm | releases above 3 cm, and 2 cm above the minimum distance seen during the pinch | the second rule makes the exit adapt to how tightly this user pinched; hover has its own pair, 5 cm in and 8 cm out. Meta notes that ML-based pinch is prone to accidental release and always releases when tracking is lost |
| Meta palm grab [7] | grab strength 0.9 | 0.85 | a tight 5% gap on purpose |
| Ultraleap [8] | `PinchStrength` above 0.8 | below 0.7 | docs recommend a release value lower than the activation value so a value sitting on the threshold does not jitter |
| thoremin today | pinch 0.6 | pinch 0.45 | in distance-over-hand-scale terms about 0.63 on and 0.77 off, from the 0.25 to 1.2 map |

Take-away: the on/off gap is 0.1 to 0.15 of the normalised range (or 1.4 cm, in Meta's absolute case). thoremin's 0.15 gap is already in range. What none of these give you is a debounce or a position latch; those are in 2.3.

### 2.3 The state machine to build

```ts
// pinch-state, per hand. Inputs: pinch ratio r (distance over hand scale), present, timestamp.
type PinchEdge = 'down' | 'up' | null;
interface PinchState { down: boolean; edge: PinchEdge; anchor: {x:number;y:number}; strength: number }

const P = { on: 0.63, off: 0.77,          // ratio thresholds (hysteresis), from the section 2.2 table
            onFrames: 2, offFrames: 2,    // debounce
            lossGraceMs: 150,             // keep the pinch through a short tracking dropout
            lookbackMs: 100 };            // latch window, see below
```

1. **Hysteresis.** Enter when `r < on`, leave when `r > off` (ratio form: lower is more pinched).
2. **Debounce.** Require `onFrames` consecutive frames under `on` and `offFrames` over `off`. At 30 fps two frames is 67 ms of added decision latency, so keep it at 1 to 2 for drawing and 2 to 3 for grabbing something heavy. Do not debounce the cursor, only the edge.
3. **Tracking-loss grace.** When the hand disappears mid-pinch (occlusion, motion blur), hold the state for `lossGraceMs` before sending `up`. Meta releases at once [7]; for ink, a stroke split by a 2-frame dropout is worse than one that lingers 150 ms. Drop the grace if the hand leaves the frame edge.
4. **Latch the anchor (pinch-drift).** Keep a ring buffer of the last ~100 ms of anchor positions. When `down` fires, set the stroke or grab origin to the buffered position from before the fingers began to close (detect closing onset as the last time the closing speed `-dr/dt` exceeded a small value), not the position at detection. On `up`, do the mirror image: stop recording at the position from when the opening began and discard the samples after it ("tail trim", 2 to 3 frames). The research behind this: the Heisenberg effect is the shift of the tracked pose caused by the confirming action, larger for hand pinch than for a controller button [9]; the 2026 study measures it as the angular offset between the start and end of the selection action and uses the pinch onset to find the true start; a glossary entry lists "use the last known position before the pinch activates" as the common fix [9]. Gaze-plus-pinch avoids the problem by separating pointing from confirming [10], which a webcam cannot do, hence the latch.
5. **Pick an anchor that the click does not move.** The midpoint of thumb tip and index tip is symmetric under a closing pinch; the index tip alone slides by about half the gap. A palm-anchored cursor (the mean of wrist and the four MCP knuckles) does not move at all during a pinch but cannot do fine strokes. Use the pinch midpoint for ink and the palm for grabbing objects.
6. **Pinch strength as a second output.** Emit the continuous `strength` too (thoremin's `pinch` 0 to 1): it is a free pressure channel for ink width, and Ultraleap and thoremin both expose it that way [8].
7. **Adapt the exit to the user.** Meta's rule "release 2 cm above the minimum seen" [7] is the cheap version of a per-pinch threshold: remember the tightest `r` during this pinch and release at `max(off_min, r_min + delta)`. It stops a loose, imprecise pinch from releasing at once and a tight one from staying "on" through a relaxed grip.

Cost: a few arithmetic operations per hand per frame; the ring buffer is 4 to 8 entries. The delay it adds is the debounce (one or two frames) and nothing else, because the latch moves the stroke start backward in time rather than waiting.

## 3. Grab versus pinch

| | Pinch (thumb and index) | Grab (fist or curled fingers) |
|---|---|---|
| Good for | ink, small or precise objects, UI | big objects, carrying, throwing |
| Anchor | pinch midpoint | palm centre |
| Perturbs the anchor when it fires | yes (Heisenberg) | much less, the palm barely moves |
| Failure | thumb and index overlap in depth give false pinches from the front | fingers occlude each other in a fist, so landmarks degrade |
| Existing in thoremin | `pinch` feature plus `pinch` pose | `openness` feature plus `fist` pose (openness under 0.25) |
| Strength thresholds from others | 0.8 / 0.7 [8]; 1.6 cm / 3 cm [7] | 0.9 / 0.85 [7] |

Rule of thumb for the instrument: pinch to draw and to pick small things, closed fist to hold and drag larger things, open palm as the "release everything" and as a hover cursor. Because the gesture classifier already gives priority pinch over fist over open, a pinch cannot become a fist silently; a pinch turning into a fist while dragging should continue the drag (a hand-off with a hysteresis band), not drop the object.

## 4. Drag, rotate and scale, with one and two hands

### 4.1 One hand

- **Drag.** On grab, store the offset `o = objectPos - anchor`; each frame `objectPos = anchor_smoothed + o`. Never snap the object's centre to the cursor (a visible jump), always keep the offset.
- **Rotate with no extra gesture.** Kruger et al.'s "Rotate'N Translate" (RNT, CHI 2005) rotates an object about its centre as a by-product of dragging it off-centre with a single point, so one contact controls rotation and translation together [25]. Reproduce it by treating the grab point as a rope: object heading follows the direction of motion with a damping factor. This is the cheapest single-hand rotate and it is the one a pinch can do.
- **Rotate with the hand's roll.** Capture the hand's in-plane angle at grab, `phi0 = atan2(middleMCP - wrist)`, and rotate the object by `phi - phi0`. Natural for dials and knobs. Unwrap the angle (add 2 pi when it jumps by more than pi) or the object will spin at the wrap.
- **Scale.** One hand has one scalar for it: the hand's own apparent size (moving it toward the camera). Use only if depth is calibrated (section 5), otherwise leave scale to two hands.

### 4.2 Two hands: the similarity transform

Two grab points give 4 degrees of freedom: translation (2), rotation (1) and uniform scale (1). Exactly the same maths as two-finger pinch zoom. With anchors `a0, b0` at the start of the gesture and `a, b` now:

```ts
// Object transform at gesture start: T0 (position p0, angle th0, scale s0).
const d0 = sub(b0, a0), d = sub(b, a);
const s  = len(d) / len(d0);                       // relative scale
const dth = Math.atan2(d.y, d.x) - Math.atan2(d0.y, d0.x);   // relative rotation (unwrap!)
const m0 = mid(a0, b0), m = mid(a, b);             // midpoints
// Keep the object point that was under m0 now under m:
//   p = m + s * R(dth) * (p0 - m0)
const p   = add(m, scale(rot(sub(p0, m0), dth), s));
const th  = th0 + dth;
const sc  = s0 * s;
```

Practical points:

- **Both hands must be grabbing the same object.** Pick by hit test at the moment the second hand grabs; if it hits a different object, treat the hands as independent one-hand drags.
- **Dead-zones.** A two-hand translate shouldn't change scale or angle because the hands wobble. Apply a dead-zone to `log(s)` and `dth` (a few percent and a few degrees) and ease out of it, the same trick as the camera-independent hysteresis in section 2.
- **Clamp** scale to a range (for example 0.2 to 5 times) and filter `log(s)` and `dth` through One Euro; smooth them in log space so zoom feels symmetric.
- **Depth variant.** In 3D, take the two anchors as `(x, y, z)` with z from the palm-size estimate; the same maths gives a 3D scale and a yaw about the vertical (or the full rotation via the Kabsch algorithm over more than two points). For the first version stay in 2D; z noise makes the third dimension feel mushy.
- **One hand lifting off.** When one hand releases, the object stays with the other and the stored start state is reset (`T0`, `a0`, `b0`) to the current one so nothing jumps.
- **Handedness caveat.** thoremin already corrects for the mirror in labels (`mirrorHandedness`); the label can still flicker, so key grab ownership on tracked hand index plus the dwell, not on the label.

## 5. Depth from one camera

### 5.1 What MediaPipe gives you

- Image landmarks: x and y normalised to the image, z "measured from the wrist, the smaller the value the closer to the camera, at roughly the same scale as x" [1].
- World landmarks: "real-world 3D coordinates in meters with the origin at the hand's geometric center" [1].

Neither tells you how far the hand is from the lens. The world landmarks are the model's guess at the hand's own shape at a fixed prior scale; they are good for scale-invariant features (which is how thoremin uses them) and are not a ranging device. The model predicts a "2.5D" pose from RGB alone [3].

### 5.2 Distance from apparent palm size (cheap, usable)

Pinhole model: `Z = f_px * L_real / L_px`, where `L_px` is the image length of a hand segment (wrist to middle-finger MCP, or index MCP to pinky MCP), `L_real` the true length, `f_px` the focal length in pixels. `f_px = (imageWidth / 2) / tan(HFOV / 2)`; typical webcam horizontal FOV is 60 to 80 degrees and differs by device and by whether the browser crops the sensor for the chosen resolution, so it is not knowable from a page without calibration (to measure per device).

Two refinements that matter:

1. Measure the segment length in the world landmarks (metres, pose-invariant) and in the image (pixels, foreshortened by hand tilt); the ratio `L_world / L_px` then corrects for tilt: `Z = f_px * L_world / L_px`. The remaining error is that world landmarks assume a standard hand size.
2. Adult hand breadth (index to little-finger knuckle) is roughly 7.5 to 9.5 cm across sources, men about 1 to 1.5 cm wider than women [38]. A 10 to 15% scale error per person is therefore expected; one calibration step ("hold your hand 40 cm from the screen, press the button") fixes a single multiplier `k`.

Because `Z` goes as 1/size, filter `log Z` (or the size itself) with the One Euro filter, never `Z`. Expect noise to be a few percent of the size (landmark jitter against a palm 80 to 150 px wide); the resulting depth precision is centimetres at arm's length, which is enough for a "push through the surface" gesture and a coarse z layer, not for fine 3D placement (estimate; measure on recorded footage, which the repo's recorder already makes easy).

What thoremin gains: a push gesture (z velocity) as a click that does not disturb x and y, a z layer for objects (near hand moves the front object), and a distance-compensated mapping. What it costs: nothing but arithmetic.

### 5.3 A depth network in the browser

| Model | Size and licence | Browser path | Verdict |
|---|---|---|---|
| Depth Anything V2 Small [11][12] | 24.8 M parameters; ONNX export 99.1 MB fp32, 49.6 MB fp16, 27.3 MB int8, 19.1 MB q4f16; **Apache-2.0** | Transformers.js `depth-estimation` pipeline [12]; a Hugging Face Space demonstrates real-time webcam depth in the browser, with an input-size slider from 140 to 840 px (default 504) [14] | study, optional lazy extension |
| Depth Anything V2 Base, Large, Giant [11][13] | Base ONNX 389 MB fp32, 102 MB int8; **CC-BY-NC-4.0** (non-commercial) | same | avoid for anything shipped |
| MiDaS [15] | MIT, repository archived 2024-08 | via ONNX | avoid, superseded |

Facts and gaps: the output is relative (affine-invariant) depth, not metric; consecutive frames flicker unless smoothed; I found no published frame rate for Depth Anything V2 Small with WebGPU on a webcam, only the demo (to measure). The expected shape of the cost: the hand model already takes 20 ms per frame on the GPU in thoremin [39], and a ViT-S depth model at a few hundred pixels would share that GPU, so it will cut the tick rate or run at a lower rate on its own worker. Use cases that justify it: occluding virtual objects behind the real hand or desk, placing objects "on" the table, and a depth-keyed background for the AR look. None is needed for drawing or moving. Ship it only as a lazy extension (`ext-depth`), loaded when a graph names its node, so a player who never draws pays nothing (the lazy-extensions rule).

## 6. Smoothing and prediction

### 6.1 The One Euro filter

Casiez, Roussel and Vogel [4]: a first-order low-pass whose cutoff rises with the (itself filtered) speed of the signal. Heavy smoothing at rest removes jitter; light smoothing in fast motion removes lag.

```
tau   = 1 / (2 pi fc)
alpha = 1 / (1 + tau / dt)            // dt = time since last sample, in seconds
dxhat = lowpass(dx / dt, alpha(dcutoff))
fc    = fcmin + beta * |dxhat|
xhat  = lowpass(x, alpha(fc))
```

Tuning, from the authors [5][6]: set `beta = 0` and `fcmin` around 1 Hz; hold still or move slowly and lower `fcmin` until jitter is gone; then move fast and raise `beta` until lag is gone; `dcutoff` stays at 1 Hz. Find the order of magnitude of `beta` first (start near 0.001 or 0.0001 and multiply or divide by 10), because it depends on the units of the signal [6].

Three things that bite in this application:

1. **Units.** `beta` multiplies a speed in signal units per second, so if you change the signal from pixels to normalised coordinates (divide by the width W), the same behaviour needs `beta * W`. thoremin's node default `beta 0.01` was picked for its own signals; for a 0..1 screen coordinate expect a value one to three orders of magnitude larger (derivation from the formula above; verify by eye with the interactive demo [5]).
2. **2D.** Filter the vector, with the speed `|dxhat|` taken as the 2D norm and one shared cutoff for x and y. Two scalar filters give a diagonal stroke different lag in x and y and visible shape distortion. thoremin's `one-euro` node is scalar, so build a `cursor-smooth` node (or a vector option on the existing one).
3. **Frame rate.** The filter takes `dt` per sample; parameters tuned at 30 fps shift at 60. Use the actual capture timestamps (thoremin stamps frames with `requestVideoFrameCallback` capture time, #226), which also absorb the camera's own ±3 ms period jitter [39].

Starting points to tune by eye for a drawing cursor in a 0..1 coordinate system (my suggestion, not measured): `fcmin` 1.0 to 2.0 Hz, `beta` 1 to 10 (equivalent to about 0.002 to 0.02 per pixel on a 500 px canvas), `dcutoff` 1.0 Hz. For object positions and scale, lower `fcmin` (0.5 to 1 Hz) is acceptable; for the pinch strength used as pressure use a plain `fcmin` 3 to 5 Hz, `beta` 0.

### 6.2 Kalman and prediction

I found no head-to-head study of a Kalman filter against One Euro on hand landmarks. The animation literature says real-time systems choose One Euro because it balances jitter and lag adaptively and has two parameters; the one VR comparison found (head tracking, not hands) ranked Kalman worst on jitter among four prediction methods. A constant-velocity Kalman or an alpha-beta filter is a reasonable second implementation behind the same seam, with the process-noise ratio as the single knob, and is the natural place to add prediction. Measure both on recorded hand data at the real frame rate, which the recorder makes possible offline.

Prediction (extrapolating by the pipeline latency L, say 50 to 100 ms) removes the felt lag of the cursor and amplifies jitter in proportion to L times the velocity noise, and overshoots at reversals, which is exactly where a drawn curve turns. The safe pattern is two layers:

- **Cursor (the dot under the fingertip): predicted**, to feel attached to the hand.
- **Ink (committed samples): filtered, not predicted**, so a stroke never contains an extrapolation error.

Gate prediction on speed (off below a few cm/s) and cap the extrapolation. thoremin's `docs/research/subframe-impact-prediction.md` and `docs/research/intent-and-subframe-timing.md` already treat the audio side of this trade; the drawing side wants the same actuality-versus-intent framing.

## 7. Stroke capture

Pipeline, per hand, from `down` to `up`:

1. **Sample** the latched, filtered anchor at the camera rate (30 fps typical). Fast hand motion crosses 50 to 100 px per frame, so the raw polyline is visibly faceted. Do not draw the raw polyline.
2. **Interpolate.** Centripetal Catmull-Rom (alpha 0.5) is the only member of the family that cannot produce cusps or self-intersections within a segment [19], which is the right default for sparse, unevenly spaced points. Evaluate it for display; keep the sampled points as the data.
3. **Variable width.** `perfect-freehand` [16] (MIT, 5.8 k stars, last push 2026-04) turns points into a closed outline polygon (`getStroke(points, {size, thinning, smoothing, streamline, simulatePressure, start, end})`; defaults size 8, thinning 0.5, smoothing 0.5, streamline 0.5). It simulates pressure from speed by default; with a webcam feed it `[x, y, pressure]` triples with `simulatePressure: false`, where pressure is the filtered pinch strength (a tighter pinch makes a thicker line, a pleasing and learnable control) or normalised palm depth. Renders to canvas or SVG.
4. **Store compactly.** Ramer-Douglas-Peucker with a tolerance in pixels. Quick Draw's published data uses epsilon 2.0 on a 256 px grid after resampling [23]; `simplify-js` [17] (BSD-2-Clause) is a 1 kB implementation. Keep timestamps with each kept point: for music, the timing of the drawing is data (section 13).
5. **Fit curves (optional).** Schneider's algorithm (Graphics Gems, 1990) fits piecewise cubic Béziers to a polyline within an error bound; `fit-curve` on npm is a JS port [18]. Worth it for the saved/exported form (SVG paths) and for reducing a 400-point stroke to a dozen segments; not needed for live display.
6. **Close or open.** A stroke whose end is within (say) 10% of its length of its start is closed; this decides wavetable and shape handling later.

Cost: all of it is linear in the number of points; a stroke of a few hundred points costs well under a millisecond per frame for resample and fit, and the outline regeneration per frame for a live stroke is the only part that grows (estimate; regenerate only the last window, or the whole stroke at 30 fps, which is fine to a few thousand points).

## 8. Beautification and shape recognition

Two different jobs. **Snapping** ("make my wobbly circle a circle") and **recognising** ("what did I draw").

| Method | What it is | Licence, size | Use here |
|---|---|---|---|
| $1 [20] | template matching for single-stroke gestures: resample, rotate, scale, translate, then mean point distance. Over 97% accuracy with one template and 99% with three or more, in the original study | New BSD; about 100 lines | line, circle, triangle, square, star, check marks, an editing vocabulary |
| $P and $N [20] | $P: multi-stroke gestures as unordered point clouds, ignoring stroke number, order and direction; $N: multistroke by permutation | New BSD | multi-stroke symbols (an X made of two strokes) |
| $Q [20][22] | $P tuned for low-power devices; the project page says about 142 times faster than $P and slightly more accurate | New BSD | the one to embed if you template-match; milliseconds even on weak phones |
| Geometric fit | least-squares circle and ellipse, line fit, polygon by RDP corner count | none | cheapest snap for the five shapes people actually draw |
| Quick, Draw! data [23] | 50 million drawings, 345 categories, raw ndjson with timing, simplified (RDP epsilon 2.0), 28x28 bitmaps, Sketch-RNN subsets; **CC BY 4.0** | dataset | train a small tfjs CNN on the bitmaps to recognise "what is it" |
| Sketch-RNN, in Magenta.js [24] | generative model of strokes trained on Quick Draw; Apache-2.0 | library | "continue my drawing" as a generative-music-like toy, not v1 |

Recommended: geometric fits for snapping to primitives, because the answer is a parametric object (centre, radius) that the scene can then move and the music can use; $Q for a small user-defined gesture vocabulary (draw a spiral to clear); Quick Draw only if "name that doodle" becomes a feature. All run per stroke at `up`, not per frame, so cost is irrelevant. Snap with a blend factor the player can ease in (0 = raw, 1 = perfect) rather than a switch.

## 9. Rendering overlays registered on a mirrored video

### 9.1 Choice

| Option | Strengths | Limits | Verdict |
|---|---|---|---|
| Canvas 2D (thoremin's overlay today) | already there; perfect-freehand and Path2D draw straight into it; cheap | no scene graph; hit testing is yours | **v1** for ink and 2D objects, as an overlay element |
| SVG | DOM nodes: hit testing, CSS, accessibility for free; perfect-freehand outlines are SVG paths | slows with thousands of nodes; its own layer above the canvas | good for the object layer if there are under a few hundred objects |
| three.js [30] (MIT, 117 k stars, active) | real 3D, depth-sorted objects, lighting, a camera you can match to the webcam | a second renderer and a WebGL context beside the overlay canvas | lazy extension when objects need to be 3D |
| react-three-fiber [31] (MIT) and drei | declarative scene as React components | React in the render path; thoremin's DAG tick is outside React | study; only for a panel, not the hot path |

Whatever the renderer: **keep the scene model (positions, transforms, strokes) in the node, not in the renderer**, so the audio, the overlay and the recorder read the same value and the headless tests need no canvas.

### 9.2 The coordinate transforms

Three spaces: **frame pixels** (what MediaPipe returns, un-mirrored, origin top-left of the camera frame), **display pixels** (the canvas or element you draw on) and **scene units** (what objects live in; use normalised 0..1 of the displayed, cropped video so scenes survive resizing). One function owns the mapping, shared by the overlay and the mapping nodes:

```ts
// frame (vw x vh, un-mirrored)  ->  display (W x H), object-fit: cover, mirrored
function frameToDisplay(x: number, y: number, vw: number, vh: number, W: number, H: number, mirror = true, fit: 'cover' | 'contain' | 'stretch' = 'cover') {
  const sx = W / vw, sy = H / vh;
  const k  = fit === 'cover' ? Math.max(sx, sy) : fit === 'contain' ? Math.min(sx, sy) : 0;
  const [kx, ky] = fit === 'stretch' ? [sx, sy] : [k, k];
  const ox = (W - vw * kx) / 2, oy = (H - vh * ky) / 2;   // negative for cover: the cropped margin
  let u = ox + x * kx, v = oy + y * ky;
  if (mirror) u = W - u;
  return { u, v };
}
```

Notes:

- **Cover cropping.** With `object-fit: cover` part of the frame is outside the display; a hand that is in the frame but cropped away has a negative or over-W coordinate. Decide per instrument whether to crop (full-bleed look) or letterbox (the player sees all that the camera sees). thoremin's backdrop currently stretches the video to the canvas (`drawImage(video, 0, 0, W, H)`), so it is correct only while the canvas has the video's aspect; routing it through this one function removes that assumption.
- **Mirror once, at the transform.** Flip x here, never again; mirror the *picture and the positions* but never the text, labels or handedness-coded colours. thoremin already swaps handedness labels (`mirrorHandedness`) and colours (`isDisplayedRight`); the new nodes must read the already-mirrored pointer, not re-derive it.
- **Do not CSS-flip the whole container** if any child has text; flip the video layer and the coordinates, not the DOM.
- **Three.js.** Use an orthographic camera in display pixels for 2D-flavoured objects. For true 3D, set the perspective camera's vertical FOV to the webcam's and place objects at depth `Z`; a hand point `(u, v)` at depth `Z` back-projects to `X = (u - cx) * Z / f_px`, `Y = (v - cy) * Z / f_px` (same pinhole model as section 5.2, so the depth calibration serves both).
- **Overlay-only output.** thoremin's overlay already has an overlay-only (alpha) pass for transparent takes: the scene element must draw on it too.

## 10. Latency budget per stage

Reusing the measured numbers from thoremin's own budget [39] (M1 Max, Chrome 153, GPU delegate) and adding the drawing stages. "Camera wait" is the average wait for the frame containing the motion, half the frame period.

| Stage | 30 fps | 60 fps | Note |
|---|---|---|---|
| Camera wait (average) | 16.7 ms | 8.3 ms | fixed by hardware and mode; sensor, ISP, USB add an unmeasured, device-dependent amount (one source breaks about 100 ms to camera and USB on Linux [39]) |
| Capture to frame handed to model | about 4 ms | about 4 ms | measured on a fake camera |
| Hand landmark inference | 20.5 ms (p95 26.5) | same | main thread, GPU delegate; at 60 fps this single stage already overruns the 16.7 ms frame, so 60 fps in is useful only if inference moves to a worker and results are consumed as they arrive |
| Pinch state, latch, 2D One Euro, anchors | well under 0.1 ms | same | pure arithmetic; debounce adds 1 to 2 frames of decision delay (33 to 67 ms at 30 fps), not compute |
| Stroke sample, RDP, hit tests, two-hand transform | under 0.1 ms | same | estimate |
| perfect-freehand outline of the live stroke | well under 1 ms for hundreds of points | same | estimate; scales with points, window it for very long strokes |
| Canvas draw of video, landmarks and ink | 1 to 3 ms | same | estimate; the DAG tick measured 0.27 ms including overlay calls |
| Scan-out to the display | up to 1 refresh (8.3 ms at 120 Hz, 16.7 ms at 60 Hz) | same | |
| Physics step (if used) | about 0.1 to 1 ms for tens of bodies | same | estimate; fixed step |
| Audio parameter write to speaker | about 32 ms | same | measured [39] |
| Depth network (if used) | to measure | to measure | not in the interactive path in v1 |

Reading it: the visual path (hand to ink on screen) is camera wait plus camera hardware plus about 25 ms of inference-and-transfer plus one refresh, so roughly 50 ms plus hardware at 30 fps, a little over 40 ms plus hardware at 60 fps; the audio path adds another 32 ms and a 20 to 70 ms synth glide. Continuous control tolerates 20 to 30 ms; this is above it, which is why the **two-layer cursor** (predicted dot, committed ink) of section 6.2 earns its place and why gestures that need precise timing (taps on pads) should use the speed-based impact prediction already researched in `docs/research/subframe-impact-prediction.md`, not the raw frame time.

**A registration defect to design out.** The overlay draws the live `<video>` element (its newest frame) while landmarks come from the frame processed about 25 ms earlier, so at fast hand speeds the ink and cursor trail the visible fingertip (inferred from the repo's frame pump and overlay code and the budget above; to confirm on a recording). Two fixes: (a) draw the video frame the landmarks were computed from, by holding an `ImageBitmap` of the inferred frame (one copy per inference, a few ms of GPU/CPU transfer at 720p; to measure), which makes video and ink agree with each other but shows the whole picture about 25 ms late; or (b) keep the live video and draw the cursor with the section 6.2 prediction so that it lands on the finger. (b) is free and is the default; (a) is an option for stills and recordings.

## 11. Existing open-source demos and libraries

Metadata checked with the GitHub API on 2026-10-25; I read repository descriptions, not source, for the demos. "Verdict" is depend, wrap, study or avoid.

| Project | Licence | Maturity | What it is | Verdict |
|---|---|---|---|---|
| MediaPipe tasks-vision [1] (google-ai-edge/mediapipe) | Apache-2.0 | 37 k stars, pushed today | the hand model thoremin already uses | depend (already) |
| perfect-freehand [16] | MIT | 5.8 k stars, pushed 2026-04 | variable-width stroke outlines | **depend** (lazy chunk) |
| simplify-js [17] | BSD-2-Clause | 2.4 k stars, last push 2022 (stable, tiny) | RDP and radial-distance simplification | depend or copy (it is 100 lines) |
| fit-curve [18] | MIT (npm; check) | small | Schneider Bézier fitting | wrap if SVG export is wanted |
| $-family JS ports [20] | New BSD (originals) | the algorithms are stable, ports vary | $1/$P/$Q recognisers | wrap or re-implement (they are short) |
| Matter.js [32] | MIT | 18 k stars, pushed 2026-09 | 2D rigid-body physics | depend for v1 physics |
| Rapier [33] (dimforge/rapier) | Apache-2.0 | 5.9 k stars, active; the old `rapier.js` repo is archived, the project moved | 2D and 3D physics in WebAssembly, with deterministic builds | study; use if determinism and 3D matter |
| three.js [30], react-three-fiber [31] | MIT | very active | 3D rendering | depend lazily if 3D objects come |
| Excalidraw [36] | MIT | 134 k stars, active | whole-canvas drawing app with a documented scene model | study its element and scene JSON |
| tldraw [36] | custom licence (GitHub reports NOASSERTION) | 51 k stars, active | canvas SDK; the author of perfect-freehand | study; read the licence before any dependency |
| handtrack.js [34] | MIT | 2.9 k stars, last push 2022 | TF.js SSD hand box detector, boxes only | avoid, superseded by landmark models |
| fingerpose [35] | MIT | 510 stars, last push 2023 | rule-based finger curl and direction gesture descriptions over TF.js handpose landmarks | study the finger-state vocabulary |
| Handsfree.js (a mirror copy) | Apache-2.0 | 23 stars, last push 2024-09 | face, hand and pose interaction toolkit | study only |
| "Air canvas" MediaPipe repos [37] (for example Air-Drawing-Dashboard, aurora-air-canvas, Air_Draw, airpaint-gesture-canvas-ai) | mostly MIT | 1 to 6 stars, 2026, long tail | a pinch or index-finger draws on a canvas over the video | study the idea; none is something to depend on, and the long tail is evidence that the basic effect is a weekend of work and the quality is in the section 2 and 6 details |
| Three.js plus MediaPipe pick-and-move demos [37] (object-pick-with-hands, H-O-L-O) | no licence file reported | 0 stars | pinch to pick and move a 3D object | cannot reuse without a licence; study the idea |

What the ecosystem shows: there is no mature library for "pinch state machine plus pointer plus stroke plus scene" on top of MediaPipe, only demos. That gap is the reason for building it as thoremin's own typed nodes rather than adopting one.

## 12. What the player would get, and what it costs

| Capability | The player can | Cost | Where it sits |
|---|---|---|---|
| Latched pinch pointer | click and draw without the jump | 1 to 2 frames debounce | core-adjacent feature node |
| Ink with variable width | draw lines that look hand-made | one lazy chunk (perfect-freehand, a few kB) | extension |
| Grab, drag, rotate, scale | move shapes with one or two hands | arithmetic | extension |
| Snap and recognise | draw a circle and get one | per-stroke only | extension |
| Depth (palm size) | push through, z layers | one calibration | feature node |
| Depth network | occlusion, table placement | GPU contention, 20 to 100 MB model | separate lazy extension, off by default |

## 13. Making drawn and moved objects musical

Principle: the scene is a **value**, like `HandFeatures`, and the music nodes read it. Nothing in the scene knows about sound; that is what lets the same drawing drive a synth, MIDI out or a generative layer by re-wiring.

### 13.1 A drawn path is a melody

- **Contour melody.** Treat x as time and y as pitch (a piano-roll without the grid). Play it by a playhead that sweeps across (tempo from the `transport` node's beat) or that the other hand scrubs. Pitch passes through thoremin's magnetic scale snap (`src/music/theory.ts`), so a wobbly line plays in key, the same trick the hand already uses. Optionally quantise onsets to the beat grid.
- **Path as recorded gesture.** Keep the sample times: a stroke replays at the speed it was drawn, or retimed to the bar. A drawn arc then carries the player's own phrasing. thoremin's recording v2 already stores timed streams; a stroke is a short one.
- **Pressure channels.** Pinch strength along the stroke becomes velocity or amplitude; stroke speed becomes brightness. This ties the two uses of pinch strength (width, loudness) together visibly: thick is loud.

### 13.2 A drawn shape is a wavetable

Resample the stroke to N points (for example 2048) along arc length; for an open stroke, make it periodic (cross-fade the ends or mirror it); remove the DC offset and normalise; take its DFT. Web Audio's `createPeriodicWave(real, imag)` takes the cosine and sine coefficients in ascending harmonic order, the first being the DC term, and normalises by default [27]; `oscillator.setPeriodicWave(wave)` plays it, band-limited by the browser. A closed shape can be read in polar form (radius against angle) for a more organic result. This is the UPIC idea (Xenakis, CEMAMu, 1977: draw waveforms and envelopes on a tablet, then trace a graphic score) [28] done with the hand, and it gives an instrument players find in seconds: "draw your own sound". Redraw while holding a note to morph live (cross-fade between two `PeriodicWave`s). The seam: thoremin's `webaudio-synth` uses declarative timbre presets (`src/music/sounds.ts`); a drawn wave needs an optional `wave` input on the synth or a new `wavetable-synth` node. That is a core change to name now, not a surprise later.

### 13.3 A drawn curve is an automation curve

A stroke normalised to 0..1 on both axes is a function: LFO shape, envelope (draw the ADSR), filter sweep or a pitch glide. Loop it over a bar of the transport, or scrub it with a hand. This is where drawing beats sliders: a shape you could not parametrise is one stroke. Output type: `number` per tick, so it wires into any existing input (`voice-mapping`, filter, vibrato depth) with no new plumbing.

### 13.4 Placed objects

- **Pad (trigger).** An object the hand taps or enters triggers a note; velocity from approach speed (and for a webcam, the depth push of section 5.2 is a good "press" signal). Tap timing uses the subframe impact prediction already researched, because a pad is exactly the use case where 33 ms matters.
- **Zone (continuous).** A region maps the hand's position inside it to parameters, like thoremin's existing pitch/volume field but placed and shaped by the player; overlapping zones are layers.
- **XY puck.** A draggable object whose position is a 2D control; with inertia it can be "thrown" and glide to rest, giving the controller a physical feel. Position through a One Euro filter first.
- **Fader and knob.** A handle constrained to a drawn line is a fader (arc length along the line is the value); a pinch plus roll on a circle is a knob (section 4.1). Draw the line and you have made the control.
- **Reactable lineage.** Placing and moving objects on a surface to build and play a sound topology is a tested instrument idea (Jordà et al., the reacTable, 2007) [29]; here the physical pucks become virtual, and the camera is the table.

### 13.5 A canvas you play

The drawing is the score and the hands are the playhead. A vertical line (a hand, or a free-running scan) reads the ink under it: the y position of each ink point is a pitch, ink density is loudness, colour is timbre. UPIC and its descendants worked this way [28]. Scrubbing back and forth is playing; speed of the sweep is tempo. This is the most "instrument" of the list because the same picture sounds different each time it is played.

### 13.6 Physics objects that bounce and trigger

Objects with gravity, walls and restitution; **a collision is a note-on** with velocity from impact speed and pitch from the wall hit (each wall segment is a scale degree) or the object's size. The hand is a kinematic body (a palm polygon from landmarks) that pushes things, so playing is nudging. Matter.js [32] is enough for v1; Rapier [33] has builds that guarantee cross-platform determinism. **Determinism constraint specific to thoremin:** the engine replays recordings and runs headless with a deterministic batch clock, so the physics must step at a fixed `dt` with an accumulator, not at the frame's `dt`, and must be seedable, otherwise a replayed take sounds different. Collisions are events, not values; they should arrive on a typed event port like `gesture-classifier`'s `events`.

### 13.7 What each mapping needs from the core

| Idea | Value flowing | New seam in core |
|---|---|---|
| Contour melody, path replay | `Stroke` to `voices` | none (voices already exist) |
| Automation curve | `Stroke` to `number` | none |
| Pad, zone, puck, fader | `SceneObjects` to events and numbers | none |
| Physics notes | `SceneObjects` to `events` | none, but a fixed-step rule |
| Drawn wavetable | `Stroke` to a wave | an optional `wave` on the synth |
| Canvas you play | `Stroke[]` to `voices` | none |

## 14. How this becomes nodes in thoremin's typed DAG, as a lazy extension

New port kinds: `pinch-state`, `pointer`, `stroke`, `scene`. Existing kinds reused: `hands`, `hand-features`, `number`, `voices` (via `synth-merge`), `events`. Packaged as an extension `ext-draw` per `docs/design/lazy-extensions.md`: eager stub declares `provides` and the dial slice; deferred half holds the node code and perfect-freehand; a second lazy hop holds physics and depth.

| Node | Inputs to outputs | Notes |
|---|---|---|
| `pointer` | `hands` (+ `hand-features`) to `pointer` per hand: `{present, x, y, z, roll, anchorKind}` in scene units | applies `frameToDisplay` (the shared transform), the mirror, the cover crop; the anchor choice (pinch midpoint or palm); an optional palm-size depth |
| `pinch-state` | `pointer` + pinch ratio to `pinch-state`: `{down, strength, edge, latchedAnchor}` | the section 2.3 state machine; parameters as a Zod schema (on, off, frames, grace, lookback) so they become dials; supersedes the pinch branch of `gesture-classifier` for drawing while leaving that node alone |
| `cursor-smooth` | `pointer` to `pointer` | 2D One Euro with shared cutoff, plus optional prediction on a separate output (`predicted`) for the cursor dot |
| `stroke-capture` | `pinch-state` + `pointer` to `stroke` (`live`) and `events` (`stroke-start`, `stroke-end`) | samples, tail trim, closed or open flag, RDP on `up`; the completed stroke is a value `{id, points: [x, y, t, pressure][], closed}` |
| `stroke-shape` | `stroke` to `stroke` (with `shape`) | snapping and recognition at `up` |
| `scene-objects` | `pointer[]`, `pinch-state[]`, `stroke` events, `commands` to `scene` and `events` | the stateful store: objects, grab ownership, two-hand transform, hit tests; physics optional behind a slot |
| `stroke-to-voices`, `scene-to-voices` | `stroke`/`scene` + `transport` to `voices` | the musical mappings of section 13, one node per mapping, each picked as a **slot** candidate so an instrument can swap melody-scrub for wavetable without re-wiring |
| `scene-overlay` | `scene` + `stroke` to overlay | contributed through `overlay_contributions.ts` so it draws with only its declared inputs and is a no-op until the lazy half loads |

Where state lives. The scene is runtime state like `gestureStatus` (the DAG produces it, React only displays it) and the persisted drawing (strokes the player wants to keep) is a whole-object dial slice in the extension's `dials`, as ASL does, so it is saved with an instrument, undoable through the command registry, and replayable. Per-tick motion never goes through a command (the repo's firewall rule); committing a finished stroke does.

Recording: `pointer`, `pinch-state` and the `stroke` events are plain data, so `StreamRecorder` captures them and `replayNode` can test the pinch state machine from recorded hand footage with no camera, which is how its thresholds should be tuned.

## 15. A minimal "draw and move" seed

Goal: the smallest instrument that proves the loop, and sets the seams. Extension `ext-draw`, seed instrument "Draw and Move" (silent first).

Graph:

```
webcam-hands ──► hand-features ──► pinch-state ──┐
      │                                  ▲       ├─► stroke-capture ─► scene-objects ─► scene-overlay
      └──────► pointer ──► cursor-smooth ┴───────┘                          │
                                                                              └─► scene-to-voices ─► synth-merge   (step 3)
```

Build order, each step shippable:

1. **Pointer and pinch.** `pointer` with `frameToDisplay` (cover, mirrored), `cursor-smooth`, `pinch-state` with the section 2.3 machine. Overlay: the cursor dot, a ring that fills with `strength`, a colour change on `down`. Acceptance: pinch without the dot jumping; unit-test the state machine on a recorded clip with a tight pinch, a loose pinch and a dropout.
2. **Ink.** `stroke-capture` and a `scene-overlay` that draws live and finished strokes with perfect-freehand; pinch strength as pressure; open palm held for a second clears. Acceptance: a circle drawn in the air looks like a hand-drawn circle, with no hook at the start or end.
3. **Move.** `scene-objects` with a few default objects (a circle, a square), pinch to pick (hit test with a radius margin), drag with offset, second hand for scale and rotate with dead-zones.
4. **Sound, smallest possible.** One mapping: the first stroke is a contour melody scrubbed by the other hand's x (section 13.1), through scale snap into the existing voice path. Then wavetable (13.2), then pads (13.4).
5. **Later.** Snap shapes, physics, depth, recording and replay of scenes, a thoremin-asl-like panel.

Configuration, not constants: every threshold above is a Zod param, becoming a dial; the default instrument stays untouched and a player who never opens the extension loads nothing.

## 16. Open questions to settle by measurement, not argument

- Pinch false-positive and drift rates of MediaPipe from the front versus from above, on recorded footage with the on/off pair of section 2.2 and the latch on and off. The repo has the recorder and replay for it.
- Whether depth from palm size is good enough for a push click at the player's usual distance, per webcam.
- The cost and frame rate of Depth Anything V2 Small on WebGPU beside the hand model on the target laptops; no published number was found.
- The video-versus-landmark offset of section 10 at 30 and 60 fps.
- One Euro versus constant-velocity Kalman on hand landmarks at the real frame rate; no published head-to-head was found.

## REFERENCES

[1] Hand landmarks detection guide for Web. Google AI Edge (MediaPipe), checked 2026-10-25. [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)

[2] Hand landmarks detection guide. Google AI Edge (MediaPipe), checked 2026-10-25. [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)

[3] Zhang F, Bazarevsky V, Vakunov A, et al. MediaPipe Hands: On-device Real-time Hand Tracking. CVPR Workshop on Computer Vision for AR/VR, 2020. [arXiv:2006.10214](https://arxiv.org/abs/2006.10214)

[4] Casiez G, Roussel N, Vogel D. 1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems. CHI 2012, pp. 2527-2530. [doi:10.1145/2207676.2208639](https://doi.org/10.1145/2207676.2208639)

[5] 1 € filter homepage, with tuning procedure and interactive demo. Casiez, Univ. Lille. [cristal.univ-lille.fr](https://cristal.univ-lille.fr/~casiez/1euro)

[6] OneEuroFilter reference implementations (C++, Python, JS, Arduino and others). Casiez et al. [github.com/casiez/OneEuroFilter](https://github.com/casiez/OneEuroFilter)

[7] Grab specs (pinch and palm-grab thresholds, hover pairs, release rules). Meta Horizon developer documentation, checked 2026-10-25. [developers.meta.com](https://developers.meta.com/horizon/design/grab_specs/)

[8] Pinch and Grab Detection (PinchStrength, GrabStrength, activation and release example). Ultraleap documentation, checked 2026-10-25. [docs.ultraleap.com](https://docs.ultraleap.com/xr-and-tabletop/xr/unity/plugin/features/pinch-and-grab-detection.html)

[9] Qiu L, Wang D, Li B, et al. Direct vs. Score-based Selection: Understanding the Heisenberg Effect in Target Acquisition Across Input Modalities in Virtual Reality. arXiv, 1 Feb 2026. [arXiv:2602.01061](https://arxiv.org/abs/2602.01061)

[10] Design Principles and Issues for Gaze and Pinch Interaction. arXiv, 2024. [arXiv:2401.10948](https://arxiv.org/pdf/2401.10948)

[11] Yang L, Kang B, Huang Z, et al. Depth Anything V2 (repository and licence statement: Small is Apache-2.0, Base, Large and Giant are CC-BY-NC-4.0). 2024. [github.com/DepthAnything/Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2)

[12] depth-anything-v2-small ONNX export (Apache-2.0; file sizes from the Hub API, 2026-10-25). onnx-community, Hugging Face. [huggingface.co](https://huggingface.co/onnx-community/depth-anything-v2-small)

[13] depth-anything-v2-base ONNX export (cc-by-nc-4.0). onnx-community, Hugging Face. [huggingface.co](https://huggingface.co/onnx-community/depth-anything-v2-base)

[14] Transformers.js real-time depth estimation Space (webcam, input-size slider). Xenova, Hugging Face. [huggingface.co](https://huggingface.co/spaces/Xenova/webgpu-realtime-depth-estimation)

[15] MiDaS (MIT, archived 2024-08). Intel ISL. [github.com/isl-org/MiDaS](https://github.com/isl-org/MiDaS)

[16] perfect-freehand (MIT). Ruiz S. [github.com/steveruizok/perfect-freehand](https://github.com/steveruizok/perfect-freehand)

[17] simplify-js (BSD-2-Clause). Agafonkin V. [github.com/mourner/simplify-js](https://github.com/mourner/simplify-js)

[18] fit-curve, a JavaScript port of Schneider's curve fitting. npm. [npmjs.com/package/fit-curve](https://www.npmjs.com/package/fit-curve)

[19] Yuksel C, Schaefer S, Keyser J. Parameterization and applications of Catmull-Rom curves. Computer-Aided Design 43(7), 2011. [cemyuksel.com](https://cemyuksel.com/research/catmullrom_param/)

[20] The $-family of gesture recognizers: $1, $N, $P, $P+, $Q (New BSD licence). Wobbrock, Anthony, Vatavu, University of Washington. [depts.washington.edu/acelab/proj/dollar](https://depts.washington.edu/acelab/proj/dollar/index.html)

[21] Wobbrock JO, Wilson AD, Li Y. Gestures without libraries, toolkits or training: a $1 recognizer for user interface prototypes. UIST 2007. (accuracy figures as reported in its abstract; project page [20])

[22] Vatavu R-D, Anthony L, Wobbrock JO. $Q: A super-quick, articulation-invariant stroke-gesture recognizer for low-resource devices. MobileHCI 2018. (cited from [20])

[23] Quick, Draw! dataset (50 million drawings, 345 categories, CC BY 4.0). Google Creative Lab. [github.com/googlecreativelab/quickdraw-dataset](https://github.com/googlecreativelab/quickdraw-dataset)

[24] Magenta.js, including Sketch-RNN (Apache-2.0). Google Magenta. [github.com/magenta/magenta-js](https://github.com/magenta/magenta-js)

[25] Kruger R, Carpendale S, Scott SD, Tang A. Fluid orientation on a tabletop display: integrating rotation and translation (RNT). CHI 2005, pp. 601-610. [doi:10.1145/1054972.1055055](https://doi.org/10.1145/1054972.1055055)

[26] HTMLVideoElement.requestVideoFrameCallback(). MDN Web Docs (Baseline 2024), checked 2026-10-25. [developer.mozilla.org](https://developer.mozilla.org/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)

[27] BaseAudioContext.createPeriodicWave(). MDN Web Docs, checked 2026-10-25. [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createPeriodicWave)

[28] UPIC. Wikipedia (Xenakis, CEMAMu, 1977). [en.wikipedia.org/wiki/UPIC](https://en.wikipedia.org/wiki/UPIC)

[29] Jordà S, Geiger G, Alonso M, Kaltenbrunner M. The reacTable: exploring the synergy between live music performance and tabletop tangible interfaces. TEI 2007. [mtg.upf.edu](https://mtg.upf.edu/node/510)

[30] three.js (MIT). [github.com/mrdoob/three.js](https://github.com/mrdoob/three.js)

[31] react-three-fiber (MIT). Poimandres. [github.com/pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber)

[32] Matter.js (MIT). [github.com/liabru/matter-js](https://github.com/liabru/matter-js)

[33] Rapier physics engine (Apache-2.0), with deterministic builds. Dimforge. [github.com/dimforge/rapier](https://github.com/dimforge/rapier)

[34] handtrack.js (MIT). Dibia V. [github.com/victordibia/handtrack.js](https://github.com/victordibia/handtrack.js)

[35] fingerpose (MIT). Potato A. [github.com/andypotato/fingerpose](https://github.com/andypotato/fingerpose)

[36] Excalidraw (MIT) and tldraw (custom licence). [github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw), [github.com/tldraw/tldraw](https://github.com/tldraw/tldraw)

[37] GitHub repository search "air canvas mediapipe hands javascript" and "hand tracking three.js pinch grab mediapipe", metadata only, 2026-10-25. [github.com/search](https://github.com/search?q=air+canvas+mediapipe+hands+javascript&type=repositories)

[38] ANSUR II anthropometric database (hand breadth definition and public data). US Army Public Health Center. [ph.health.mil](https://ph.health.mil/topics/workplacehealth/ergo/Pages/Anthropometric-Database.aspx)

[39] Where the lag comes from, and whether another language would cut it. thoremin repository, `docs/research/latency-budget-and-browser-realtime.md`, measured 2026-09-26. [github.com/thorwhalen/thoremin](https://github.com/thorwhalen/thoremin/blob/main/docs/research/latency-budget-and-browser-realtime.md)
