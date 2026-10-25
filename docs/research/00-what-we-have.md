# What thoremin already has that is augmented-reality-adjacent, and the gaps

*Inventory, 2026-10-25. Sources: thoremin's docs, source tree and issues as of that date; thoremin-asl's README; the player guide [1]. No web research beyond those sources.*

## In short

- Thoremin is already a **screen-space AR instrument**: it shows the mirrored webcam video, draws guides on it (landmarks, pitch and chord guides, drum pads, chord wheels and maps), and the player's hands point at, strike or push toward those drawn things. What it lacks is the part of AR where the player **creates and moves objects** and where the **world** (not the video frame) is the coordinate system.
- Hand tracking is MediaPipe `HandLandmarker` (21 landmarks per hand), with both image landmarks and metric **world landmarks** already carried on every frame; the two are used for pinch/openness features, but no instrument yet reads the hand in 3-D, and the image `z` is treated as unreliable (a `depthZ` feature was removed as dead, [#144](https://github.com/thorwhalen/thoremin/issues/144)).
- Pinch exists twice: a continuous `pinch` feature (thumb to index, divided by a per-hand size so it is invariant to camera distance) and a discrete `pinch` pose with hysteresis in `gesture-classifier`. There is **no grab/drag state machine** and no object that a pinch can pick up.
- Objects on the video exist in one place only, the **air drum's pads**: shapes with position, size, colour and a drum, placed by dragging in a settings stage with the mouse, never by hand, and used as hit targets.
- The overlay is a composable, ordered list of canvas elements, extensible by lazy extensions through typed ports (`src/nodes/output/overlay/`, `src/nodes/output/overlay_contributions.ts`). This is the seam where "draw an object on the video" would plug in.
- Smoothing is a real **One Euro filter** node (`src/nodes/mapping/one_euro.ts`), but it is not on the landmark path by default; raw landmarks feed features and the overlay.
- The latency budget is already measured: about **100 ms from hand movement to sound, plus camera hardware**; hand inference is **20.5 ms** on GPU (main thread), the whole DAG tick including overlay drawing is **0.27 ms**. For AR the equivalent budget is motion-to-photon (hand to drawn object), which has the same first four stages and no audio stage, so roughly **45 to 60 ms plus camera and display** is the starting estimate to verify.
- Nothing exists for smart glasses: no WebXR, no headset camera source, no second display surface, and no issue or discussion mentions glasses (searched 2026-10-25).

## 1. What thoremin does today that is AR-adjacent

### 1.1 Camera and tracking input

| Capability | Where | Notes |
|---|---|---|
| Camera capture | `src/app/engine/camera.ts` | 1280x720, `frameRate: {ideal: 60}`, 16:9, front camera; one shared profile used by the app and the latency script. |
| Frame stamping | `src/nodes/sources/frame_pump.ts` | Every frame carries its own capture time from `requestVideoFrameCallback` ([#226](https://github.com/thorwhalen/thoremin/issues/226)), and the capture-to-inference lag. Essential for any overlay that must line up with the video. |
| Hands | `src/nodes/sources/webcam_hands.ts`, `hands.worker.ts`, `hand_runner.ts` | MediaPipe Tasks Vision `HandLandmarker`. Image keypoints in pixels plus `worldKeypoints` (metric, hand-centred) per hand. Runs on the main thread or in a Web Worker ([#326](https://github.com/thorwhalen/thoremin/issues/326)); hand count (1 or 2) derived from what the composed instrument reads ([#325](https://github.com/thorwhalen/thoremin/issues/325)); GPU or CPU (WebAssembly) delegate chosen by renderer (`src/nodes/sources/delegate.ts`). |
| Face | `src/nodes/sources/webcam_face.ts` | `FaceLandmarker`, 52 blendshapes, head pose; loads only when a face mapping is picked. |
| Body | `src/slices/body/nodes/webcam_body.ts` | 33-landmark pose with image and world sets; lazy. |
| Test inputs | `src/nodes/sources/synthetic_hands.ts`, `replay_hands.ts`, `?source=video` | Camera-free, deterministic: an AR gesture layer can be developed and tested without a camera or glasses. |

Landmarks used today: the index tip and wrist as the "note source" (`LM.index_tip`, `LM.wrist`), thumb tip and the four fingertips for pinch and per-finger closeness, wrist to middle knuckle as the hand-size reference, and the grip-derived **stick tip** for the air drum. Landmark type definitions are in `packages/sdk/src/nodes/domain/hands.ts` (`LM`, `kp`, `dist2d`, `dist3d`).

### 1.2 Pinch, openness and discrete poses

- `src/nodes/features/hand_features.ts` computes per-hand `x`, `y`, `openness` (fist to spread) and `pinch` (thumb to index), normalised by wrist-to-middle-knuckle distance; it can use world landmarks (`useWorld` selects `dist3d`).
- `src/nodes/features/gesture_classifier.ts` turns those into poses (`pinch`, `fist`, `open`, `neutral`, `absent`) with enter and exit events and hysteresis (`pinchOn` 0.6, `pinchOff` 0.45). Pinch wins over fist. This is the discrete half of a grab; it has no position, no object and no drag.
- Handedness flicker is damped by a dwell ([#148](https://github.com/thorwhalen/thoremin/issues/148)); for AR this matters because a flipped label swaps which hand holds the object.
- Learned categories: the carve tool lets a player teach personal hand shapes and poses ([#385](https://github.com/thorwhalen/thoremin/issues/385), [#452](https://github.com/thorwhalen/thoremin/issues/452) for palm orientation and two-hand joint categorizers, both open). Dynamic (moving) gestures are designed but not built: [#718](https://github.com/thorwhalen/thoremin/issues/718) and the five open build issues [#751](https://github.com/thorwhalen/thoremin/issues/751) to [#755](https://github.com/thorwhalen/thoremin/issues/755) (motion segmenter, DTW matcher, GVF matcher). A "draw a circle to make a circle object" or "flick to throw" gesture would sit on this.
- A feature catalog of about 200 face and hand scalars with invariance labels (`packages/sdk/src/features/hand_catalog.ts`, Feature Lab, [#119](https://github.com/thorwhalen/thoremin/issues/119)) says which features survive scale, translation and rotation, which is what a camera-moving or glasses-wearing setup needs.

### 1.3 Overlays drawn on the video

The `canvas-overlay` node (`src/nodes/output/canvas_overlay.ts`, split into `src/nodes/output/overlay/node.ts` and `overlay/elements/*`) draws the mirrored video and an ordered list of **elements** onto one canvas, each tick, in about a fraction of a millisecond. An element is `{name, category, draw(g, view)}` (`overlay/view.ts`), and extensions contribute more through typed input ports and a `drawBefore` slot (`overlay_contributions.ts`, [#600](https://github.com/thorwhalen/thoremin/issues/600)).

| Element (`overlay/elements/`) | What it draws |
|---|---|
| `backdrop`, video | The mirrored camera frame, optionally greyed. |
| `landmarks`, `finger_lines`, `finger_bars`, `control_markers` | Hand dots, finger lines, the note-source ring, control markers. |
| `index_finger_guide`, `scale_guide`, `keyboard_strip` | Guide lines from the fingertip to the screen edge, scale/pitch bands, a keyboard strip with layered cues ([#89](https://github.com/thorwhalen/thoremin/issues/89)). |
| `chord_guide`, `chord_name` | Chord names and highlights of the sounding chord. |
| `body_skeleton`, `face_mesh`, `face_expression`, `category` | Body skeleton, face mesh, expression bars, learned-category readouts. |
| `timbre_levels`, `tag_hud` | Feature meters and the annotation HUD. |
| Air extension: `drum_pads`, `breath_cue` | Pads and sticks on the video; a breath cue (`packages/ext-air/src/nodes/overlay/`). |
| Harmony extension: `chord_torus` | A rotating 3-D torus of the chord map, drawn in 2-D canvas ([#717](https://github.com/thorwhalen/thoremin/issues/717), [#745](https://github.com/thorwhalen/thoremin/issues/745)); the only 3-D-looking object, and it is a teaching picture, not something the hand touches. |

Coordinates: elements work in canvas pixels, mapping a landmark with `mirrorX(tip.x, frame.width, W)` and `(tip.y / frame.height) * H` (see `index_finger_guide.ts`). There is **no shared screen-space-to-world transform**; each element converts by hand.

Recording keeps the overlay as its own stream (Recording v2, [#88](https://github.com/thorwhalen/thoremin/issues/88), `docs/design/recording-v2.md`): video with overlays, the pure webcam, and an overlay-only alpha stream. That alpha stream is already the artefact an AR compositor wants.

### 1.4 Things the hand points at, strikes or pushes toward

These are the AR-adjacent *interactions*: a drawn target and a hand that acts on it.

- **Air drum pads** (`packages/ext-air/src/nodes/air_drum*.ts`, `lib/pad_floors.ts`, `panels/airDrumPads.tsx`, [#245](https://github.com/thorwhalen/thoremin/issues/245), [#353](https://github.com/thorwhalen/thoremin/issues/353)). Shapes with `x`, `y`, size, colour, drum; a stroke's landing point, predicted before it happens, picks the pad. The pad editor lets the player **place, drag, resize and recolour** pads with the mouse on a mirrored stage and saves layouts (`app/padLayouts.ts`). This is "draw and move objects" except that the hand is not the tool, and "depth" is the fall of the stroke in image y, learned per pad, not a measured distance (issues [#530](https://github.com/thorwhalen/thoremin/issues/530), [#531](https://github.com/thorwhalen/thoremin/issues/531), [#533](https://github.com/thorwhalen/thoremin/issues/533) record what goes wrong when pads sit at different depths).
- **Chord wheel, chord map, map paths, face wheel, tonnetz wheel** (`packages/ext-harmony/src/nodes/chord_wheel.ts`, `chord_map.ts`; guide pages in [1]): the hand pushes past a dead zone toward a labelled wedge and holds briefly; the wheel recentres. This is dwell-based **pointing** at drawn objects, with direction as the selection, which is robust to tracker noise.
- **Pitch and volume fields** (default instrument, `src/app/graph.ts`): hand x to pitch, y to volume, with guides.
- **Air bass, guitar, flute** (`packages/ext-air/src/nodes/air_bass.ts` etc.): mime an instrument; the guitar and flute read enrolled hand shapes (`lib/hand_shape.ts`, `lib/fingerings.ts`). Hand shape as a categorical selector is directly reusable as a "tool palette" (pinch to draw, fist to erase).
- **Sign instruments** ([thoremin-asl](https://github.com/thorwhalen/thoremin-asl)): fingerspelling read from the hands, as a lazy extension of about 150 kB fetched on first use. It proves the extension pattern for a hand-shape recogniser and its README documents the pin-by-commit release process; it does nothing AR itself [2].

### 1.5 Smoothing and prediction

- `src/nodes/mapping/one_euro.ts`: the 1 Euro filter (Casiez et al., 2012) as a DAG node (`minCutoff` 1.0 Hz, `beta` 0.01, `dCutoff` 1.0), deterministic via `ctx.dt`. It is registered but not in the default landmark path. For a dragged object this is the standard filter; its two knobs trade jitter at rest against lag in motion, the same trade as in the research below.
- `packages/ictus/src/impact.ts`: sub-frame **impact prediction**. A surface strike is predicted about 50 ms before it happens with less error than the frame-snapped detector has after it; an air impact as early with about the detector's error [3]. For AR, the same predictor shape (a movement model with a late commitment) is what a "release" or "drop" would use to land an object on the intended spot.
- `packages/ictus`: adaptive oscillator, beat and pulse followers (rhythm, not spatial).
- Synth pitch glide is a 30 ms `setTargetAtTime`; it is audio only and irrelevant to drawing.

### 1.6 Latency numbers already established

From the measured budget (M1 Max MacBook Pro, Chrome 153, real hand footage through the camera path, 2026-09-26) [4]:

| Stage | Measured |
|---|---|
| Wait for the frame that contains the motion | 0 to 33 ms, mean 16.7 (at 30 fps; 60 fps halves it) |
| Camera sensor, ISP, USB, OS capture | not measurable in a page; about 100 ms attributed to camera plus USB on Linux in one published breakdown; glass-to-glass tests 50 to 108 ms |
| Capture stamp to inference | 4.1 +- 2.5 ms |
| Hand inference, main thread, GPU delegate | 20.5 +- 4.1 ms (p95 26.5); CPU/WebAssembly delegate 42.4 +- 9.1 ms |
| DAG tick including overlay drawing | 0.27 +- 0.20 ms |
| Parameter write to loudspeaker | 31.9 +- 1.6 ms (audio only) |
| Total to half-way to a new pitch | about 100 ms plus camera hardware |

Other established facts that matter for AR: perception thresholds of 10 to 30 ms for continuous control ([5], `intent-and-subframe-timing.md` section 1); main-thread inference makes the tick stutter on a 120 Hz display (tick intervals 12.1 +- 12.4 ms), the argument for the worker runner; `numHands: 1` cuts hand cost by about 40 % on the CPU delegate (98 to 59 ms at 1280x720); a software renderer needs the CPU delegate (713 ms per frame on SwiftShader GPU emulation against 99 ms on CPU) [4]. The in-app latency probe is `?probe=latency` (`src/latency/probe.ts`), with a microphone strike test for glass-to-air. **There is no glass-to-photon measurement for the overlay yet**, only to sound.

## 2. Prior research already done in thoremin

All under `docs/research/`; GitHub base `https://github.com/thorwhalen/thoremin/blob/main/docs/research/`.

| Doc | One line |
|---|---|
| [air-instruments.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/air-instruments.md) | Prior art on air guitar, drums, flute and bass, a footage pipeline, and chord-shape recognition from hand landmarks (high in-distribution accuracy, poor transfer across players, so enrolment per player). |
| [intent-and-subframe-timing.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/intent-and-subframe-timing.md) | Perception thresholds, the real frame rate and latency chain from code, and the actuality / intent / sounding-good trade-off as dials. |
| [latency-budget-and-browser-realtime.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/latency-budget-and-browser-realtime.md) | The measured budget, why Rust/WebAssembly would not help, what browser real-time software uses, ranked levers, how to measure on your machine. |
| [subframe-impact-prediction.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/subframe-impact-prediction.md) | Predicting a strike before the frame shows it; harness, 288 synthetic clips, numbers by frame rate, shutter and tracker noise. |
| [body-and-pace-research-map.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/body-and-pace-research-map.md) | Body pose in the browser (candidates, 33 landmarks, what they give and not), featurizing the body, pacing a song from the dancer. |
| [body-conducting-and-pose-categories.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/body-conducting-and-pose-categories.md) | Which body channel carries the beat; pose categories for interaction; latency and prediction at 30 fps. |
| [face-categorizer-lighting-and-distance.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/face-categorizer-lighting-and-distance.md) | Measured effect of lighting and camera distance on a learned categorizer: lighting needs a warning, distance a per-player learned dial. Relevant to any head-worn or moving camera. |
| [trainer-mode.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/trainer-mode.md) | Training a player on cues; section 2.3 summarises the Gesture Variation Follower for dynamic gestures. |
| [rhythm-from-gesture-research-map.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/rhythm-from-gesture-research-map.md) | Rhythm inference from low-rate gesture; the basis of `ictus`. |
| [conducting-and-virtual-orchestra-research-map.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/conducting-and-virtual-orchestra-research-map.md) | Conducting gestures and the virtual orchestra. |
| [fingering-priors-and-sequence-training.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/fingering-priors-and-sequence-training.md) | Fingering priors and sequence trainers for the air flute and bass. |
| [compendium.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/compendium.md) | The index of all of the above, with a glossary; sections 3, 4 and 8 (latency, air instruments, hand and body pose categories) are the ones to read first. |

Design docs worth reading before extending: [`docs/design/instruments-as-graphs-and-extensions.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/instruments-as-graphs-and-extensions.md) (the `Extension` manifest, seeds), [`lazy-extensions.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/lazy-extensions.md) (a lazy extension is stubs eager, code on demand, declared in `extensions.json`), [`vertical-slices.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/vertical-slices.md), [`dynamic-gestures.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/dynamic-gestures.md), [`component-model.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/component-model.md). Architecture: [`docs/ARCHITECTURE.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/ARCHITECTURE.md) [6].

## 3. Relevant issues and discussions

Searched 2026-10-25 with terms: hand tracking, pinch, grab, overlay, draw, 3D, depth, gesture, camera, video, AR, glasses, world landmarks, WebXR, object, pointer. No issue mentions AR in the augmented-reality sense (the "AR" hits are substrings), glasses, or WebXR.

| Issue / discussion | State | Why it matters |
|---|---|---|
| [#46](https://github.com/thorwhalen/thoremin/issues/46) Overlay: composable toggleable elements | closed | Origin of the element list; the seam for drawn objects. |
| [#600](https://github.com/thorwhalen/thoremin/issues/600) Vertical slices and one extension contract | closed | Overlay contributions through typed ports; where an AR extension plugs in. |
| [#245](https://github.com/thorwhalen/thoremin/issues/245), [#353](https://github.com/thorwhalen/thoremin/issues/353), [#530](https://github.com/thorwhalen/thoremin/issues/530), [#531](https://github.com/thorwhalen/thoremin/issues/531), [#533](https://github.com/thorwhalen/thoremin/issues/533) Air drum pads and per-pad floors | closed | The only objects-on-video model, and the depth problems it already hit. |
| [#233](https://github.com/thorwhalen/thoremin/issues/233), [#249](https://github.com/thorwhalen/thoremin/issues/249) Air drum and air instruments epic | closed | Impact prediction in an instrument; enrolment per player. |
| [#144](https://github.com/thorwhalen/thoremin/issues/144) Feature Lab correctness (dead `depthZ`, handedness flicker) | closed | Image-space `z` of hand landmarks was found unusable as depth. |
| [#432](https://github.com/thorwhalen/thoremin/issues/432) Body pose torso confidence, invariance labels "on the world set" | closed | World-landmark invariance already modelled. |
| [#148](https://github.com/thorwhalen/thoremin/issues/148) Handedness dwell | closed | Label stability for two-hand manipulation. |
| [#226](https://github.com/thorwhalen/thoremin/issues/226) Capture-time stamping | open | Frame-accurate alignment of overlay and video. |
| [#326](https://github.com/thorwhalen/thoremin/issues/326), [#325](https://github.com/thorwhalen/thoremin/issues/325), [#324](https://github.com/thorwhalen/thoremin/issues/324), [#737](https://github.com/thorwhalen/thoremin/issues/737) Hand runner, hand count, low-res CPU finding, worker-death fallback | mixed | Where hand inference runs; the cost of 1 versus 2 hands; a known failure at 640x360 on CPU. |
| [#385](https://github.com/thorwhalen/thoremin/issues/385), [#452](https://github.com/thorwhalen/thoremin/issues/452), [#387](https://github.com/thorwhalen/thoremin/issues/387) Carve-out v2, palm orientation, joint categorizers | open | Learned hand shapes as tool selectors. |
| [#718](https://github.com/thorwhalen/thoremin/issues/718), [#751](https://github.com/thorwhalen/thoremin/issues/751) to [#755](https://github.com/thorwhalen/thoremin/issues/755) Dynamic gestures | closed / open | Moving gestures (draw, flick, wave) not yet buildable. |
| [#717](https://github.com/thorwhalen/thoremin/issues/717), [#745](https://github.com/thorwhalen/thoremin/issues/745) 3-D torus overlay | open / closed | A 3-D picture on the video, no interaction. |
| [#88](https://github.com/thorwhalen/thoremin/issues/88) Recording v2 | closed | Overlay-only alpha stream. |
| [#168](https://github.com/thorwhalen/thoremin/issues/168) Decisions inbox | open | Where a new decision would be filed. |
| [Discussion #80](https://github.com/thorwhalen/thoremin/discussions/80) On hand control | open | The hand-control research accumulator (finger enslaving, which fingers to give which controls). |
| [Discussion #3](https://github.com/thorwhalen/thoremin/discussions/3) Architecture: the DAG spine | open | Architecture rationale. |
| thoremin-asl [#9](https://github.com/thorwhalen/thoremin-asl/issues/9) (closed) and the open #1 to #7 | mixed | Licence, data and provenance issues; none concerns AR. Declares `hands: 1`, so it cannot be combined with a two-hand AR instrument without declaring two. |

## 4. Gaps

### 4.1 To "draw and move objects via the camera"

| Gap | What is there | What is missing |
|---|---|---|
| Grab state machine | Continuous `pinch`, discrete `pinch` pose with hysteresis, enter/exit events | A node that turns pinch plus hand position into `idle / hover / grasp / drag / release` for an object under the hand, with per-hand ownership, debounce against tracker dropouts and handedness flicker, and a release that does not shift the object (pinch tightening moves the fingertip). |
| Pointing and hit-testing | Dwell-based wedges (wheels), pad hit-testing by predicted landing | A generic "which object is under this point" with hover, a stable pointer (index tip versus pinch midpoint versus a ray from the wrist), and a screen-to-world transform shared by all elements. |
| Scene of objects | Drum pads (shapes with x, y, size, colour, drum), saved layouts | A general object store (id, kind, transform, style) as a zodal collection, with create, move, resize, delete, undo as `acture` commands; pads are specific to the drum and edited with the mouse. |
| Drawing | Fingertip guide lines; no stroke capture | A stroke recorder (pinch down, polyline, pinch up), smoothing (One Euro is available), simplification, and a shape snap (circle, rectangle, line) using the dynamic-gesture matcher once built (#751 to #755). |
| Depth / 3-D | World landmarks carried but unused for placement; image `z` known unreliable; pad depth inferred from stroke fall | A decision on the depth cue (hand size as distance proxy, world landmarks, monocular depth model, or none and stay 2-D), plus handling of the scale ambiguity of world landmarks. |
| Rendering | 2-D canvas elements; a torus drawn in 2-D | A path for objects with perspective or 3-D shading (canvas 2-D, WebGL, three.js) that still draws in well under the 0.27 ms tick; occlusion by the hand. |
| Persistence and sound | Instrument save/load, library, tags; pad layouts | Saving a scene with the instrument; objects that make sound (an object is a pad, a wheel, a fader) so AR stays a thoremin instrument and not a separate app. |
| Smoothing on landmarks | One Euro node exists | Wiring it on the landmark path for dragging with tuned defaults, and a way to measure jitter versus lag for drawing (the existing noise estimator in `packages/sdk/src/enroll/` is a starting point). |
| Latency to photons | Latency to sound measured | A glass-to-photon probe: how late the dragged object trails the real hand on screen, and prediction (hold the object at the predicted fingertip) as the lever. |
| Ergonomics | Trainer tool and cues | Fatigue, hand-out-of-frame, occlusion, small hands at distance, lighting; the face-distance research shows these effects are large for learned categories. |

### 4.2 For smart glasses (Meta glasses)

| Gap | Notes |
|---|---|
| Camera source | `webcam-hands` reads a `<video>` from `getUserMedia`; a glasses feed (if any is exposed to a browser at all) would be another source node behind `source_contract.ts`, as `replay_hands` and `synthetic_hands` already are. First-person view mirrors and rotates the geometry assumed by mirrored selfie mapping. |
| Display | The overlay draws to a canvas over the video; glasses need either a passthrough compositor or a native display surface, which a web page cannot reach. The overlay-only alpha stream is the one reusable artefact. |
| Input contract | Whether the glasses expose hand tracking, a camera stream, audio or a companion API to a web app, and under what terms, is unknown to the repo. |
| Coordinate frames | Head motion moves the camera: hand landmarks are camera-relative, not world-relative. Anchoring objects in the world needs head pose or SLAM, which thoremin has none of. |
| Compute and latency | Inference on the phone, the glasses or a laptop; the measured budget is for a laptop GPU. The worker runner and CPU delegate are the only portability levers in place. |
| Audio | Thoremin's output is Web Audio on the host; glasses speakers and Bluetooth add latency beyond the measured 32 ms output path. |
| Extension shape | The lazy extension pattern (`extensions.json`, stubs eager, code on demand, pinned by commit, as thoremin-asl does) is the established way to ship this as `thoremin-ar` without touching the core; the tests for `?source=video` and synthetic hands cover development without hardware. |

## 5. Questions for the later research

1. **Hand tracking in 3-D from one RGB camera:** how good are MediaPipe world landmarks as a placement and depth cue, versus hand-size scaling, versus newer models (for example monocular depth or 3-D hand mesh models)? What are real accuracy and failure modes (occlusion, two hands, motion blur)?
2. **Pinch and grab detection in the literature and in shipped products:** which pointer definitions and thresholds do WebXR hand input, Quest hand tracking and Vision Pro use, and how do they handle the pinch-shift problem and dropouts? Is there a standard gesture vocabulary to follow?
3. **Smoothing and prediction for dragging:** 1 Euro parameters for hand landmarks, versus Kalman and learned predictors; how much lag is acceptable for direct manipulation versus the 10 to 30 ms perceptual figures thoremin already uses; can the impact predictor's late-commit idea be reused?
4. **Libraries to depend on, wrap or study** for 2-D and 3-D drawing, scene graphs and hit-testing in the browser (canvas, PixiJS, three.js, Babylon, A-Frame), and for stroke recognition ($-family recognizers, shape snapping).
5. **WebXR and the browser on glasses:** what do WebXR (`immersive-ar`, hand-tracking module, anchors, depth sensing), WebCodecs and camera access offer on current headsets and glasses, and what does a plain web page get from Meta glasses specifically (camera stream, display, input, SDK, developer terms) as of today?
6. **Meta glasses and alternatives:** which models have a developer path, what they expose, and whether any lets a web app both see through the camera and draw in the display; what the cheapest way to try is (phone as host, tethered stream, a headset instead).
7. **Anchoring objects in the world:** is there a browser-feasible head-pose or SLAM option, or does the project stay camera-relative?
8. **Measurement:** how to extend `?probe=latency` to glass-to-photon (screen capture or high-speed camera), and what budget is realistic from the measured stages.
9. **Fit to the instrument model:** which node kinds (`pointer`, `grab`, `object-scene`, `stroke`) and ports a `thoremin-ar` extension would declare, which overlay elements it would contribute, and how objects become sound sources (pads, faders, wheels) in the typed DAG.

## REFERENCES

[1] Thoremin guide (player guide, one file). Thor Whalen, 2026 (read 2026-10-25). [thoremin-guide.md](https://apps.thorwhalen.com/thoremin/guide/thoremin-guide.md)
[2] thoremin-asl README. Thor Whalen, 2026. [github.com/thorwhalen/thoremin-asl](https://github.com/thorwhalen/thoremin-asl)
[3] Sub-frame impact prediction from body video: method, harness, numbers. Thor Whalen, 2026-09-26. [subframe-impact-prediction.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/subframe-impact-prediction.md)
[4] Where the lag comes from, and whether another language would cut it. Thor Whalen, measured 2026-09-26, step 4 added 2026-10-13. [latency-budget-and-browser-realtime.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/latency-budget-and-browser-realtime.md)
[5] Intent, actuality, and sounding good: musical timing beyond the frame rate. Thor Whalen, 2026-09-26. [intent-and-subframe-timing.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/intent-and-subframe-timing.md)
[6] Thoremin Architecture. Thor Whalen, 2026. [ARCHITECTURE.md](https://github.com/thorwhalen/thoremin/blob/main/docs/ARCHITECTURE.md)
[7] Air instruments: prior art, a footage pipeline, and a first model. Thor Whalen, 2026-09. [air-instruments.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/air-instruments.md)
[8] Instruments as graphs and extensions (design). Thor Whalen, 2026. [instruments-as-graphs-and-extensions.md](https://github.com/thorwhalen/thoremin/blob/main/docs/design/instruments-as-graphs-and-extensions.md)
[9] Lazy extensions (design, accepted 2026-10-13). Thor Whalen, 2026. [lazy-extensions.md](https://github.com/thorwhalen/thoremin/blob/main/docs/design/lazy-extensions.md)
[10] Dynamic gestures: moving categories beside the static carve (design, #718). Thor Whalen, 2026-10-20. [dynamic-gestures.md](https://github.com/thorwhalen/thoremin/blob/main/docs/design/dynamic-gestures.md)
[11] Thoremin research compendium. Thor Whalen, 2026. [compendium.md](https://github.com/thorwhalen/thoremin/blob/main/docs/research/compendium.md)
[12] Recording v2 (design). Thor Whalen, 2026-07. [recording-v2.md](https://github.com/thorwhalen/thoremin/blob/main/docs/design/recording-v2.md)
[13] Thoremin issues and discussions, searched 2026-10-25. [github.com/thorwhalen/thoremin/issues](https://github.com/thorwhalen/thoremin/issues), [discussions/80](https://github.com/thorwhalen/thoremin/discussions/80)
