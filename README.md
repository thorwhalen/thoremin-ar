# thoremin-ar

Augmented reality for [thoremin](https://github.com/thorwhalen/thoremin): drawing and moving virtual objects with the hands through a plain camera, the browser AR stack (WebXR, MediaPipe, three.js), and smart glasses (Meta's line-up) as thoremin inputs and displays.

Right now this is a **research lane**: the documents in [`docs/research/`](docs/research/) map the vocabulary, the methods, the libraries and the hardware, always tied back to what a thoremin player could do with them. Start with [`00-what-we-have.md`](docs/research/00-what-we-have.md) (what thoremin already does that is AR-adjacent) and [`99-recommendations.md`](docs/research/99-recommendations.md) (ranked next steps).

If a prototype earns its place, it will ship the way [thoremin-asl](https://github.com/thorwhalen/thoremin-asl) does: a **lazy plugin** that thoremin names in its `extensions.json` and fetches only when a player picks an AR instrument (see thoremin's [`docs/design/lazy-extensions.md`](https://github.com/thorwhalen/thoremin/blob/main/docs/design/lazy-extensions.md)).
