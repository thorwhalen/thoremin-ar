# thoremin-ar

Augmented reality for [thoremin](https://github.com/thorwhalen/thoremin): drawing and moving virtual objects with the hands through a plain camera, the browser AR stack (WebXR, MediaPipe, three.js), and smart glasses (Meta's line-up) as thoremin inputs and displays.

**Drawn Pieces**, the first instrument: pinch and draw a shape in the air; a closed shape becomes a 3-D drum on the video, an open one a string. Press `D` to play: tap a drum (centre and rim sound different), rest a finger on it to hold a note, swipe across a string to pluck it. Each piece has three dials: **Shape** (freeform to a perfect circle, rectangle, triangle, line or arc), **Feel** (from every stroke the same to every nuance heard) and **Tone** (dark to bright). Bigger pieces sound lower, in the instrument's scale. The design is [`docs/design/drawn-pieces.md`](docs/design/drawn-pieces.md).

It is a **lazy plugin** (`@thoremin/ext-draw`): thoremin ships only its stub (about 3 kB: the dial, the branch as data, the instrument, the `D` key) and fetches the rest (the nodes, the geometry and three.js for the 3-D render) the first time a player picks Drawn Pieces.

The research behind it: the documents in [`docs/research/`](docs/research/) map the vocabulary, the methods, the libraries and the hardware, always tied back to what a thoremin player could do with them. Start with [`00-what-we-have.md`](docs/research/00-what-we-have.md) (what thoremin already does that is AR-adjacent) and [`99-recommendations.md`](docs/research/99-recommendations.md) (ranked next steps).

It ships the way [thoremin-asl](https://github.com/thorwhalen/thoremin-asl) does: thoremin names it in its `extensions.json` and pins it by commit (see thoremin's [`docs/design/lazy-extensions.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/lazy-extensions.md)).

## What is where

| | |
|---|---|
| `src/index.ts`, `src/ui.tsx` | The EAGER stubs: the manifest without nodes, the editor section as data, the `D` key. |
| `src/lazy.ts`, `src/lazy_ui.tsx` | The DEFERRED halves: the nodes and the overlay element; the panel, the status hook and the 3-D renderer. |
| `src/schema.ts`, `src/dials.ts` | The `drawnPieces` dial: the scene (every piece), the mode, volume, the hit threshold. |
| `src/lib/` | Pure logic: geometry, the Shape dial (`shapes.ts`), the pinch (`pinch.ts`), hit / touch / pluck detection (`contact.ts`), Feel and Tone (`feel.ts`), the voices (`voice.ts`), the renderer seam (`render_slot.ts`). |
| `src/nodes/` | `drawn-hands` (drawing, moving, striking), `drawn-voice` (the sound), the overlay element. |
| `src/render/gl_pieces.ts` | The three.js renderer, installed by the lazy UI half. |
| `test/` | Run inside thoremin's suite (see below). |

## Developing and testing

Like thoremin-asl, this plugin is tested inside a real thoremin: CI checks out thoremin, puts this commit in place of the pinned package, copies `test/` into thoremin's suite as `test/ext-draw/`, and runs thoremin's typecheck, whole suite, build and lazy-bundle check (`.github/workflows/ci.yml`). Locally, copy `package.json` and `src` into a thoremin checkout's `node_modules/@thoremin/ext-draw/` and `test/` into its `test/ext-draw/`, then run its gates.
