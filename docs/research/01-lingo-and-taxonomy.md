# The vocabulary of AR, for a thoremin developer

Research note 01 for thoremin-ar. Checked 2026-10-25. Scope: the words people use in AR/MR/XR documentation, what each means precisely, which vendor says what, and which of those words thoremin should adopt in its code and docs. Context: thoremin is a browser instrument (React/TS/Vite) played with the body through a webcam, where MediaPipe landmarks feed a typed dataflow DAG of nodes, instruments are graphs, and optional features arrive as lazy extensions (see `docs/ARCHITECTURE.md`, `docs/design/instruments-as-graphs-and-extensions.md` and `docs/design/lazy-extensions.md` in the thoremin repo).

## In short

- "AR", "MR", "XR" and "spatial computing" are marketing-grade labels over one old academic idea, Milgram and Kishino's reality-virtuality continuum [1]. Vendors use them inconsistently, so thoremin docs should describe capabilities (what is tracked, what is occluded, where content is anchored) rather than rely on the label.
- The hardware split that matters is video passthrough versus optical see-through [2]. It decides whether the system can occlude, how latency is felt, and whether a webcam-only prototype is a fair stand-in.
- The tracking split that matters is 3DoF versus 6DoF [3], and, for content, which coordinate space it lives in: world-locked, body-locked or head-locked [4]. A webcam gives thoremin neither world tracking nor depth, so thoremin today lives in "image space", and every AR feature it adds is a new space it must name.
- All the hand-input vocabularies converge on the same small set: poke (direct touch), pinch, grab, ray (indirect, far), plus gaze-plus-pinch on eye-tracked devices, and thumb microgestures or EMG on wrist-worn sensors [5][6][7][8][9]. The names differ, the semantics barely do.
- The hard problems also have standard names: the Midas touch problem (everything you look at, or do with your hand, is a command) [10], gorilla arm (mid-air fatigue) [11], and for drawing in the air, the missing pen-up signal [12]. Thoremin's "draw and move objects in the camera view" idea hits all three.
- Recommendation (last section): adopt Meta's pose/gesture/gate/targeting/selection split for input, WebXR's names for spaces, and a hysteresis-based pinch state machine with three named states, and keep the word "AR" out of identifiers (use `spatial`, `space`, `anchor`).

## 1. Taxonomies

### 1.1 Milgram's continuum and the "XR" family

Milgram and Kishino (1994) define a virtuality continuum with completely real environments at one end and completely virtual environments at the other; mixed reality (MR) is anything in between; augmented reality (AR) is a real environment augmented with virtual objects, and augmented virtuality (AV) is the converse [1]. Their paper also lists six classes of hybrid display and criteria such as whether the display is video-based or graphics-based and whether the real world is viewed directly; the authors admit the sorting was only partly successful [1]. Skarbez, Smith and Whitton (2021) argue that the field adopted the continuum but ignored the taxonomy, and that the continuum is not truly continuous because perfect VR cannot be reached [13].

How the labels are used today, as far as the documents I could verify show:

| Label | Academic sense | Common vendor/industry sense | Verdict for thoremin docs |
|---|---|---|---|
| AR | Real world augmented with virtual objects [1] | Anything that overlays graphics on a camera view or on glass; WebXR calls its mode `immersive-ar` and says AR "is always immersive" because the scene covers the user's surroundings [3] | Use only for "virtual content registered to the real world". A webcam overlay is not AR in this sense. |
| MR | Whole span between real and virtual [1] | Microsoft says "mixed reality" for HoloLens and for VR headsets running the same shell [14]; Meta says "mixed reality" for Quest passthrough apps | Avoid; say "passthrough" or "see-through". |
| XR | Not in the 1994 paper | Umbrella for VR+AR+MR; WebXR is the web API for all of them, with VR and AR "nearly identical" in rendering [3] | Fine as the API family name (WebXR), not as a feature name. |
| Spatial computing | Not in the paper | Apple's term for visionOS-style apps; Apple's gesture pages are written for "spatial" input [15] | Use as a design vocabulary (spaces, anchors, gaze+pinch), not as a product claim. |

### 1.2 Display types: video passthrough versus optical see-through

MDN's WebXR fundamentals describe the two AR device types plainly: camera-based devices (phones, camera-equipped goggles) capture the real world and render content over that image on a screen, with one camera per eye on stereo goggles; transparent glasses let the user see the world directly and draw rendered objects onto the lenses [3]. In the literature these are video see-through (passthrough) and optical see-through, the "viewed directly" criterion in Milgram's taxonomy [1].

| | Video passthrough | Optical see-through |
|---|---|---|
| Real world | Camera image, rendered | Direct light through the lens |
| Occlusion of real by virtual | Full (every pixel is rendered) | Additive light only: virtual content cannot be darker than the world behind it |
| Occlusion of virtual by real | Possible with depth | Needs depth plus per-pixel dimming, usually absent |
| Latency felt | Camera-to-display latency applies to the whole world | World is zero-latency; only the overlay lags |
| Examples | Phone AR, Quest and Vision Pro passthrough | HoloLens, small-display glasses |

Why it matters for thoremin: a browser page on a laptop is a degenerate video passthrough device (webcam image plus overlay, mirrored), which is exactly what thoremin already is. Glasses like the Ray-Ban Display put a small display in the lens and, at the time of checking, expose a camera and display through a mobile-phone SDK in developer preview, not a WebXR session [16]. So "try Meta glasses" means an input-and-notification device, not a spatial renderer, and the docs must not blur those.

### 1.3 Degrees of freedom

WebXR defines 3DoF as rotation-only tracking (pitch, yaw, roll) and 6DoF as rotation plus translation (forward/back, left/right, up/down) [3][17]. ARCore describes pose as position and orientation and gets 6DoF by SLAM: tracking visually distinct feature points in camera images and fusing them with IMU data [2]. The common names:

- Inside-out tracking: the device's own cameras and sensors track it, with no external base stations. Almost all current AR does this.
- SLAM (simultaneous localization and mapping): build a map and locate yourself in it at the same time [2].
- VIO (visual-inertial odometry): the camera plus IMU fusion at the heart of SLAM on phones and headsets. ARCore's page does not use the term [2], so in thoremin docs treat VIO as the generic name and SLAM as the system-level name.
- Plane detection: grouping feature points that lie on common horizontal or vertical surfaces into planes with boundaries; textureless surfaces such as a white wall may not be detected reliably [2].
- Meshing: a denser reconstruction of surfaces as a triangle mesh; WebXR hit tests can target `point`, `plane` or `mesh` entities [18].
- Depth: a per-pixel distance map, used for collisions and for placing virtual objects in front of or behind real ones [2].

### 1.4 Anchors, occlusion, hit-testing

- Anchor: a pose the system keeps attached to a real-world location as its understanding of the environment is refined (ARCore `Anchor`, WebXR `XRAnchor`, ARKit `WorldAnchor`). ARCore calls planes and feature points "trackables" and advises reusing and detaching anchors to save CPU [2][3].
- Occlusion: real things hiding virtual things. Two sources: scene depth (per-pixel distance from the environment) and people occlusion (a segmentation of the person in front, so a virtual object passes behind a body). The ARCore page implies the first without naming it [2]; I did not find a primary page for people occlusion in this pass, so treat that definition as general knowledge.
- Hit-testing / raycasting: project a ray (an origin and a normalized direction [18]) and return the first intersection with sensed geometry, with its pose in world space. ARCore does it from a screen (x,y) point; WebXR does it through `XRHitTestSource` created with `requestHitTestSource()` and read each frame with `getHitTestResults()` [2][18]. The WebXR Hit Test module is a W3C Working Draft (11 December 2025) and MDN lists support in Chrome only [18].

### 1.5 Spaces: where does content live?

| Space | Moves with | Typical use | WebXR term |
|---|---|---|---|
| World-locked | The physical room | A virtual object resting on a table; needs 6DoF world tracking | `local`, `local-floor`, `unbounded`, or an anchor [17] |
| Head-locked | The head/display | HUD text; uncomfortable when overused | `viewer` space (anchored to the viewer) [17] |
| Body-locked | The torso | A tool palette that follows you but does not swing with your gaze | No WebXR name; built from head pose with lag |
| Hand-locked | A tracked hand or controller | Hand menu, wrist panel | Joint spaces (`XRJointSpace`) [19] |
| Screen / image space | The 2D display or camera frame | Everything in a webcam app | Not an XR concept; this is thoremin's current space |

The world/head/body-locked definitions are quoted from patent filings that describe head-mounted devices generally, not from Apple documentation: world-locked content is fixed relative to the physical environment, head-locked content is fixed relative to the head-mounted device and does not follow gaze, body-locked content is positioned relative to the torso regardless of head direction; the same sources say 6DoF world tracking is enabled for world-locked content and disabled for the other two [20]. Treat them as the industry-standard meanings rather than official Apple wording.

Thoremin note: MediaPipe gives normalized image coordinates (camera frame) per landmark, and, from my knowledge of the library, also metric "world" landmarks with a hand-centred origin; I did not re-verify the latter in this pass, so check before relying on it. Neither is a world-locked space. Naming the space of every signal in the DAG (a port type, not a comment) is the cheapest AR-readiness step.

## 2. Interaction vocabularies

### 2.1 General terms

- Direct manipulation: the hand acts on the object where the object is (touching or grabbing it). Indirect manipulation: a pointer, ray or cursor acts at a distance, then a gesture commits. Apple calls these direct input (touch) and indirect input (look and pinch) [15].
- Near versus far interaction: Microsoft defines far interaction as "point and commit": a hand ray from the palm plus an air tap, switching on automatically when the object is farther than roughly 50 cm and off inside arm's reach, so the same grab gesture works at both distances [21].
- Poke, pinch, grab, ray: Meta's Interaction SDK names its core interactions Poke (direct touch of buttons and scroll panels), Ray (select from a distance), and Grab (hold and move objects, with Distance Grab, Throw, Snap and Grab Transform variants) [6]. Pinch is listed as a pose, and gaze can select a target which a hand pinch then confirms [6].
- Meta's vocabulary of input events is the most precise I found: targeting (direct touch or ray), selection (activating), pose (a static hand shape such as pinch or grab), gesture (movement across a sequence of poses, such as a swipe), and gate (moving the hand from idle to active through a pose or gesture) [6].
- Gaze plus pinch: eye gaze targets, pinch commits; hands can rest in the lap. Apple's apps receive only the resulting gesture events for the element and not raw gaze [15].
- Affordance: a visible cue about what an object lets you do (a corner handle suggests scaling). Microsoft ties the gesture to the affordance: a small control point invites a pinch, a large object invites a five-finger grab [21]. Meta asks for clear visual and audio feedback on success [6].
- Hand menu: a UI panel attached to the hand or wrist (hand-locked, section 1.5) opened by a gesture and operated with the other hand. This pass found no primary page defining it per vendor; Meta's page says only that hand UI has placement guidance and that hands occluding each other reduces tracking accuracy [6].

### 2.2 Comparison across vendors

| Concept | Apple visionOS | Meta Quest (Interaction SDK) | Microsoft (HoloLens 2, MRTK) | Android XR |
|---|---|---|---|---|
| Select | Tap: look, then pinch once [15] | Pinch pose, or Poke on direct touch; Ray for far [6] | Air tap (thumb and index) after a hand ray points [21] | Pinch with index finger and thumb on the primary hand [22] |
| Commit and hold | Pinch and hold (long press) [15] | Grab holds and moves objects [6] | Air tap and drag; "grab and drag" on affordances [21] | Held pinch scrolls, moves or resizes windows, moves objects [22] |
| Direct touch | Touch with fingertip [15] | Poke [6] | Near interaction under about 50 cm [21] | Not verified in this pass |
| Far / indirect | Gaze plus pinch [15] | Ray, Distance Grab [6] | Hand ray from the palm, with a pointing state (dashed ray, donut cursor) and a commit state (solid ray, dot cursor) [21] | Not verified in this pass |
| Two-hand | Zoom and rotate with both hands pinching [15] | Grab Transform for scale and rotation [6] | Two-hand move, scale, rotate on the bounding box [21] | Not verified in this pass |
| Fine low-effort | None beyond pinch (not verified) | Microgestures: thumb tap and four-way thumb swipes on the side of the index finger, reported at the end of the motion; OpenXR extension `XR_META_hand_tracking_microgestures` with left, right, forward, backward swipe and thumb tap [7] | None found | None found |
| Custom gestures | Not verified | Pose and gesture detection in ISDK [6] | Joint poses via `TryGetJoint` etc. [23] | Use the secondary hand, because the system owns gestures on the primary hand; pinch detection in the Jetpack XR sample is a thumb-tip to index-tip distance under a threshold (0.05 in the sample's units) [22] |
| Hand data | System gestures, no raw gaze [15] | 26-joint OpenXR-style hands (not verified here) | Articulated joints via `TrackedHandJoint` [23] | `ARCore for Jetpack XR` hand joints [22] |
| Web access | Safari/WebXR (not verified here) | WebXR hand input (W3C Working Draft, 25 joints per hand, named `thumb-tip`, `index-finger-tip` and so on) [19] | WebXR | WebXR |

Caveats: the Apple row comes from a fetch that returned a summary the tool itself flagged as drawn partly from general knowledge, because Apple's pages render with JavaScript; the gesture names are well known but should be re-checked against Apple's page before they are quoted in thoremin docs. MRTK 2 documentation carries an archive pointer, so treat its names as stable but legacy [23]. The Android XR row is from a search summary of the official design and Jetpack XR pages [22], not a full read.

### 2.3 Wrist-worn input: microgestures and EMG

Meta's Neural Band is a surface-electromyography (sEMG) wristband that reads forearm muscle activity and turns small finger and hand movements into commands for the Ray-Ban Display glasses; coverage describes pinch, tap and swipe, a one-dimensional cursor driven by wrist movement, and handwriting by tracing letters on a surface, and sources differ on the exact gesture mappings [24]. The Nature paper behind it (Kaifosh, Reardon et al., 2025) reports closed-loop medians of 0.66 target acquisitions per second for continuous navigation, 0.88 gesture detections per second for discrete gestures, and 20.9 words per minute for handwriting, with a model that works across people without per-user training [25]. Press commentary notes 20.9 wpm is below typical phone typing (about 36 wpm) [26]. Meta also released an sEMG dataset of over 100 hours from 300 participants [26].

Vocabulary: a microgesture is a low-effort, small-amplitude gesture (thumb on index finger) as opposed to a full mid-air hand motion [7]; EMG can detect intent without line of sight to the hand, which is the exact thing a webcam cannot do.

Why it matters for thoremin: the Neural Band pairs with display glasses and, as of the sources found, there is no browser API to read it. Thoremin should model it as another input source node emitting the same discrete events (`pinch`, `swipe-left`, ...) as a camera-derived gesture, so a seed that wants a "next preset" trigger does not care which hardware produced it. That is exactly the "swap an input node" pattern in the instruments-as-graphs design.

### 2.4 Mid-air drawing and writing

"Air-writing" is writing characters or words in free space with finger or hand movement and no handheld device; the two classic difficulties are robust fingertip tracking, because the fingertip is small, and the lack of a delimiter for when writing starts and stops [12]. Recent work on continuous air-writing frames it as stroke segmentation: the finger never lifts, so strokes join adjacent letters with no pen-up signal, and the same word varies in scale, position and slant across writers; one 2026 thesis feeds fingertip trajectories from hand landmarks (not raw video) to a Conformer with a CTC/attention head [27]. "Air drawing" or "mid-air sketching" are the same capture problem without the recognition step, and the same missing clutch applies: when is the pen down?

The standard resolutions, which map onto the vocabulary above: use a pose as the gate (pinch means pen down, release means pen up), use a velocity rule to end a stroke (as Mukherjee et al. do [12]), or use a second hand as a clutch. Thoremin's MediaPipe stream already provides the fingertip trajectory; what it lacks is a named pen-down state machine (section 4).

### 2.5 The two human-factors problems

- Midas touch: Jacob's 1990 CHI paper on eye-movement interaction observed that mapping gaze naively to commands makes every look a command, so the interface behaves like King Midas's touch; dwell time is the usual mitigation, with a speed versus error trade-off [10]. Gaze plus pinch is the vendor answer: gaze targets, a deliberate pinch commits [15]. For a hand-only system the same problem appears as "my hand is always in view, so everything it does is input", which is why Meta introduces the gate, a pose or gesture that takes the hand from idle to active [6].
- Gorilla arm: heavy-limb fatigue from holding arms up. Hincapié-Ramos et al. (CHI 2014) propose Consumed Endurance, a metric derived from the biomechanics of the upper arm and computed from a camera skeleton tracker, which correlates strongly with the Borg CR10 exertion scale; an open-source workbench exists [11]. A 2024 follow-up, NICER, adds a muscle-contraction term and a recovery term and handles above-shoulder interaction better [28]. Meta's comfort guidance: neutral posture, arms close to the body, elbows in line with the hips, frequently used elements near the body [6].

Why it matters for thoremin: an instrument played for minutes is a fatigue experiment. Because thoremin already has per-frame arm landmarks from MediaPipe pose, a Consumed-Endurance-style estimator is a plausible optional node that could warn a player, and "rest pose" should be a first-class gesture so that holding a note does not require holding up an arm.

## 3. Glossary

| Term | One-line definition | Why it matters for thoremin |
|---|---|---|
| AR | Virtual content registered to the real world [1] | Thoremin's webcam overlay is not AR; don't claim it |
| VR | Fully virtual environment [1] | Out of scope |
| MR | Anything between real and virtual [1] | Vendor label; avoid |
| XR | Umbrella for VR/AR/MR; WebXR is the API [3] | The only web route to glasses and headsets |
| Spatial computing | Apple's label for gaze-and-pinch, anchored-app computing [15] | Design vocabulary, not a feature |
| Reality-virtuality continuum | Milgram's real-to-virtual axis [1] | Gives a neutral way to place thoremin |
| Video passthrough | Camera image re-rendered to the display [3] | A laptop webcam page is one |
| Optical see-through | Direct view through lenses with overlay [3] | Cannot occlude; changes visual design |
| 3DoF | Rotation-only tracking [3] | Webcam head tilt is nothing like this; phone gyro is |
| 6DoF | Rotation plus translation tracking [3] | Required for world-locked content |
| Inside-out tracking | Device's own sensors track it | What glasses do; no setup for players |
| SLAM | Build a map while locating in it [2] | What gives world-locking; not available from a web page without WebXR |
| VIO | Camera plus IMU motion estimate | Same, name for the fusion step |
| Feature point | A visually distinct point SLAM tracks [2] | Why blank walls fail |
| Plane detection | Finding flat surfaces in feature points [2] | "Draw on the table" needs it |
| Meshing | Dense surface reconstruction | Collision and occlusion of drawings |
| Trackable | A plane or point an anchor can attach to [2] | Typed port candidate |
| Anchor | Pose kept attached to the real world [2] | How a drawn object stays put |
| Depth map | Per-pixel distance [2] | Occlusion, hand-to-surface distance |
| Occlusion | Real objects hiding virtual ones | Without it drawings float in front of everything |
| People occlusion | Person segmentation used to hide virtual content | Not found in a primary source this pass |
| Hit-test | Ray into sensed geometry returning a pose [2][18] | "Where on the table is my fingertip pointing" |
| Raycast | The general ray-versus-scene query | Same |
| Reference space | A coordinate frame for poses (`viewer`, `local`, `local-floor`, `bounded-floor`, `unbounded`) [17] | Source of our space names |
| World-locked | Fixed to the room [20] | Drawing that stays |
| Head-locked | Fixed to the display [20] | HUD; use sparingly |
| Body-locked | Fixed to the torso [20] | Tool palette that follows the player |
| Hand-locked | Fixed to a joint [19] | Hand menus |
| Direct manipulation | Hand acts on the object where it is [15] | Webcam: fingertip over an on-screen object |
| Indirect manipulation | Pointer or gaze acts at distance, gesture commits [15] | Webcam: any cursor driven by a landmark |
| Near / far interaction | Under or beyond about 50 cm reach [21] | Maps to "touch the canvas" versus "ray to the canvas" |
| Poke | Direct fingertip press [6] | Button press on a virtual pad |
| Pinch | Thumb-index contact pose [6] | The universal click and pen-down |
| Grab | Whole-hand hold of an object [6] | Move objects |
| Ray | A line from hand or head for far targeting [6][21] | Cursor for far canvas |
| Hand ray | Ray from the palm, with pointing and commit states [21] | Good cursor design reference |
| Gaze plus pinch | Eye targets, pinch commits [15] | Not available from a webcam |
| Pose | Static hand shape [6] | Typed event |
| Gesture | Movement across poses [6] | Typed event with a trajectory |
| Gate | Hand goes from idle to active [6] | Solves Midas touch for hands |
| Microgesture | Small thumb tap or swipe on the index finger [7] | Low-fatigue discrete triggers |
| sEMG | Surface electromyography from the forearm [25] | Neural Band; no browser API |
| Air-writing | Writing in free space without a device [12] | Needs a pen-up signal |
| Air drawing / mid-air sketching | Same capture, no recognition | Thoremin's draw-in-view feature |
| Midas touch | Everything you target is a command [10] | Needs a gate |
| Gorilla arm | Fatigue from raised arms [11] | Limits session length |
| Consumed Endurance | Metric for arm fatigue [11] | Candidate fatigue node |
| Affordance | Visible cue about what is possible [21] | Draw the handle, then the gesture follows |
| Hand menu | UI attached to a hand or wrist | Palette for instruments without a mouse |

## 4. Which terms thoremin should adopt

Principles: borrow names that are already in a spec thoremin may meet (WebXR, OpenXR/Meta, MediaPipe), prefer the precise Meta split (pose, gesture, gate, targeting, selection) over vendor marketing, and put every spatial claim into a typed port so the DAG enforces it.

1. Space names (a typed `SpaceId` carried by pose and point ports):
   - `image` (normalized camera frame, origin top-left, mirrored flag explicit): what thoremin has today.
   - `canvas` (the on-screen drawing surface in CSS pixels).
   - `body` (relative to shoulders or torso, scale-normalized, so the instrument works at any distance from the camera: the practical "body-locked").
   - `hand` (relative to a wrist, for hand-locked UI).
   - `view` (WebXR `viewer`), `local`, `world` (WebXR `local-floor` or anchored), reserved until a WebXR extension exists.
   Do not name anything `ar`; use `world` and `anchor`. Keep "head-locked" and "body-locked" in prose only where the doc is comparing devices.
2. Pinch state machine, three states and two thresholds (hysteresis), not a boolean:
   - `open` (fingers apart), `near` (about to pinch: lets the UI show a hover cursor and ring, the "pointing state" in Microsoft's terms [21]), `pinched` (committed).
   - Events: `pinch-start`, `pinch-hold`, `pinch-end`, as Apple's tap/pinch-and-hold and Meta's selection do [6][15].
   - Distance threshold in hand-scale units (thumb-tip to index-tip divided by palm size), configurable per instrument; the Jetpack XR sample's fixed 0.05 shows why a raw threshold is fragile [22].
3. Input event vocabulary: `pose`, `gesture`, `gate`, `target`, `select`, copied from Meta [6]. A `gate` node is the thoremin answer to Midas touch: nothing downstream of a gate receives hand data while it is closed.
4. Interaction modes as node categories: `poke` (direct on canvas), `grab`, `ray` (cursor from a landmark), `pinch`. Use "direct" and "indirect" for the manipulation style and "near" and "far" only where a physical distance is actually measured.
5. Pen vocabulary for air drawing: `pen-down` and `pen-up` derived from the pinch state or a gate, `stroke` (a polyline in a named space), `trajectory` (raw fingertip samples). Avoid "air-writing" for features without recognition.
6. Comfort vocabulary: `rest` (a gate-closing pose), `reach`, and an optional `fatigue` signal named after Consumed Endurance [11]; document the posture guidance from [6] in seed docs.
7. Hardware vocabulary in docs: `passthrough`, `see-through`, `display glasses` (small display, no world tracking) and `headset`; say `wristband` or `sEMG` for the Neural Band and model it as an input extension that emits the same `pose` and `gesture` events [24].
8. Standards to track rather than invent: WebXR Hand Input's 25 joint names are the right canonical joint vocabulary for a future adapter from MediaPipe's 21 landmarks [19]; WebXR Hit Test and Anchors for any world-locked extension, delivered as a lazy extension so players without an XR device pay nothing [18].

Non-goals for this note: implementation of any of the above; library choices (see the other research notes).

## REFERENCES

[1] A Taxonomy of Mixed Reality Visual Displays. Milgram P, Kishino F. IEICE Trans. Information and Systems, 1994. [PDF copy](https://web.cs.wpi.edu/~gogo/courses/imgd5100/papers/Milgram_IEICE_1994.pdf) and [IEICE listing](https://global.ieice.org/en_transactions/information/10.1587/e77-d_12_1321/_p)
[2] ARCore fundamentals (motion tracking, environmental understanding, depth, hit-testing, anchors). Google, accessed 2026-10-25. [developers.google.com/ar/develop/fundamentals](https://developers.google.com/ar/develop/fundamentals)
[3] WebXR Device API fundamentals. MDN Web Docs, accessed 2026-10-25. [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Fundamentals)
[4] Anchoring methods (spatial UI overview). Innoactive, accessed 2026-10-25. [innoactive.io](https://innoactive.io/resources/spatial/anchoring-methods)
[5] Gestures. Apple Human Interface Guidelines, accessed 2026-10-25 (page is script-rendered; content partly summarised from general knowledge, re-verify before quoting). [developer.apple.com](https://developer.apple.com/design/human-interface-guidelines/gestures)
[6] Hands design guidance and Interaction SDK overview. Meta Horizon developer documentation, accessed 2026-10-25. [design](https://developers.meta.com/horizon/design/hands/) and [ISDK overview](https://developers.meta.com/horizon/documentation/unity/unity-isdk-interaction-sdk-overview/)
[7] Hand tracking microgestures (`XR_META_hand_tracking_microgestures`). Meta Horizon developer documentation, accessed 2026-10-25 via search summary. [developers.meta.com](https://developers.meta.com/horizon/documentation/native/android/mobile-openxr-hand-tracking-microgestures/)
[8] Point and commit with hands. Microsoft Learn, updated 2025-08-21. [learn.microsoft.com](https://learn.microsoft.com/en-us/windows/mixed-reality/design/point-and-commit)
[9] Android XR design foundations and considerations. Google, accessed 2026-10-25. [foundations](https://developer.android.com/design/ui/xr/guides/foundations) and [considerations](https://developer.android.com/design/ui/xr/guides/considerations)
[10] What You Look at Is What You Get: Eye Movement-Based Interaction Techniques. Jacob RJK. CHI 1990 (read via search excerpts and secondary summaries, not the full text). [exhibit copy](https://www.docketalarm.com/cases/PTAB/PGR2020-00063/Supercell_Oy_v._Gree_Inc/05-08-2020-Petitioner/Exhibit-1010-Exhibit_1010__Robert_Jacob,_April_1990,_Eye_Movement_Based_Interaction_Techniques/)
[11] Consumed Endurance: A Metric to Quantify Arm Fatigue of Mid-Air Interactions. Hincapié-Ramos JD, Guo X, Moghadasian P, Irani P. CHI 2014. [project page](https://hci.cs.umanitoba.ca/projects-and-research/details/ce)
[12] Fingertip Detection and Tracking for Recognition of Air-Writing in Videos. Mukherjee S et al. Expert Systems with Applications, 2019. [arXiv:1809.03016](https://arxiv.org/pdf/1809.03016)
[13] Revisiting Milgram and Kishino's Reality-Virtuality Continuum. Skarbez R, Smith M, Whitton MC. Frontiers in Virtual Reality, 2021. [frontiersin.org](https://frontiersin.org/articles/10.3389/frvir.2021.647997/full)
[14] Point and commit with hands (uses "mixed reality" for HoloLens 2 and immersive headsets). Microsoft Learn. See [8].
[15] See [5].
[16] Meta Wearables Device Access Toolkit: FAQ and developer-preview coverage (announced 2025-12-04; display support added May 2026). [FAQ](https://developers.meta.com/wearables/faq) and [Road to VR](https://roadtovr.com/meta-ray-ban-smart-glasses-third-party-app-sdk-device-access-toolkit/)
[17] WebXR Device API. W3C Working Draft (reference spaces, 3DoF/6DoF definitions), accessed 2026-10-25. [w3.org/TR/webxr](https://www.w3.org/TR/webxr/)
[18] WebXR Hit Test Module. W3C Working Draft, 2025-12-11. [w3.org/TR/webxr-hit-test-1](https://www.w3.org/TR/webxr-hit-test-1/)
[19] WebXR Hand Input Module Level 1. W3C Working Draft, 2024-06-05. [w3.org/TR/webxr-hand-input-1](https://www.w3.org/TR/webxr-hand-input-1/)
[20] Apple patent filings describing world-locked, head-locked and body-locked content (general definitions). USPTO. [example 12058301](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12058301)
[21] See [8].
[22] Work with hands using ARCore for Jetpack XR. Google, accessed 2026-10-25. [developer.android.com](https://developer.android.com/develop/xr/jetpack-xr-sdk/work-with-hands)
[23] Hand tracking, MRTK 2. Microsoft Learn. [learn.microsoft.com](https://learn.microsoft.com/en-us/windows/mixed-reality/mrtk-unity/mrtk2/features/input/hand-tracking?view=mrtkunity-2022-05)
[24] Meta Ray-Ban Display and Neural Band launch coverage (Sept 2025; mappings differ between sources). [heise](https://heise.de/-10660811) and [ithinkdiff](https://www.ithinkdiff.com/meta-ray-ban-display-neural-band/)
[25] A generic non-invasive neuromotor interface for human-computer interaction. Kaifosh P, Reardon TR et al. Nature 645, 2025. [IDEAS/RePEc record](https://ideas.repec.org/a/nat/nature/v645y2025i8081d10.1038_s41586-025-09255-w.html)
[26] Meta eggheads demo Bluetooth wristband that decodes muscle twitches for UI control. The Register, 2025-07-23. [theregister.com](https://www.theregister.com/2025/07/23/meta_wristband_ui_control/)
[27] Air-writing recognition dissertation (2026) using the WiTA benchmark, as summarised by search. [Air-Writing Recognition](https://dspace.isical.ac.in/items/65555380-90de-47d5-ac05-4f7959ade211)
[28] NICER: A New and Improved Consumed Endurance and Recovery Metric. Li et al. ACM TOG, 2024. [arXiv:2406.08875](https://arxiv.org/html/2406.08875v1)
