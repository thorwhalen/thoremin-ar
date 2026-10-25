# The browser AR stack, late 2026

Checked 2026-10-25. Facts that move fast (versions, browser support, vendor status) carry their source and the date they were read. Where a claim comes from a secondary source or from my own inference, it says so.

## In short

- thoremin already has the hard half of "AR in the browser": a camera-to-landmarks pipeline (MediaPipe Tasks Vision in a worker, GPU delegate, typed `HandsFrame` on the DAG). What it lacks is a 3D overlay layer and a headset path. Neither needs a replacement of the pipeline.
- **WebXR AR is a headset and Android-phone technology.** Chrome on Android (ARCore) and Quest Browser run `immersive-ar`; Android XR Chrome lists the AR module, hand input, hit test, anchors, depth and light estimation [5]. **Safari on iPhone has no WebXR; Safari on visionOS documents `immersive-vr` only** [6][7]. Desktop has no AR session at all.
- **Hand joints are available in-headset without any ML on our side**: Quest Browser (25 joints) [9], Android XR Chrome [5] and visionOS Safari (VR sessions, extra consent prompt) [6][7]. They map cleanly onto MediaPipe's 21 landmarks by dropping the four finger metacarpals (table below), so `webxr-hands` can be a second source node emitting the same `HandsFrame` and existing instruments run unchanged.
- **Phones in WebXR do not give hands.** On a phone the camera belongs to ARCore; there is no hand input. The practical phone path is the one thoremin already has (getUserMedia + MediaPipe) plus an R3F overlay. Raw camera access exists in Chromium [10] but not on Quest (a developer report, unconfirmed by Meta) nor Safari, and I would not build on it.
- **Library verdicts**: depend on three.js, `@react-three/fiber`, `@react-three/xr` (v6.6, MIT) and `@mediapipe/tasks-vision`; study 8th Wall's open engine (MIT, SLAM excluded) and MindAR; avoid Needle Engine (paid for commercial use), AR.js, TFJS-based hand models, and the legacy `@mediapipe/hands` package.
- **8th Wall**: the hosted platform ended 2026-02-28; an MIT engine framework without SLAM (plus a binary-only distributed engine) lives on at 8thwall.org [14]. Useful as a reference, not as a dependency for a hand-driven instrument.
- **Meta glasses**: Ray-Ban Display "web apps" are 600x600, 30 Hz, additive display, input from the Neural Band, no documented camera and no WebXR [15]. They suit a tiny HUD or a remote control for thoremin, not hand tracking.
- Housekeeping: thoremin pins `@mediapipe/tasks-vision ^0.10.35`, and a caret range on a 0.x version cannot reach the published 1.1.1; the dependency list also still carries three 2023-era packages (`@mediapipe/hands`, `@tensorflow-models/hand-pose-detection`, TFJS 4.22) that look like fallbacks.

## 1. What thoremin uses today

From the repo's `package.json` and `src/nodes/sources/`:

- `@mediapipe/tasks-vision ^0.10.35` (installed 0.10.35). `hands.worker.ts` runs `HandLandmarker` in a classic worker with `FilesetResolver.forVisionTasks(wasmBase)`, `delegate: 'GPU'` when the worker can get a WebGL2 `OffscreenCanvas`, otherwise the page keeps the model on the main thread. Face (`webcam_face.ts`) and body (`slices/body/`) use the same package.
- Also listed: `@mediapipe/hands ^0.4.1675469240`, `@tensorflow-models/hand-pose-detection ^2.0.1`, `@tensorflow/tfjs-*` 4.22. These are old; the `Keypoint` doc comment says "named keypoints as emitted by hand-pose-detection are tolerated", so they are a compatibility path.
- The DAG edge is `HandsFrame { width, height, hands: Hand[] }` where `Hand` has `handedness`, 21 `keypoints` (pixel coordinates), optional 21 `worldKeypoints` (metres) and `score` (`packages/sdk/src/nodes/domain/hands.ts`). Invariant finger features use the world keypoints. This is the seam the WebXR path plugs into.

## 2. WebXR Device API and its modules

Spec index and interface list from MDN, read 2026-10-25 [1]. MDN still flags the API as limited availability (not Baseline) and experimental.

| Module | What it gives | Use for thoremin |
|---|---|---|
| Core + AR Module (`immersive-ar`) | Session with the real world visible (passthrough on headsets, camera on phones) | The container for any AR instrument |
| Hit Test | Rays against detected real surfaces | Place a virtual instrument on a table or wall |
| Anchors | Pose that stays fixed to the world; Quest adds persistent anchors (max 8 per site, lost when site history is cleared) [8] | Instrument stays where you put it between sessions |
| Hand Input (`hand-tracking`) | `XRHand`: 25 joint spaces per hand, radii, `fillPoses()` for flat reads [4] | The big one: hands without a camera pipeline |
| Depth Sensing | CPU or GPU depth maps; on Android XR one per eye [5] | Occlusion; hands behind objects; not needed for sound |
| DOM Overlay | A DOM subtree drawn over the AR view (phone `immersive-ar`) | Reuse thoremin's React panels in phone AR; headsets mostly do not render it |
| Light Estimation | `XRLightProbe`, `XRLightEstimate` | Cosmetic realism only |
| Layers | Quad, cylinder, equirect, projection layers | Crisp UI panels in a headset; optional |
| Raw Camera Access (`camera-access`) | The camera image as a WebGL texture | The only way to run a vision model on the AR camera during a session |
| Gamepads | Controller buttons and axes (Quest hands expose pinch as emulated gamepad button [9]) | Controller-played instruments |

### Browser and device support (read 2026-10-25)

| Target | AR session | Hand input | Notes |
|---|---|---|---|
| Chrome desktop / Edge / Firefox / Safari macOS | No (VR with a headset only; Safari and Firefox flagged off) [2] | No | caniuse: Chrome and Edge partial from 79, Firefox disabled by default through 161, Safari disabled by default through 27.1 [2] |
| Chrome Android | Yes, via ARCore on supported phones (secondary sources [11]); caniuse lists partial support [2] | No (phones lack it [5]) | Hit test, anchors, DOM overlay, light estimation, depth on supported devices; raw camera access listed as supported in Chrome for Android [10] |
| Samsung Internet | Partial from 12 [2] | No | Camera access from 21 [10] |
| Safari iOS | Not supported in any listed version through 27.2 [2] | n/a | No WebXR on iPhone or iPad. `<model>` and Quick Look are Apple's AR route (not studied here) |
| Safari visionOS | Documented session type is `immersive-vr` only; WebXR on for all users since visionOS 2 [6]. An `immersive-ar` flag exists but is reported non-functional (developer guide, unverified [12]) | Yes, with `hand-tracking` and a second consent prompt; hands arrive as tracked-pointer inputs at indices 2-3 after the transient gaze-and-pinch inputs; app must draw hands itself [6][7] | Hand tracking cannot be tested in the simulator |
| Quest Browser (Meta Horizon Browser) | Yes, passthrough (`immersive-ar`) on Quest 3/3S/Pro [8]; page must draw on a transparent background | Yes, 25 joints; palm pinch is reserved by the system [9] | Hit test uses the Depth API since browser 40.4 on Quest 3/3S (UploadVR, via search [13]); depth sensing; `camera-access` reported unsupported on Horizon OS v85 (single user report [16]) |
| Android XR Chrome (headsets, wired glasses) | Yes: Device API, AR Module, Gamepads, Hit Test, Hand Input (default), Anchors, Depth Sensing, Light Estimation [5] | Yes; permission-gated (3D mapping and camera tracking; hand, face and eye data separately) [5] | No Chrome version given on the page. Stereo rendering required |
| Meta Ray-Ban Display | Not WebXR: "web apps" at 600x600, 30 Hz, startup under 300 KB, Neural Band for focus and select, motion/orientation/GPS sensors [15] | n/a | Camera and WebXR not documented |

Caveat on the caniuse numbers: the fetch summarised the "current" column (Chrome Android 156, desktop Chrome 159) and may have dropped earlier Android versions; WebXR AR has been in Chrome for Android since the early 2020s from my own knowledge, not from this fetch.

## 3. MediaPipe Tasks Vision

- npm `@mediapipe/tasks-vision` latest is **1.1.1** (published 2026-10-14, Apache-2.0, 42 MB unpacked including the wasm); nightly `1.2.0-rc.*` builds appear daily up to 2026-10-24 [17]. thoremin's `^0.10.35` will not resolve to 1.x. Upgrading is a deliberate bump to test (model files and `FilesetResolver` wasm base must match the package version; `check:models` exists for that).
- Tasks in the package: face detection, face landmarks (478 points, 52 blendshapes), gesture recognition, hand landmarks, holistic landmarks, image classification, image embedding, image segmentation, interactive segmentation, object detection, pose landmarks (33) [18].
- The old Solutions (Hands, Holistic, Pose, Selfie segmentation) were superseded by Tasks; Google "ended support for the MediaPipe Legacy Solutions as of March 1, 2023" [18]. `@mediapipe/hands` and `@mediapipe/holistic` on npm have not been published since 2023-02-04 [17]. **Verdict: avoid the legacy packages.**
- Holistic Landmarker is a Tasks task with a Web guide: one bundle with pose (33), face (478, 10 iris, optional 52 blendshapes) and hands (21 each) [19]. The page gives no performance numbers, and I could not verify web throughput. Running three separate tasks is what thoremin does today (hands, face, body slices), which also lets each slice load lazily; holistic would only help if a slice wants all three on every frame.
- Hand Landmarker: palm detector 192x192 plus landmark model 224x224, float16, returns handedness, image landmarks and world landmarks. Vendor-published latency on a Pixel 6: **17.1 ms CPU, 12.3 ms GPU** [20]. Desktop and browser numbers are not published; thoremin's own latency instrumentation (`src/latency`) is the right source and I did not re-measure.
- GPU delegate in the browser means WebGL; a 2023 issue reports hangs on 0.10.0 and the worker code already guards for missing WebGL2 [21]. I found no WebGPU delegate in the web task API (no release notes found), so WebGPU does not change this stack today.
- Gesture Recognizer (canned 7 gestures) is not worth adopting: thoremin's `ictus` and feature catalogue cover continuous finger features; study only.

## 4. TensorFlow.js

`@tensorflow/tfjs` latest is 4.22.0 (2024-10-21), with a 4.23.0-rc on the `next` tag; the repo is still receiving pushes (last 2026-06) but the library is in maintenance [17][22]. `@tensorflow-models/hand-pose-detection` 2.0.1 was last published 2023-07 [17]. TFJS offers WebGL, WASM and WebGPU backends, but for hands MediaPipe Tasks is faster and maintained. **Verdict: avoid for new work; keep only as long as the fallback source is wanted; schedule its removal.** For custom models (e.g. a trained gesture classifier) ONNX Runtime Web 1.30.0 (MIT, 2026-09) or Transformers.js 4.3.1 (Apache-2.0) are the living options [17]; neither is needed for landmark input.

## 5. WebGPU for ML inference

caniuse (read 2026-10-25): about 87.8% global support; Chrome desktop 113+, Chrome Android 156, Edge 113+, Safari macOS partial in 26.0 through 27.1 preview, **Safari iOS supported from 26.0**, Samsung Internet 24+, Firefox disabled by default [3]. So WebGPU is now broadly present on phones, including iPhone, where WebXR is absent. For thoremin this matters for (a) future GPU-based mapping or audio-visual shaders and (b) ONNX or Transformers.js models, not for MediaPipe, whose web runtime is WebGL. A WebGPU renderer in three.js is an option but is a rendering choice, not a prerequisite for anything below.

## 6. Rendering and framework layer

Versions and sizes from the npm registry, 2026-10-25; "unpacked" is install size, not what ships after tree-shaking and gzip.

| Library | Version | Licence | Last release | Unpacked | Role | Verdict |
|---|---|---|---|---|---|---|
| three | 0.186.1 | MIT | 2026-09-24 | 20 MB | WebGL/WebGPU 3D engine; what everything below sits on | **depend** (lazy) |
| @react-three/fiber | 9.8.2 | MIT | 2026-10-14 | 2.4 MB | React renderer for three; fits thoremin's React 19 | **depend** (lazy) |
| @react-three/drei | 10.7.9 | MIT | 2026-09-25 | 1.8 MB | Helpers (text, controls, lines) | **depend**, import per-helper only |
| @react-three/xr (+@pmndrs/xr) | 6.6.32 | MIT | 2026-10-13 | 185 kB | WebXR for R3F: hands, controllers, hit test, anchors, DOM overlay, layers [23] | **depend**, in the XR lazy chunk only |
| A-Frame | 1.8.0 | MIT | 2026-06-23 | 39 MB | HTML-tag scene framework on three | **study**; wrong paradigm for a React/DAG app |
| Babylon.js (@babylonjs/core) | 9.32.0 | Apache-2.0 | 2026-10-22 | 73 MB | Full engine with the most complete WebXR feature wrappers (depth, hit test, hand) | **study**; heavier than needed, no reason to run two engines |
| model-viewer | 4.4.0 | Apache-2.0 | 2026-10-09 | 43 MB | `<model-viewer>` for displaying glTF with AR launch | **avoid** here (view-only, not interactive tracking) |
| MindAR | 1.2.5 | MIT | 2024-01-16 | 13 MB | Image and face target tracking on three/A-Frame | **study** (image targets); unmaintained since 2024 |
| AR.js | 3.4.8 | MIT | 2026-03-16 | 17 MB | Marker and location AR | **avoid** (markers not needed) |
| Zappar (@zappar/zappar-threejs) | 4.3.0 | MIT wrapper; vendor platform | 2025-12-16 | 0.2 MB | Commercial WebAR; self-hosting reported Enterprise-only (secondary source) [24] | **avoid** |
| Needle Engine | 6.0.0-alpha.7 | Free only for non-commercial (EULA; Pro €49/user/month) [25] | 2026-10-12 | 92 MB | Unity/Blender to web workflow on three | **avoid** (licence, alpha) |
| 8th Wall engine (8thwall.org) | monorepo; `@8thwall/engine-binary` 1.0.0 | MIT framework without SLAM; binary-only distributed engine [14] | monorepo pushed 2026-10-18 | 31 MB (binary pkg) | Face effects, image targets, sky effects, SLAM via binary | **study**; the surviving WebAR reference implementation |
| @mediapipe/tasks-vision | 1.1.1 | Apache-2.0 | 2026-10-14 | 42 MB (mostly wasm) | The landmark pipeline | **depend** (already) |
| @mediapipe/hands, holistic | 0.4.x / 0.5.x | Apache-2.0 | 2023-02 | n/a | Legacy | **avoid** |
| @tensorflow/tfjs | 4.22.0 | Apache-2.0 | 2024-10 | 147 MB | Legacy ML runtime | **avoid** for new work |

`@react-three/xr` is licensed MIT (its LICENSE file; the npm metadata field says "see LICENSE") [23]. Peer dependencies are `react >=18`, `three *`, `@react-three/fiber >=8`, so it matches thoremin's React 19 [23].

### 8th Wall: what happened

- The hosted platform (login, cloud editor, web Studio) ended on **2026-02-28**; paid subscriptions ended the same day; the project continues at 8thwall.org as a free, open-source toolset [14].
- A **Distributed Engine Binary** was released in January 2026 (binary-only licence; terms not given on the blog page). The **MIT engine framework** (core architecture, Face Effects, Image Targets, Sky Effects) is in the 8thwall GitHub monorepo, published around 2026-03-02 per press [14][26]. **SLAM is not open source** and is only in the binary; VPS, Maps and Hand Tracking are not included at all [14].
- Promised "within about a month" of the post: docs on GitHub, an open-source desktop app, ECS runtime components and an MCP server; I did not verify delivery. One commentary says Niantic is no longer actively developing it [26].
- For thoremin: nothing here replaces MediaPipe hand tracking (it explicitly excludes hand tracking), and world-tracking SLAM is not open. The value is study: how a production engine structures camera, tracking and rendering as swappable modules, a shape close to thoremin's source/feature/output nodes.

## 7. Capability matrix for thoremin

Latency figures: only the Pixel 6 Hand Landmarker numbers are vendor-published [20]; the others are qualitative and marked as such. thoremin's `src/latency` harness should fill the measured column.

| | Laptop webcam | Phone browser | Quest 3 browser | visionOS Safari | Android XR Chrome |
|---|---|---|---|---|---|
| Tracking source | MediaPipe from the camera | MediaPipe from the front camera (getUserMedia); WebXR gives world pose only | Native 25-joint hands via WebXR | Native hand joints via WebXR (VR session) | Native hands (default input) |
| Hands | 2 (MediaPipe 21 pts, world metres) | 2 via MediaPipe, mostly one in a handheld pose | 2, 25 joints, headset-fused | 2, needs second consent | 2 |
| Face / body | Yes (face 478, pose 33) | Yes, front camera | Not exposed to web (no face or body in WebXR core) | No | Face and eye data permission-gated [5], exposure to web not verified |
| Surfaces / anchors | No | Hit test, anchors via ARCore (AR session) | Hit test, anchors, planes | VR only per docs | Hit test, anchors, depth |
| Passthrough AR | No | Camera feed in AR session | Yes | Reported non-functional [12] | Yes |
| Typical latency | Camera 30 fps + inference; 12-17 ms class on a phone GPU [20]; measured in thoremin's harness | Same inference class; thermal throttling expected (inference, not measured) | Device-rate tracking, no model on our side (qualitative; not measured) | Same (qualitative) | Same (qualitative) |
| What thoremin runs | Everything today | Existing path + R3F overlay; no WebXR hands | `webxr-hands` source feeding existing instruments, plus spatial UI | Same, in VR with drawn hands | Same |
| Main risk | None | WebXR AR and MediaPipe both want the camera | Palm pinch is system-reserved; no camera access | AR session unreliable; hands only in VR | Little public detail on versions |

## 8. Recommended stack for thoremin

1. **Keep the MediaPipe pipeline as is** (worker, GPU delegate, `HandsFrame`). Plan one deliberate bump `^0.10.35` to `1.1.x` behind the existing `check:models` and latency harness; do not follow the `1.2.0-rc` nightlies.
2. **Add an R3F overlay as a lazy extension**, not core. thoremin's draw-and-move-objects goal needs a 3D scene of objects driven by hand features. `three` + `@react-three/fiber` + selective `drei` load only when an instrument declares an overlay output, matching `docs/design/lazy-extensions.md`. It reads the same DAG outputs as the `canvas-overlay`, so the 2D canvas overlay stays the default and the R3F overlay is a second implementation of the output slot.
3. **WebXR as a separate lazy path**: a `webxr-hands` source node (plus an `xr-session` host resource) in its own extension, loaded only when `navigator.xr.isSessionSupported('immersive-ar')` (or `immersive-vr` on visionOS) is true and the user taps "Enter XR". It pulls in `@react-three/xr` and shares the R3F scene with step 2. Feature-detect each module (`hand-tracking`, `hit-test`, `anchors`) as an optional feature and degrade.
4. **Do not use WebXR on phones for hands.** Use the existing getUserMedia path; add an R3F overlay and, if wanted, a hit-test-only AR session later for placing a virtual instrument on a table.
5. **Do not adopt** Needle, AR.js, Zappar, TFJS hand models or the legacy MediaPipe packages. Study 8th Wall's open engine and MindAR for module structure and image-target ideas only.
6. **Glasses**: treat Meta Ray-Ban Display as a controller or HUD surface (tiny web app talking to the main session), subject to the 300 KB start budget and 30 Hz display [15]. This is outside the stack above and needs its own spike.

### Mapping WebXR hand joints (25) to MediaPipe landmarks (21)

MediaPipe indices (as in thoremin's `LM`): 0 wrist; 1-4 thumb CMC, MCP, IP, TIP; 5-8 index MCP, PIP, DIP, TIP; 9-12 middle; 13-16 ring; 17-20 pinky. WebXR order is wrist, then thumb (metacarpal, proximal, distal, tip), then for each finger metacarpal, proximal, intermediate, distal, tip [4]. The thumb has no intermediate phalanx in WebXR, so its four joints line up one to one. Each finger has an extra metacarpal joint that MediaPipe does not have; drop it and the rest align.

| MediaPipe | Name | WebXR index | WebXR joint |
|---|---|---|---|
| 0 | WRIST | 0 | wrist |
| 1 | THUMB_CMC | 1 | thumb-metacarpal |
| 2 | THUMB_MCP | 2 | thumb-phalanx-proximal |
| 3 | THUMB_IP | 3 | thumb-phalanx-distal |
| 4 | THUMB_TIP | 4 | thumb-tip |
| 5-8 | INDEX MCP, PIP, DIP, TIP | 6-9 | index-finger proximal, intermediate, distal, tip |
| 9-12 | MIDDLE MCP, PIP, DIP, TIP | 11-14 | middle-finger proximal, intermediate, distal, tip |
| 13-16 | RING MCP, PIP, DIP, TIP | 16-19 | ring-finger proximal, intermediate, distal, tip |
| 17-20 | PINKY MCP, PIP, DIP, TIP | 21-24 | pinky-finger proximal, intermediate, distal, tip |
| (dropped) | none | 5, 10, 15, 20 | finger metacarpals |

Implementation notes for the `webxr-hands` node:

- **Index map as data**: `WEBXR_TO_MP = [0,1,2,3,4,6,7,8,9,11,12,13,14,16,17,18,19,21,22,23,24]`, one constant, used by `fillPoses()` output (16-float matrices; translation is elements 12-14).
- **Coordinates**: `worldKeypoints` expects metres with the origin at the hand's geometric centre; XR gives metres in the chosen reference space, so subtract the mean of the 21 points. `keypoints` expects source-image pixels; emit a normalised projection (for example xy from the viewer-space frame, with `width`/`height` set to 1) or a head-relative planar projection, and make sure no node downstream depends on a real image size. Invariant features (`finger -> thumb` closeness) use only world keypoints, so they carry over; pixel-space instruments (screen-position theremin) need a defined projection plane.
- **Handedness**: take `inputSource.handedness` (left, right) as `Left`/`Right`. Check thoremin's existing mirroring convention, because the webcam path flips the selfie image and a headset does not.
- **Absent joints**: a hand's 25 joints are all valid or all null/NaN [4]; map a null pose to "hand absent", matching `hands: []`. Do not interpolate.
- **Tips**: the spec lets implementations offset tip origins to a skin-touching sphere [4], so fingertip distances differ from MediaPipe by roughly a joint radius; recalibrate pinch thresholds per source.
- **Score**: no confidence is exposed; set 1 when tracked.
- **Timing**: stamp frames from the `XRFrame` callback (headset rate), not the camera clock; this bypasses `frame_pump`, so the node needs its own timing source for the `FrameTiming` fields.
- **visionOS gotcha**: read hands from `inputSources` filtered by `hand`, not by index; they appear at indices 2-3 after the transient inputs [6][7]. On Quest, palm pinch exits the session or opens the system menu, so instruments must not rely on it [9].
- **Test**: reuse the `replay_hands` and synthetic hand sources by recording a WebXR session into the same stream format (`npm run record`), so the DAG tests need no headset.

## 9. Open questions

- Does Android XR Chrome expose face, eye or body data to web pages, and from which version? The docs mention permissions but no web API [5].
- Is raw camera access in Chrome for Android on by default, and is it viable for running MediaPipe on the AR camera frames (my inference: possible, costly GPU readback)? The caniuse data says supported [10].
- Is visionOS `immersive-ar` real? Contradictory secondary sources; needs a device test [12].
- Quest `camera-access`: a single user report says unsupported on Horizon OS v85 [16]; no official statement found.
- Measured latency for MediaPipe 1.1.1 vs 0.10.35 on the target devices.

## REFERENCES

[1] WebXR Device API. MDN Web Docs, read 2026-10-25. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
[2] WebXR Device API support tables. Can I use, read 2026-10-25. [caniuse.com/webxr](https://caniuse.com/webxr)
[3] WebGPU support tables. Can I use, read 2026-10-25. [caniuse.com/webgpu](https://caniuse.com/webgpu)
[4] WebXR Hand Input Module Level 1. W3C Immersive Web Working Group. [w3.org/TR/webxr-hand-input-1](https://www.w3.org/TR/webxr-hand-input-1/)
[5] Develop for the web on Android XR. Android Developers, Google. [developer.android.com/develop/xr/web](https://developer.android.com/develop/xr/web)
[6] Build immersive web experiences with WebXR (WWDC24 session 10066). Apple, 2024. [developer.apple.com](https://developer.apple.com/videos/play/wwdc2024/10066/)
[7] Introducing Natural Input for WebXR in Apple Vision Pro. WebKit blog, 2024. [webkit.org](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/)
[8] Mixed Reality Support in Browser. Meta Horizon developer docs. [developers.meta.com](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)
[9] Hand tracking in WebXR. Meta Horizon developer docs. [developers.meta.com](https://developers.meta.com/horizon/documentation/web/webxr-hands/)
[10] Raw camera access for WebXR. Can I use, read 2026-10-25. [caniuse.com/wf-webxr-camera](https://caniuse.com/wf-webxr-camera)
[11] WebXR Compatible Browsers (2026). threejsresources.com (secondary source). [threejsresources.com](https://threejsresources.com/webxr/browsers)
[12] visionOS 26 Spatial Web Dev: WebXR, model, USDZ. buildmvpfast.com, 2026 (secondary, unverified). [buildmvpfast.com](https://www.buildmvpfast.com/blog/apple-visionos-web-developers-spatial-pwa-2026)
[13] Quest Browser Gets Instant WebXR Hit Testing For Mixed Reality Placement. UploadVR. [uploadvr.com](https://www.uploadvr.com/quest-browser-depth-api-webxr-hit-testing-instant-placement/)
[14] Goodbye 8thwall.com. Hello 8thwall.org. Niantic Spatial blog, 2026. [info.nianticspatial.com](https://info.nianticspatial.com/blog/8th-wall-open-source)
[15] meta-wearables-webapp: toolkit for web apps on Meta Ray-Ban Display glasses. Meta (facebookincubator), GitHub. [github.com](https://github.com/facebookincubator/meta-wearables-webapp)
[16] Request: WebXR raw camera access in Quest Browser. Meta community forums (user report). [communityforums.atmeta.com](https://communityforums.atmeta.com/discussions/Questions_Discussions/request-webxr-raw-camera-access-camera-access-feature-in-quest-browser/1367463)
[17] npm registry metadata for @mediapipe/tasks-vision, @mediapipe/hands, @mediapipe/holistic, @tensorflow/tfjs, @tensorflow-models/hand-pose-detection, three, @react-three/fiber, @react-three/drei, @react-three/xr, aframe, @babylonjs/core, mind-ar, @ar-js-org/ar.js, @zappar/zappar-threejs, @needle-tools/engine, @google/model-viewer, @8thwall/engine-binary, onnxruntime-web, @huggingface/transformers. registry.npmjs.org, read 2026-10-25. [npmjs.com](https://www.npmjs.com/)
[18] MediaPipe Solutions guide (Tasks list; legacy solutions status). Google AI Edge. [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/guide)
[19] Holistic Landmarker. Google AI Edge. [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker)
[20] Hand Landmarker. Google AI Edge (Pixel 6 latency). [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
[21] Hand landmarks detection guide for Web. Google AI Edge. [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
[22] tensorflow/tfjs repository. GitHub, read 2026-10-25. [github.com/tensorflow/tfjs](https://github.com/tensorflow/tfjs)
[23] pmndrs/xr (@react-three/xr). GitHub. [github.com/pmndrs/xr](https://github.com/pmndrs/xr)
[24] Web AR SDK pricing. Banuba blog (secondary; quotes Zappar licensing). [banuba.com](https://www.banuba.com/blog/web-ar-sdk-pricing)
[25] Needle Engine and Needle Cloud legal information (EULA) and pricing. Needle. [needle.tools/eula](https://needle.tools/eula)
[26] Niantic's WebAR Creation Platform "8th Wall" Goes Open Source as Hosted Services Go Offline. Road to VR, 2026. [roadtovr.com](https://roadtovr.com/niantic-webar-platform-8th-wall-open-source/)
