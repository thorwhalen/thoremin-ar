# Recommendations: what to build next, ranked by value over effort

Research note 99, the closing one of the thoremin-ar set. Written 2026-10-25 from the six sibling notes ([00](00-what-we-have.md) to [05](05-related-work-instruments.md)); facts and dates are theirs, and each step below says which note it rests on. The user's wish, in their words: *"I want to be able to draw and move objects via the camera. I am also interested in trying the Meta glasses."* Everything here serves those two sentences, in that order.

## In short

- **Build the pinch state machine first.** Every "draw and move" feature stacks on one node that thoremin does not have: a per-hand `pinch-state` with hysteresis, debounce, tracking-loss grace and a latched anchor, beside a screen-space `pointer` and a 2-D One Euro `cursor-smooth`. It belongs in the thoremin core, because the air instruments, thoremin-asl and any future XR source need the same thing ([02](02-draw-and-move-with-a-webcam.md) sections 2.3 and 14).
- **Do two pieces of hygiene before any new node:** bump `@mediapipe/tasks-vision` from `^0.10.35` (a caret range that can never reach the published 1.1.1) and drop the three 2023-era fallback packages ([03](03-browser-ar-stack.md) section 3); and give the overlay one shared frame-to-display transform instead of the per-element arithmetic and the stretched backdrop it has today ([02](02-draw-and-move-with-a-webcam.md) section 9.2).
- **The "draw and move" seed is a lazy extension in thoremin-ar**, silent first (pointer, ink, grab and drag), then musical: a drawn stroke as a contour melody scrubbed by the other hand needs no core change; a stroke as a wavetable needs one small seam on the synth ([02](02-draw-and-move-with-a-webcam.md) sections 13 and 15, [05](05-related-work-instruments.md) section 3.6).
- **Stay 2-D, stay on canvas, stay camera-relative in v1.** No three.js, no depth network, no world anchors until a player has drawn and moved something and it sounded like an instrument. Palm-size relative depth is the one cheap depth cue worth adding ([02](02-draw-and-move-with-a-webcam.md) section 5).
- **For the glasses wish, the right first purchase is a Quest 3S, not Meta glasses.** It is the only device where a web page gets tracked hands (25 WebXR joints that map onto MediaPipe's 21) and passthrough; the Ray-Ban Display gives a web page a 600x600 HUD and arrow-key events, no camera; the camera glasses need a native phone app ([04](04-meta-glasses.md) sections 2 and 4, [03](03-browser-ar-stack.md) section 2).
- **Seven idea issues and three manual tasks are ready to file**; the table in section 1 is the ranking, section 5 the decisions the user must make, with a recommendation for each.

## 1. The ranking at a glance

Value is what a player gets, weighed against how much else it unblocks. Effort is S (a day or two), M (about a week), L (several weeks or a second repository). "Core" is [thorwhalen/thoremin](https://github.com/thorwhalen/thoremin); "plugin" is [thorwhalen/thoremin-ar](https://github.com/thorwhalen/thoremin-ar), shipping as a lazy extension the way thoremin-asl does.

| Rank | Step | Repo | Value | Effort | Phase | File now |
|---|---|---|---|---|---|---|
| 1 | R1 `pinch-state`, `pointer`, `cursor-smooth` nodes | core | high | M | 1 | yes |
| 2 | R2 MediaPipe version pin and legacy-package removal | core | medium | S | 0 | yes |
| 3 | R3 One frame-to-display transform; fix overlay registration | core | high | M | 1 | yes |
| 4 | R4 "Draw and move" seed, silent (`ext-draw`) | plugin | high | M | 1 | yes |
| 5 | R5 Drawn stroke as melody, then as wavetable | plugin | high | M | 2 | yes |
| 6 | R6 `webxr-hands` source node | plugin | high | M | 3 | yes |
| 7 | R7 Space-tagged point and pose ports (`SpaceId`) | core | medium | M | 0 to 1 | yes |
| 8 | R8 Optional `wave` input on the synth | core | medium | S | 2 | later |
| 9 | R9 Palm-size relative depth feature | plugin | medium | S | 2 | later |
| 10 | R10 Shape snap and small gesture vocabulary | plugin | low | S | 2 | later |
| 11 | R11 Glass-to-photon latency probe | core | medium | M | 3 | later |
| 12 | R12 Ray-Ban Display HUD web app and Neural Band triggers | plugin | low | S to M | 4 | later |
| 13 | R13 Glasses camera to phone bridge (native app) | new repo | medium | L | 4 | no |
| 14 | R14 Monocular depth network extension | plugin | low | M | none | no |

Manual tasks (things only the user can do) are in section 4: buy a Quest 3S (recommended), sign up for the Wearables Developer Center and defer the Ray-Ban Display (recommended), and record a reference set of hand footage for tuning (recommended, this week).

## 2. The steps, written to become issues

Each step: why, scope, one acceptance line, effort, repo. Node and file names follow the vocabulary note ([01](01-lingo-and-taxonomy.md) section 4): `space`, `anchor`, `pointer`, `pinch-state`, `stroke`, `scene`; never `ar` in an identifier.

### R1. `pinch-state`, `pointer` and `cursor-smooth` nodes

- **Repo:** core · **Effort:** M · **Value:** high · **Phase:** 1
- **Why.** thoremin has a continuous `pinch` feature and a `pinch` pose with hysteresis, but no debounce, no grace through a tracking dropout, and no latched position, so a pinch-drawn stroke starts and ends with a hook: the confirming gesture moves the point being aimed with, the Heisenberg effect measured for hand input in VR [1]. The One Euro node is scalar, so a diagonal stroke would lag differently in x and y. Nothing downstream can be built until this exists, and it is reusable by the air instruments, thoremin-asl and a WebXR source, which is why it is core and not plugin ([00](00-what-we-have.md) section 4.1, [02](02-draw-and-move-with-a-webcam.md) sections 2.3 and 6.1).
- **Scope.** Three nodes under `src/nodes/features/` or a new `src/nodes/pointer/`: `pointer` (per-hand `{present, x, y, roll, anchorKind}` in display units, anchor selectable between pinch midpoint and palm centre, mirrored once through the R3 transform); `pinch-state` (the section 2.3 machine of [02](02-draw-and-move-with-a-webcam.md): on 0.63 and off 0.77 in distance-over-hand-scale, 1 to 2 frame debounce, 150 ms loss grace, 100 ms anchor look-back with tail trim, adaptive exit as in Meta's grab spec [2], continuous `strength` output); `cursor-smooth` (2-D One Euro with one shared cutoff and the capture timestamp as `dt`, optional `predicted` output). All thresholds as a Zod schema so they become dials. `gesture-classifier` is left alone.
- **Acceptance.** On a recorded clip set (tight pinch, loose pinch, 2-frame dropout, two hands) replayed through `replay_hands`, the state machine produces one `down`/`up` pair per intended pinch with no extra edges, and the latched anchor at `down` is within 5 px of the fingertip position 100 ms before detection.
- **Depends on:** the footage of manual task M3 for tuning; R3 for the transform (can start with the current per-element mapping).

### R2. MediaPipe version pin and legacy-package removal

- **Repo:** core · **Effort:** S · **Value:** medium · **Phase:** 0
- **Why.** `package.json` pins `@mediapipe/tasks-vision ^0.10.35`; a caret on a 0.x version cannot resolve past 0.10, while 1.1.1 was published on 2026-10-14 [3]. The dependency list also carries `@mediapipe/hands`, `@tensorflow-models/hand-pose-detection` and TFJS 4.22, all unpublished since 2023 or in maintenance ([03](03-browser-ar-stack.md) sections 1, 3 and 4). Doing this before new nodes land means the new pinch thresholds are tuned once, against the model that will ship.
- **Scope.** One deliberate bump to `1.1.x` behind `check:models` (wasm base and model files must match the package version) and the `?probe=latency` harness; remove the three legacy packages and the "named keypoints tolerated" compatibility path if nothing uses it; do not follow the `1.2.0-rc` nightlies.
- **Acceptance.** `check:models` passes on 1.1.x, hand inference latency on the reference machine is within 10 % of the 20.5 ms recorded in `docs/research/latency-budget-and-browser-realtime.md`, and `npm ls` shows no `@mediapipe/hands` or `@tensorflow/*`.

### R3. One frame-to-display transform; fix overlay registration

- **Repo:** core · **Effort:** M · **Value:** high · **Phase:** 1
- **Why.** Each overlay element converts landmarks to canvas pixels by hand (`mirrorX(tip.x, frame.width, W)` and so on), and the backdrop draws the video stretched to the canvas (`drawImage(video, 0, 0, W, H)`), which is correct only while the canvas has the video's aspect ratio. There is no cover or contain mode and no single owner of the mirror. A second, subtler defect: the overlay draws the newest video frame while the landmarks are from the frame inferred about 25 ms earlier, so ink and cursor trail the visible fingertip at speed ([00](00-what-we-have.md) section 1.3, [02](02-draw-and-move-with-a-webcam.md) sections 9.2 and 10).
- **Scope.** A `frameToDisplay(x, y, vw, vh, W, H, {mirror, fit})` in `src/nodes/output/overlay/view.ts` (or the SDK) with `cover | contain | stretch`, used by the backdrop and every element and exported for mapping nodes; mirror applied exactly once; an option to hold an `ImageBitmap` of the inferred frame and draw that instead of the live `<video>`, off by default, with its cost measured; the alpha overlay-only pass draws through the same transform.
- **Acceptance.** With a 4:3 canvas over a 16:9 camera, landmark dots sit on the fingertips in all three fit modes and the existing overlay tests pass; a recorded fast horizontal sweep shows the cursor-to-fingertip offset in pixels for live and held-frame modes, written into the latency research doc.

### R4. "Draw and move" seed, silent (`ext-draw`)

- **Repo:** plugin · **Effort:** M · **Value:** high · **Phase:** 1
- **Why.** This is the user's first sentence. The smallest instrument that proves the loop is pointer, ink and grab, with no sound, built as a lazy extension so a player who never draws loads nothing ([02](02-draw-and-move-with-a-webcam.md) section 15). The long tail of weekend "air canvas" demos on GitHub shows the basic effect is cheap and the quality is entirely in the R1 details ([02](02-draw-and-move-with-a-webcam.md) section 11).
- **Scope.** Extension `ext-draw` per thoremin's `docs/design/lazy-extensions.md`: eager stub declaring `provides` and a dial slice; deferred half with `stroke-capture` (samples the latched pointer from `down` to `up`, tail trim, closed flag, Ramer-Douglas-Peucker on `up`, timestamps kept), `scene-objects` (a store of `{id, kind, transform, style}`; pinch to pick with a radius margin, drag with the stored offset, second hand for scale and rotation with dead-zones, grab ownership keyed on tracked hand index) and `scene-overlay` contributed through `overlay_contributions.ts`, drawing live and finished strokes with `perfect-freehand` [4] using pinch strength as pressure. Open palm held one second clears. Persisted strokes live in the extension's dial slice, so they save with the instrument and are undoable.
- **Acceptance.** Seed "Draw and Move" appears in the library; a circle drawn in the air renders as a hand-drawn circle with no hook at either end; a default square can be picked, dragged, then scaled and rotated with two hands without jumping when either hand releases; the extension's deferred chunk is not fetched until the seed is chosen.
- **Depends on:** R1 (and R3 for correct registration).

### R5. Drawn stroke as melody, then as wavetable

- **Repo:** plugin · **Effort:** M · **Value:** high · **Phase:** 2
- **Why.** A drawing that makes no sound is decoration; the drawn-sound lineage (Oramics, UPIC, Kandinsky, Paint with Music) all chose time on x and pitch on y, with a looping playhead, and that is what a player already expects from a drawn line ([05](05-related-work-instruments.md) sections 1.4 and 3.6). The contour melody needs no core change; the wavetable is the one that makes players say "draw your own sound" and needs R8 ([02](02-draw-and-move-with-a-webcam.md) sections 13.1 and 13.2).
- **Scope.** `stroke-to-voices`: x as time, y as pitch through the existing magnetic scale snap, played by a transport-driven playhead or scrubbed by the other hand's x; pinch strength along the stroke as velocity; stroke timing kept so a stroke can replay at the speed it was drawn. Then `stroke-to-wave`: resample to 2048 points along arc length, make periodic, DFT, feed `createPeriodicWave` [5] through the R8 seam, with a cross-fade when a stroke is redrawn while a note holds. Both as slot candidates so an instrument can swap them without re-wiring.
- **Acceptance.** A stroke drawn in the "Draw and Move" seed plays back in key at the transport tempo and can be scrubbed by the other hand; with R8 in place, redrawing a closed shape while holding a note audibly morphs the timbre without a click.
- **Depends on:** R4; R8 for the wavetable half.

### R6. `webxr-hands` source node

- **Repo:** plugin · **Effort:** M · **Value:** high · **Phase:** 3
- **Why.** On a Quest 3 or 3S the browser gives 25 tracked joints per hand and passthrough with no camera and no model on our side; the joints map onto MediaPipe's 21 by dropping the four finger metacarpals, so every existing instrument runs unchanged ([03](03-browser-ar-stack.md) section 8, [04](04-meta-glasses.md) section 4 option d). This is the cheapest real answer to "try the glasses", and it is the path that makes drawn objects world-registered rather than screen-locked ([05](05-related-work-instruments.md) section 3.7).
- **Scope.** A lazy extension with an `xr-session` host resource and a `webxr-hands` source behind `source_contract.ts`, emitting `HandsFrame` with the index map `[0,1,2,3,4,6,7,8,9,11,12,13,14,16,17,18,19,21,22,23,24]` as data [6]; `worldKeypoints` recentred on the hand's mean; a defined projection plane for `keypoints`; handedness from `inputSource.handedness`; a null pose as "hand absent"; frames stamped from `XRFrame`; pinch thresholds recalibrated per source because tips may be offset to the skin [6]; palm pinch left to the system [7]. Entered only on a user tap after `isSessionSupported('immersive-ar')`. Recording a session into the existing stream format so DAG tests need no headset.
- **Acceptance.** On a Quest 3S, the default pitch-and-volume instrument and the "Draw and Move" seed play in passthrough with both hands, with no camera permission requested, and a recorded WebXR session replays through `replay_hands` in the test suite.
- **Depends on:** manual task M1; R1 for pinch thresholds; R7 helps (the XR frame is a different space).

### R7. Space-tagged point and pose ports (`SpaceId`)

- **Repo:** core · **Effort:** M · **Value:** medium · **Phase:** 0 to 1
- **Why.** thoremin's signals live in image space, and nothing in the type system says so; a WebXR source, a body-relative mapping and a world anchor are each a new space, and the cheapest AR-readiness step is to name the space of every point and pose in a port type rather than a comment ([01](01-lingo-and-taxonomy.md) sections 1.5 and 4). The mirror flag belongs here too, which is what R3 needs.
- **Scope.** A `SpaceId` union (`image | canvas | body | hand | view | local | world`) with an explicit `mirrored` flag, carried by `HandsFrame`, the new `pointer`, `stroke` and `scene` values, and the overlay `view`; a type-level check that a mapping node only accepts the spaces it declares. Staged: the new nodes and `HandsFrame` first, the rest as they are touched.
- **Acceptance.** `HandsFrame` and `pointer` carry a `space`, a mapping node declared for `canvas` fails to compile when wired to an `image` port, and no identifier in the diff contains `ar`.

### R8. Optional `wave` input on the synth

- **Repo:** core · **Effort:** S · **Value:** medium · **Phase:** 2
- **Why.** `webaudio-synth` uses declarative timbre presets; a drawn wavetable needs either an optional `wave` input or a `wavetable-synth` node. It is a core seam to name now so R5 does not have to fork the synth ([02](02-draw-and-move-with-a-webcam.md) section 13.7).
- **Scope.** An optional `wave` port typed as `{real: Float32Array, imag: Float32Array}` on the synth, applied with `setPeriodicWave` and cross-faded between two oscillators on change; presets untouched when the port is absent.
- **Acceptance.** Existing synth tests pass with the port unwired; wiring a constant sawtooth table produces the same spectrum as the sawtooth preset within 1 dB per harmonic.

### R9. Palm-size relative depth feature

- **Repo:** plugin · **Effort:** S · **Value:** medium · **Phase:** 2
- **Why.** MediaPipe's z and world landmarks say nothing about distance to the camera; apparent palm size does (z proportional to 1 over size), to centimetres at arm's length after one calibration, which is enough for a "push through the surface" click that does not disturb x and y, and for a near-or-far object layer ([02](02-draw-and-move-with-a-webcam.md) section 5.2; the `depthZ` feature removed in thoremin issue #144 was the image z, which is a different thing, [00](00-what-we-have.md) section 1.1).
- **Scope.** A `hand-depth` feature using `L_world / L_px` on wrist to middle MCP, One Euro on `log Z`, a single per-user multiplier set by a one-step calibration dial, and a `push` event from z velocity with hysteresis; pad velocity in `scene-objects` may read it.
- **Acceptance.** Moving a hand from 30 to 60 cm from the webcam changes the reported depth monotonically with under 15 % error after calibration on one device, and a push triggers a pad without the pointer moving more than 10 px.

### R10. Shape snap and a small gesture vocabulary

- **Repo:** plugin · **Effort:** S · **Value:** low · **Phase:** 2
- **Why.** "Draw a circle and get one" turns a stroke into a parametric object the scene can move and the music can use; geometric fits for the five shapes people draw and a $Q recogniser for a few commands (a spiral to clear) are a few hundred lines, run once per stroke at `up`, and are BSD-licensed ([02](02-draw-and-move-with-a-webcam.md) section 8).
- **Scope.** `stroke-shape` with least-squares circle, ellipse and line fits, RDP corner count for polygons, a blend dial from raw to snapped, and a $Q template set as data.
- **Acceptance.** A wobbly hand-drawn circle snaps to a circle object with the blend at 1 and stays raw at 0; the spiral gesture clears the scene in nine of ten tries on the M3 footage.

### R11. Glass-to-photon latency probe

- **Repo:** core · **Effort:** M · **Value:** medium · **Phase:** 3
- **Why.** The latency budget is measured to sound (about 100 ms plus camera), not to the drawn object; for direct manipulation the overlay path is what the player judges, and the two-layer cursor (predicted dot, committed ink) can only be tuned against a number ([00](00-what-we-have.md) sections 1.6 and 4.1, [02](02-draw-and-move-with-a-webcam.md) section 10).
- **Scope.** Extend `?probe=latency` with a screen-capture or high-speed-camera protocol that measures hand movement to cursor movement on screen, written up next to the audio budget; include the video-versus-landmark offset from R3.
- **Acceptance.** The latency research doc gains a glass-to-photon table with mean and p95 at 30 and 60 fps on the reference machine.

### R12. Ray-Ban Display HUD web app and Neural Band triggers

- **Repo:** plugin · **Effort:** S to M · **Value:** low · **Phase:** 4
- **Why.** The Display's Web Apps path (preview since 2026-05-14) runs a plain HTML page on the glasses at 600x600 and 30 Hz, with the Neural Band arriving as arrow keys and Enter; no camera, no audio capture [8][9][10]. For thoremin that is a glanceable chord and scale readout and a four-way-plus-select remote (next preset, advance chord), not an instrument input ([04](04-meta-glasses.md) section 4 options b and c, [03](03-browser-ar-stack.md) section 8). Worth a spike only once the hardware is in hand.
- **Scope.** A static 600x600 high-contrast card fed by a small relay of `{note, chord, degree}` from the running thoremin, and a `keydown` forwarder into the command dispatch; needs public HTTPS and Developer Mode.
- **Acceptance.** The current chord updates on the glasses within one beat of the laptop, and a pinch on the band advances the chord progression.
- **Depends on:** manual task M2 (deferred, see section 4).

### R13. Glasses camera to phone bridge (native app)

- **Repo:** a new repository · **Effort:** L · **Value:** medium · **Phase:** 4, only after measurement
- **Why and why not now.** First-person "draw in the air" through Ray-Ban Meta camera glasses is the best story and the hardest path: the camera reaches only a native Swift or Kotlin app over Bluetooth Classic at 2 to 30 fps with no published latency figure, third-party apps cannot yet be published, and the end-to-end chain is probably a few hundred milliseconds, fine for coarse gestures and too slow for pitch ([04](04-meta-glasses.md) section 4 option a). If tried: stream landmarks from MediaPipe on the phone, not frames, into a `remote-landmarks-source` node; pin the toolkit to 1.0.1 or later [11].
- **Acceptance (if ever filed).** A timestamped clap test gives a measured glasses-to-sound latency before any instrument work starts.
- **Recommendation.** Do not file yet; revisit after R6 has been played.

### R14. Monocular depth network extension

- **Repo:** plugin · **Effort:** M · **Value:** low · **Phase:** none planned
- **Why not.** Depth Anything V2 Small runs in the browser and is Apache-2.0, but it shares the GPU with the hand model, its output is relative, it flickers between frames, and nothing in drawing or moving needs it; occlusion and table placement are its use cases ([02](02-draw-and-move-with-a-webcam.md) section 5.3). Keep it as a named future lazy extension (`ext-depth`) and nothing more.

## 3. Roadmap

| Phase | Name | Steps | Exit criterion |
|---|---|---|---|
| 0 | Hygiene and footage | R2, R7 (staged), M3 | MediaPipe on 1.1.x with the latency number unchanged; a tagged clip set in the recorder format |
| 1 | Draw and move with a webcam | R1, R3, R4 | A player draws a hookless circle and moves a square with two hands in the "Draw and Move" seed |
| 2 | Make it music | R5, R8, R9, R10 | A drawn stroke plays in key; a drawn shape is a timbre; a push triggers a pad |
| 3 | Off the laptop | M1, R6, R11 | The same seed plays in passthrough on a Quest 3S with no camera; glass-to-photon measured |
| 4 | Glasses, optional | M2, R12; R13 only after a latency measurement | A chord readout on the Display; a decision on the camera bridge from a number, not a hope |

Phases 0 and 1 are about three weeks of work together; phase 2 another two; phase 3 depends on the Quest purchase and is a week once it arrives. Each step is shippable on its own, which the lazy-extension model makes cheap: a player who never opens the seed downloads nothing.

## 4. Manual tasks (things only the user can do)

| Id | Task | Cost | Recommendation |
|---|---|---|---|
| M1 | Buy a Meta Quest 3S (128 GB) | US $349.99 after the April 2026 price rise; the Quest 3 is $599.99 and adds nothing for this purpose [12] | **Yes, but after phase 1**, so there is something to port. No developer account or Developer Mode is needed for a web page in the Quest Browser ([04](04-meta-glasses.md) section 5 step 1). |
| M2 | Sign up for the Meta Wearables Developer Center; decide on a Meta Ray-Ban Display | Sign-up is free. The Display is $799 with the Neural Band (plus $200 for prescription lenses in the US), sold in six countries, with a mandatory in-store demo at least until recently [8][13] | **Sign up now, do not buy yet.** A web page on the Display gets a 600x600 HUD and arrow keys, no camera and no WebXR; its APIs are preview and publishing is closed. Revisit when R6 has been played or when Meta documents camera or raw-gesture access for web apps ([04](04-meta-glasses.md) sections 2.2 and 4). |
| M3 | Record a reference set of hand footage with thoremin's recorder | Half an hour in front of the webcam | **Yes, this week.** Clips: a tight pinch, a loose pinch, a pinch through a 2-frame occlusion, two hands grabbing one object, the camera at desk height and above the screen, bright and dim light. Tag them by name. R1, R9 and R10 tune and test against these through `replay_hands`, with no camera in CI ([00](00-what-we-have.md) section 1.1, [02](02-draw-and-move-with-a-webcam.md) sections 14 and 16). Keep the footage out of the public repository. |

Not recommended now: buying Ray-Ban Meta Gen 2 or Oakley glasses for the camera bridge (R13), an Apple Vision Pro ($3,499 class, camera access enterprise-restricted), or waiting for Android XR glasses or Snap Specs, which are announced, not tested ([04](04-meta-glasses.md) section 3).

## 5. Decisions the user must make

| # | Decision | Options | Recommendation and why |
|---|---|---|---|
| D1 | Where do `pointer` and `pinch-state` live? | core, or inside `ext-draw` | **Core.** The air instruments, thoremin-asl and `webxr-hands` all need a latched pinch; building it in the plugin means building it twice ([02](02-draw-and-move-with-a-webcam.md) section 14). |
| D2 | 2-D canvas or three.js for the scene? | canvas 2-D elements now; three.js or react-three-fiber lazily later | **Canvas 2-D in v1.** The overlay draws in a fraction of a millisecond and `perfect-freehand` draws straight into it; keep the scene model in the node so a 3-D renderer is a second output later ([02](02-draw-and-move-with-a-webcam.md) section 9.1, [03](03-browser-ar-stack.md) section 8). |
| D3 | Depth cue? | none; palm-size relative depth; a depth network | **Palm-size, optional, phase 2.** It costs arithmetic and one calibration; the network costs GPU the hand model needs and solves problems drawing does not have ([02](02-draw-and-move-with-a-webcam.md) section 5). |
| D4 | First musical mapping? | contour melody; wavetable; pads | **Contour melody scrubbed by the other hand**, because it needs no core change and is the mapping every drawn-sound system before chose; wavetable second once R8 lands ([05](05-related-work-instruments.md) section 3.6). |
| D5 | Bump MediaPipe before or after the new nodes? | before; after; never | **Before.** Thresholds tuned against 0.10.35 would be tuned twice ([03](03-browser-ar-stack.md) section 3). |
| D6 | Which headset, if any? | Quest 3S; Quest 3; none | **Quest 3S, after phase 1.** Same software capability for this purpose at the lower price [12]. |
| D7 | Buy a Ray-Ban Display now? | now; later; never | **Later.** HUD and remote only for a web page; preview APIs; six countries ([04](04-meta-glasses.md) section 2.2). |
| D8 | Attempt the native camera bridge? | now; after a latency measurement; never | **After a measurement, if at all.** Bluetooth Classic video plus inference is probably a few hundred milliseconds; measure with a clap before writing an app ([04](04-meta-glasses.md) section 4 option a). |
| D9 | Adopt the vocabulary of note 01? | yes; keep ad hoc names | **Yes.** `space`, `anchor`, `pose`, `gesture`, `gate`, `pen-down`; no `ar` in identifiers; WebXR's 25 joint names as the canonical joint vocabulary ([01](01-lingo-and-taxonomy.md) section 4). |
| D10 | Where does the native bridge live, if ever? | inside thoremin-ar; its own repository | **Its own repository**, because it is Swift or Kotlin and ships separately from a web extension ([04](04-meta-glasses.md) section 4 option a). |

## 6. What the ranking leaves out, on purpose

- A fatigue estimator from the body skeleton (Consumed Endurance) is a good optional node and is not on the critical path; the comfort rule for now is "draw below the shoulder with the elbow bent", which a desk webcam makes natural ([01](01-lingo-and-taxonomy.md) section 2.5, [05](05-related-work-instruments.md) section 3.3).
- Physics objects that collide and trigger notes (Matter.js, fixed-step, seedable) are a phase 2.5 toy, after pads work ([02](02-draw-and-move-with-a-webcam.md) section 13.6).
- World anchors, hit tests and plane detection arrive with R6 for free on a headset and are not reachable from a webcam page at all ([03](03-browser-ar-stack.md) section 2).
- Headset tracking is not faster than the webcam pipeline (about 45 ms on Quest 2 in a peer-reviewed study [14]); the headset's gift is registration, not speed, so none of the above is justified by latency ([05](05-related-work-instruments.md) section 3.1).

## REFERENCES

[1] Qiu L, Wang D, Li B, et al. Direct vs. Score-based Selection: Understanding the Heisenberg Effect in Target Acquisition Across Input Modalities in Virtual Reality. arXiv, 2026. [arXiv:2602.01061](https://arxiv.org/abs/2602.01061)
[2] Grab specs (pinch and palm-grab thresholds, hover pairs, release rules). Meta Horizon developer documentation, checked 2026-10-25. [developers.meta.com](https://developers.meta.com/horizon/design/grab_specs/)
[3] npm registry metadata for @mediapipe/tasks-vision (1.1.1 published 2026-10-14). npm, read 2026-10-25. [npmjs.com](https://www.npmjs.com/package/@mediapipe/tasks-vision)
[4] perfect-freehand (MIT). Ruiz S. [github.com/steveruizok/perfect-freehand](https://github.com/steveruizok/perfect-freehand)
[5] BaseAudioContext.createPeriodicWave(). MDN Web Docs, checked 2026-10-25. [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createPeriodicWave)
[6] WebXR Hand Input Module Level 1. W3C Working Draft, 2024-06-05. [w3.org/TR/webxr-hand-input-1](https://www.w3.org/TR/webxr-hand-input-1/)
[7] Hand tracking in WebXR (palm pinch reserved by the system). Meta Horizon developer docs. [developers.meta.com](https://developers.meta.com/horizon/documentation/web/webxr-hands/)
[8] Wearables developer FAQ (Device Access Toolkit 1.0, Web Apps, publishing). Meta for Developers, checked 2026-10-25. [developers.meta.com/wearables/faq](https://developers.meta.com/wearables/faq/)
[9] The wait is over: Build for display glasses starting today. Meta for Developers, 2026-05-14. [developers.meta.com](https://developers.meta.com/blog/build-for-display-glasses/)
[10] How to build a Meta Ray-Ban Display app (web app environment, Neural Band as key events). GlassKit Docs (third party), 2026. [glasskit.app](https://glasskit.app/docs/build-a-meta-ray-ban-display-app)
[11] meta-wearables-dat-android (README, modules, CHANGELOG with the 1.0.1 fix). Meta (GitHub), 2026. [github.com](https://github.com/facebook/meta-wearables-dat-android)
[12] Meta Quest 3 and 3S price rise, April 2026 (secondary; not verified on Meta's store). [usadailyreport.com](https://usadailyreport.com/guides/meta-increases-quest-3-and-quest-3s-prices-in-2026)
[13] Meta Ray-Ban Display: How to Buy and Why. Meta, 2025-10-02. [meta.com](https://www.meta.com/blog/meta-ray-ban-display-retail-faq/)
[14] A methodological framework to assess the accuracy of virtual reality hand-tracking systems: a case study with the Meta Quest 2. 2023-24. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10830632/)

## Reading order

1. [00-what-we-have.md](00-what-we-have.md): what thoremin already does that is AR-adjacent (overlay, pinch, pads, One Euro, the latency budget) and the gap table this note ranks.
2. [02-draw-and-move-with-a-webcam.md](02-draw-and-move-with-a-webcam.md): the method for pinch, grab, drag, depth, smoothing, strokes and making them musical; the node design and the seed.
3. [01-lingo-and-taxonomy.md](01-lingo-and-taxonomy.md): the AR vocabulary and which words thoremin should adopt in ports and docs.
4. [05-related-work-instruments.md](05-related-work-instruments.md): XR instruments and drawn-sound systems, and the design lessons (no haptics, fatigue, tiered control, playing a drawing).
5. [03-browser-ar-stack.md](03-browser-ar-stack.md): WebXR, MediaPipe, three.js and friends in late 2026, with depend/study/avoid verdicts and the 25-to-21 joint map.
6. [04-meta-glasses.md](04-meta-glasses.md): Meta's line-up, what a developer can touch on each, prices, and the feasibility ranking (Quest 3S first).
7. This note: the ranked steps, the roadmap, the decisions and the manual tasks.
