# Meta glasses (and Quest) for thoremin: what exists, what developers can touch, what to try first

Verified as of 2026-10-25. Status labels: SHIPPED (on sale), ANNOUNCED (official, not yet on sale), PREVIEW (usable by developers but gated or not publishable), RUMOURED (press reports only). Much of the 2026 detail below comes from secondary press coverage plus Meta's own blog/FAQ pages; where only secondary sources agree, the text says so.

## In short

- Meta's glasses are phone accessories, not computers. Apps run on the paired phone (native Swift/Kotlin) and talk to the glasses through the **Meta Wearables Device Access Toolkit (DAT)**; DAT 1.0 started rolling out on 2026-09-30 [1][2]. Third-party apps still cannot be published to the public; you can only sideload via Developer Mode and release channels (max 100 testers) [1][3].
- The glasses camera (via DAT) is reachable only from a native phone app, not from a web page. Stream is Bluetooth Classic, resolution/frame rate auto-degrade (frame rates 2/7/15/24/30 fps) and no latency figure is published [4][5]. The DAT 1.0.0 release had HEVC frame-freeze bugs fixed in 1.0.1 (2026-10-09) [6].
- **Meta Ray-Ban Display** ($799 with Neural Band; US, Canada, UK, France, Italy, Germany) has a 600x600 monocular HUD. Its **Web Apps** path (PREVIEW since 2026-05-14) lets a plain HTML/JS page run on the glasses, shared by URL, no store needed [3][7][8]. But Web Apps get no camera, no audio capture, and the Neural Band arrives only as arrow keys + Enter (pinch = select); there is no raw-gesture or raw-EMG API [9][10].
- Quest 3/3S WebXR in the Quest Browser has hand tracking (since 2020-21) and passthrough AR, but **no raw camera access** (a Feb 2026 forum report shows `camera-access` rejected on Quest 3) [11][12][13]. For thoremin that is fine: WebXR hand joints replace the webcam entirely.
- Feasibility ranking for thoremin today: (d) Quest 3 browser + WebXR hands, then (b) HUD on the Display, then (c) Neural Band discrete triggers (same hardware as b), then (a) glasses camera through a native phone bridge (hardest, best story).
- Price of entry: Quest 3S $349.99 (US) for (d); Ray-Ban Meta Gen 2 $379 for (a); Ray-Ban Display $799 for (b)+(c) (+$200 for prescription lenses in the US, per Meta's 2025 retail FAQ) [14][15][16].

## 1. The line-up

| Product | Status | Date / price (US unless noted) | Notes for developers |
|---|---|---|---|
| Ray-Ban Meta (Gen 1) | SHIPPED | Launched Oct 2023 (from my background knowledge, not re-verified); $299 at launch [17] | DAT-supported [2]. Camera, mics, speakers, no display. |
| Ray-Ban Meta (Gen 2) | SHIPPED | 2025-09-17 announcement, on sale same day; from $379, $409 polarized, $459 Transitions [17] | DAT-supported [2]. 12 MP camera. |
| Ray-Ban Meta (Gen 3) | SHIPPED (secondary sources only) | Announced at Connect 2026 (late Sep); $449; about one hour more battery, action button [18][19] | Not in the DAT supported-device list on the FAQ page I read [2][19]; check. |
| Ray-Ban Meta Audio | ANNOUNCED (shipping date 2026-10-13 has passed; not independently confirmed) | $349, no camera [18][19] | Useless for a camera-based thoremin; audio/mic only. |
| Oakley Meta HSTN | SHIPPED | Summer 2025; $399 [17] | DAT-supported [2]. |
| Oakley Meta Vanguard | SHIPPED | Announced 2025-09-17, on sale 2025-10-21; $499 [17] | DAT-supported [2]. Sport-oriented, wide camera. |
| Meta Ray-Ban Display + Meta Neural Band | SHIPPED, staged by country | US from 2025-09-30 at $799 (glasses and band sold together). Canada (CA$1,149) and UK (£749) from 2026-09-23. France, Italy, Germany (EUR 899) preorders 2026-09-23, on sale 2026-10-13. Meta names no further markets [7][19][20] | 600x600 monocular display in the right lens, about 20 degree FOV, 90 Hz panel / 30 Hz content, up to 5,000 nits (secondary specs) [21]. Developer access: Web Apps and DAT display, both PREVIEW [3]. |
| Orion AR prototype | PREVIEW in the loosest sense: internal prototype shown 2024, never for sale | Press (Gurman via UploadVR) said Meta would offer Orion to developers in 2026 and "never" sell it; nothing official found in 2026 [22] | Not obtainable. Treat as irrelevant for now. |
| "Artemis" consumer AR glasses | RUMOURED | Press says 2027; no official statement found [22] | Do not plan around it. |
| Meta VR Glasses (lightweight headset) | ANNOUNCED | Connect 2026: $1,299.99, spring 2027 [18][19] | Not buyable. The codename "Phoenix" is from secondary sources. |
| Muse Charm | ANNOUNCED | Connect 2026; no price or date beyond "later this year" [19] | Irrelevant to thoremin. |
| Quest 3 (512 GB) | SHIPPED | $599.99 after an April 2026 price rise from $499.99 (secondary source) [23] | Full Quest Browser WebXR; native Passthrough Camera API. |
| Quest 3S (128 / 256 GB) | SHIPPED | $349.99 / $449.99 after the same rise (was $299.99 / $399.99) [23] | Same software capabilities for this purpose. |
| Quest 4 | RUMOURED | Meta announced no new Quest hardware at Connect 2026; leaks point to H2 2027 at earliest [19][23] | Ignore. |

Countries matter twice: Display hardware sells only in the six markets above, and DAT "full toolkit features" require being in an "AI glasses supported countries" market even though the SDK can be downloaded anywhere [2].

How you buy a Display, and the conflict in the sources: Meta's own retail FAQ (2025-10-02) said in-store only, with a mandatory in-person demo and fitting booked through Meta's demo scheduler, at Meta Lab, Ray-Ban, LensCrafters, Best Buy and Sunglass Hut stores; walk-ins were not guaranteed; Rx orders (about -4.00 to +4.00 D) cost $200 extra ($999 total) and take five to eight weeks, and Rx cannot be added after purchase [14]. A later (Oct 2026) report says online ordering is now open in the US and the five new markets, with "very limited" inventory and waitlists [20]. I could not load Meta's product page to confirm; check it before travelling to a store.

## 2. What developers can access

### 2.1 Meta Wearables Device Access Toolkit (DAT)

- **Status**: public developer preview opened 2025-12-04 [4]; 1.0 ("stable, supported release", out of preview) began rolling out 2026-09-30 [2]. Open-source SDK repos for iOS and Android [5][24]. Android artifacts are on Maven Central, no token required, 1.0.1 referenced in the README [24].
- **Platforms**: iOS 17.2+ with Xcode 26.4+; Android 10+ with Android Studio Flamingo+ and Kotlin 2.2+ [25]. Third-party Flutter integration guides exist (not verified).
- **Supported glasses** (FAQ): Ray-Ban Meta Gen 1 and Gen 2, Ray-Ban Display, Oakley Meta HSTN, Oakley Meta Vanguard [2][25].
- **Modules** (Android README): core, camera, display, inputs, motion, mockdevice, speech [24]. Features: camera streaming and in-stream photo capture, motion sensors (accelerometer, gyro, magnetometer, orientation), on-device speech recognition, "Hey Meta" voice invocation of your app, Mock Device Kit for hardware-free tests, session lifecycle monitoring [24]. Audio streaming (PCM) and standalone camera capture are marked experimental and not allowed in production publishing [24].
- **Camera**: launch coverage said up to 720p at 30 fps over Bluetooth, with automatic degradation [4]. Meta's iOS docs say resolution/frame rate are constrained by the Bluetooth Classic link and that frame rate options are 2, 7, 15, 24, 30 fps [5]. No official latency number exists. Changelog history shows stream latency regressions fixed in later releases and HEVC buffer corruption in 1.0.0 fixed in 1.0.1 (2026-10-09) [6].
- **What is NOT exposed**: Meta AI (the assistant) and custom voice commands are not available to third-party apps [3][26]. Web pages cannot reach the glasses camera: camera/audio are limited to the native toolkit [9].
- **Publishing**: submissions are not open yet ("soon be able to submit"); planned discovery surfaces are select experiences on the Display and a curated list in the Meta AI app; all apps must follow the Wearables Developer Acceptable Use Policy [2]. Today: Developer Mode, sideloaded/unpublished apps, and invite-only release channels, up to 100 testers [3][25]. Create an account in the Wearables Developer Center to be told when submissions open [2].
- **Setup requirements**: glasses paired in the Meta AI app with minimum firmware (Devices tab, Device settings, General, About, Version); Developer Mode via Meta AI app Settings, App Info, tap the version number five times; registered apps appear under App connections, Developer mode apps; an application ID from the Wearables Developer Center goes in the manifest (`com.meta.wearable.mwdat.APPLICATION_ID`); use of the toolkit requires accepting the Meta Wearables Developer Terms [24][25].

### 2.2 Display glasses and Neural Band

- **Two paths, both PREVIEW since 2026-05-14** [3]: (i) DAT display module (native iOS/Android; text, images, lists, buttons, video playback) and (ii) **Web Apps** (HTML/CSS/JS hosted at a public HTTPS URL; add via URL in Developer Mode, a deeplink or a QR code; password-protectable; no companion phone app needed for the web path) [2][3][7][9]. Needs glasses software v125+ and Meta AI app v272+ per one third-party doc [9].
- **Web App environment** (third-party GlassKit doc, consistent with Meta's FAQ): 600x600 additive display (black is transparent), DeviceMotion/DeviceOrientation, geolocation via the phone, 5 MB local/session storage, no camera or audio capture, no back navigation, no offline mode [9]. Meta's FAQ adds wrist motion from the band as a context signal and a WebMCP developer preview that lets Meta AI call actions you declare [2].
- **Neural Band**: Meta describes it as surface EMG turning finger/hand movement into discrete input events [3][8]. The GlassKit doc reports those arrive as Arrow keys + Enter (pinch = Enter), with no raw gesture API and no custom gestures [9]. A third-party student tool (RawMeta) streams eight raw EMG channels at 2,048 Hz, but it is unofficial [10]. Conclusion: the band is a 4-way pad + select for third parties, not a continuous controller.
- Meta's own wording on the FAQ page for web-app inputs is "Neural Band and captouch for navigation, plus dictation, handwriting, or an on-screen keyboard" [2], which matches the key-event reading but does not spell out event names. Verify on-device.

### 2.3 Quest 3 / 3S

- **Native**: Passthrough Camera API (Android Camera2-based; Horizon OS v74+; usable in Horizon Store apps since v76; users see an opt-in prompt) [11][27]. Meta's launch blog said WebXR support would follow "with v77" [27]; I found no evidence it shipped, and a Feb 2026 forum report on Horizon OS v85 shows `camera-access` rejected for immersive-ar [13]. Interaction SDK and the Presence Platform are native (Unity/Unreal) toolkits; I did not re-verify them for this note and they are not needed for the web route.
- **Web**: Quest Browser supports WebXR AR (passthrough), plane detection and anchors per Meta's docs [12]; hand tracking has been in the browser since 2020-21 and simultaneous hands+controllers since version 31.4 (Feb 2024), per the community-maintained browser table [28]. 2026 browser builds (146.0 on 2026-04-21 onwards) added experimental WebGPU and WebXR depth; none of the notes I saw mention camera access [28][29]. The Meta WebXR mixed-reality page I fetched only covers passthrough, plane detection and anchors, and names Quest 2 and Pro, so it is dated [12].
- **Meaning for thoremin**: you cannot run MediaPipe on the Quest passthrough image from a web page. You do not need to, because WebXR gives you 25 tracked joints per hand directly.

## 3. Alternatives, one table

Status as reported on 2026-10-25; many prices are from secondary sources and some conflict.

| Platform | Status / price | Dev route | Camera / hands for a thoremin-like app | Verdict for thoremin |
|---|---|---|---|---|
| Quest 3 / 3S | SHIPPED, $349.99-$599.99 [23] | WebXR in Quest Browser; native Unity/Unreal | WebXR hand joints yes; raw camera no [12][13] | Best near-term target |
| Meta Ray-Ban Display | SHIPPED, $799, six countries [7][20] | Web Apps (HUD only) or DAT (native) | Camera only via native DAT; band = key events [9] | HUD + triggers only |
| Ray-Ban Meta Gen 2 / Oakley | SHIPPED, $379-$499 [17] | DAT (native) | Camera stream to phone [4][5] | Camera-bridge experiment |
| Apple Vision Pro | SHIPPED, $3,499 at 2024 launch; M5 refresh price not verified [30] | visionOS native; Safari WebXR (my background knowledge, not verified here) | Hand tracking native; camera access is enterprise-restricted (background knowledge) | Too costly; skip |
| Android XR glasses (Google/Samsung) | ANNOUNCED for fall 2026; price unconfirmed (analyst $600-$900, other reports lower); display model reportedly 2027 [31] | Android XR SDK (not verified) | Unknown | Wait |
| Snap Specs | ANNOUNCED/preorder: $2,195 per one report with $200 deposit, US/UK/France fall 2026 [31]; Snap said WebXR browser in Snap OS 2.0 [32] | Lens Studio (TypeScript) or browser WebXR | Hand tracking in Lens Studio (background knowledge) | Interesting for WebXR, but pricey and unverified |
| Xreal (Project Aura) | RUMOURED/unclear: one source quotes $1,279 [33] | Android XR | Unknown | Skip |
| Brilliant Labs Halo | Preorder; price reported as $299, $349 or $399 depending on source; ship date reported as Q4 2025, Q1 2026 or fall 2026 [33] | Open source | Small camera; on-device AI | Hacker curiosity, not a thoremin input |

## 4. What thoremin could realistically do

Thoremin's seam is the typed DAG: input nodes (`webcam-hands`, `synthetic-hands`, `replay-source`) produce landmark streams; `hand-features` and `gesture-classifier` feed mapping, music logic and `webaudio-synth`; `canvas-overlay` draws guides; `midi-out` exists [repo: docs/ARCHITECTURE.md]. Each option below is "a new input node, a new output node, or a lazy extension" (docs/design/lazy-extensions.md, docs/design/instruments-as-graphs-and-extensions.md), not a rewrite.

### Ranking by feasibility now

| Rank | Option | Hardware | Native app? | Effort | Risk |
|---|---|---|---|---|---|
| 1 | (d) Quest 3 browser + WebXR hands | Quest 3S $349.99 | No (web) | Small: one input node | Low; audio autoplay and session start need a user gesture; browser perf |
| 2 | (b) HUD on Display (Web App) | Display $799 | No (web) | Small: static page + live feed | Medium: preview gating, country/stock, 600x600 only |
| 3 | (c) Neural Band triggers | same as (b) | No (web) | Tiny once (b) exists | Medium: only 4-way + select; rate-limited by hardware, not documented |
| 4 | (a) glasses camera to phone bridge | Ray-Ban Meta Gen 2 $379 | **Yes** (Swift/Kotlin) | Large | High: Bluetooth bandwidth/latency, first-person viewpoint, preview publishing limits |

### (d) Quest 3 browser with WebXR hand tracking (rank 1)

- What the player gets: play with both hands in a room, thoremin audio from the headset, optionally passthrough AR (immersive-ar) so overlays sit in the real room; "draw and move objects" works in 3D with pinch detection from joint distances.
- Fit: write an `xr-hands` input node that reads `XRHand` joint poses each frame and emits the same hand-landmark port type as `webcam-hands` (map 25 WebXR joints onto the 21-point layout; wrist and fingertip joints map one-to-one, with a thin adapter for the rest). All downstream nodes (`hand-features`, mapping, synth) stay unchanged. Camera and MediaPipe are not needed, which removes the dominant latency and CPU cost (tracking is done by the headset; typical pose latency is far below a webcam+ML pipeline, my expectation, not measured).
- Cost: new node, XR session lifecycle, a 3D (or at least coordinate-space) normaliser so features such as height/depth map consistently. 2D `canvas-overlay` becomes a WebXR layer or a quad in a three.js/PlayCanvas scene.
- Limits: depends on browser feature flags per Horizon OS version; `camera-access` is unavailable, so no camera-based nodes (face, ASL extension from `thoremin-asl`) in-headset.

### (b) HUD on Ray-Ban Display (rank 2)

- What the player gets: a glanceable note/chord display while playing hands-free (current chord, scale degrees, next chord in a progression). Not a mirror of the full UI.
- Fit: an output-side extension. A tiny static Web App (HTML + one WebSocket or `fetch` poll) served over public HTTPS, rendering a high-contrast 600x600 card from thoremin events (`chord`/`progression` nodes already exist; nodes can tap them). Thoremin runs on a laptop/phone; a small relay publishes `{note, chord, degree}` messages. Hosting on the user's existing thorwhalen.com deployment is a natural place, since the Web App needs a public HTTPS URL [9].
- Cost: very low latency for text (small payloads); the display refreshes content at about 30 Hz [21]. Cannot show the instrument canvas or camera. You must be in Developer Mode and in a supported country.
- Risk: PREVIEW APIs may change; no store publication yet, but URL sharing works [3].

### (c) Neural Band as discrete triggers (rank 3, pairs with b)

- Reality check: third parties see Arrow keys + Enter, not EMG and not custom gestures [9][10]. So the band becomes a footswitch-like controller: next/previous preset, advance chord, start/stop, toggle a layer. It cannot be the continuous "theremin hand".
- Fit: the Web App from (b) listens for `keydown` and forwards `{cmd: "next-chord"}` to thoremin's command dispatch (docs/design/command-dispatch.md). This is the same pattern as the existing keyboard handler, only remote.

### (a) Glasses camera to phone, then into thoremin (rank 4)

- What the player gets: first-person gesture play where your own hands in front of your eyes are the instrument, hands-free, outdoors; the unique "draw in the air" experience.
- Pipeline: glasses camera (Bluetooth Classic, <= 720p and 30 fps, often lower) to a native phone app (DAT) to either (1) MediaPipe Tasks running natively on the phone, sending only landmarks over a local WebSocket to the thoremin web app (small payload, best latency), or (2) JPEG/H.264 frames to the browser where the existing `webcam-hands` MediaPipe runs. Option 1 is preferred; it requires a new `remote-landmarks-source` input node and a native bridge app in Swift or Kotlin.
- Latency budget (my estimate, not measured; no vendor figure exists [4][5]): Bluetooth transport plus decode plus inference plus WebSocket plus the synth gives probably a few hundred milliseconds end to end, which is too slow for playing precise pitches but may be fine for coarse gestures (draw/move objects, chord changes). Measure it first with a timestamped blink or clap test.
- Constraints: first-person viewpoint (hands enter from below the frame, no mirror); the 12 MP camera is ultrawide so hands are small in a 720p frame; native app required (no web route to the glasses camera [9]); cannot publish to the public yet [2][3]; 1.0.0 had stream freezes, so use 1.0.1+ [6].
- Fit: an extension that registers one input node and ships as a lazy extension, with the phone app as a separate repository. The DAG's async-source design (sources run their own loop and cache the latest value) already tolerates a variable frame rate [repo: docs/ARCHITECTURE.md].

## 5. Concrete steps to try them

1. **Cheapest, fastest (d)**: buy a Quest 3S (US $349.99 128 GB, Meta Store, Best Buy, Amazon; prices rose April 2026) or Quest 3 ($599.99) [23]. Put thoremin on an HTTPS URL, open it in the Quest Browser, request an `immersive-ar` session with the `hand-tracking` feature. No developer account is needed for a web page; Developer Mode is not needed either.
2. **HUD and band (b)+(c)**: buy a Meta Ray-Ban Display at $799 (US), CA$1,149, £749 or EUR 899 in a supported market. Check Meta's product page for online ordering; otherwise book a demo through Meta's demo scheduler, which is required for in-store sales, and add prescription lenses at purchase (US +$200) [7][14][20]. Pair with the Meta AI app, update the glasses and app (software v125+, app v272+ per [9]), enable Developer Mode (tap the app version five times), then add your page under Display glasses settings, App connections, Web apps [9][25]. Sign up for the Wearables Developer Center at developer.meta.com/wearables for updates and the (still future) submission window [2][3]. No native app is needed for this path.
3. **Camera bridge (a)**: buy Ray-Ban Meta Gen 2 ($379) or Oakley Meta HSTN ($399) (or reuse the Display, which is DAT-supported) [2][17]. Create a Wearables Developer Center account to get an application ID, install the iOS or Android toolkit (Android: Maven Central; needs Android Studio, Kotlin 2.2; iOS: Xcode 26.4, iOS 17.2+), put the application ID in the app manifest, enable Developer Mode, and start with the Mock Device Kit before touching hardware [24][25]. Pin DAT to 1.0.1 or later [6]. Use a bounded newest-frame queue (drop old frames) to avoid latency creep (third-party advice) [34].
4. **Web versus native summary**: WebXR on Quest = web only. Display HUD and band triggers = web only (Web Apps). Glasses camera, audio capture, voice invocation, and the DAT display module = native phone app only (Swift/Kotlin); Meta AI is not exposed to either path [2][3][9].
5. **Order to try**: (d) this week, (b)+(c) when you can get a Display in a supported country, (a) only when you want to measure latency; start by streaming landmarks, not frames.

## Open questions to verify with hardware

- Exact Neural Band event names and repeat rate in Web Apps (official docs not retrieved; sources conflict on wording).
- Actual DAT camera latency and whether 720p/30 is reachable on the Display glasses.
- Whether Quest Browser exposes any camera path via `getUserMedia` (a forum commenter suggests it may be a separate web feature) [13].
- Ray-Ban Meta Gen 3 inclusion in the DAT supported-device list.

## REFERENCES

[1] Introducing the Meta Wearables Device Access Toolkit. Meta for Developers, 2025. [developers.meta.com](https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/)
[2] Wearables developer FAQ (Device Access Toolkit 1.0, Web Apps, publishing, Meta AI Connectors). Meta for Developers, checked 2026-10-25. [developers.meta.com/wearables/faq](https://developers.meta.com/wearables/faq/)
[3] The wait is over: Build for display glasses starting today. Meta for Developers, 2026-05-14. [developers.meta.com](https://developers.meta.com/blog/build-for-display-glasses/)
[4] Meta's Smart Glasses SDK Is Now Available To Build With, But Not Yet To Ship. UploadVR, 2025-12-04. [uploadvr.com](https://www.uploadvr.com/meta-wearables-device-access-toolkit-public-preview/)
[5] meta-wearables-dat-ios (README and camera docs). Meta (GitHub), 2026. [github.com](https://github.com/facebook/meta-wearables-dat-ios)
[6] Meta's own changelog says its glasses toolkit 1.0 froze camera frames. Mixed News, 2026-10. [mixed-news.com](https://mixed-news.com/en/meta-wearables-device-access-toolkit-1-0-1-hevc-buffer-corruption/); see also the [Android CHANGELOG](https://github.com/facebook/meta-wearables-dat-android/blob/main/CHANGELOG.md).
[7] Meta Ray-Ban Display goes on sale in the UK at GBP 749, with Germany at EUR 899 on October 13. Mixed News, 2026-09. [mixed-news.com](https://mixed-news.com/en/meta-ray-ban-display-uk-749-germany-899-five-markets/)
[8] Meta Just Opened Ray-Ban Display Glasses to Third-Party Developers. VR.org, 2026-05-27. [vr.org](https://vr.org/articles/meta-ray-ban-display-developer-sdk-2026)
[9] How to build a Meta Ray-Ban Display app. GlassKit Docs (third party), 2026. [glasskit.app](https://glasskit.app/docs/build-a-meta-ray-ban-display-app)
[10] A student club turned Meta's Neural Band into an 8-channel, 2048Hz EMG recorder. Mixed News, 2026. [mixed-news.com](https://mixed-news.com/en/rawmeta-meta-neural-band-eight-channel-2048hz-emg-recorder/)
[11] Passthrough Camera API overview. Meta for Developers, 2025-2026. [developers.meta.com](https://developers.meta.com/vr/documentation/spatial-sdk/spatial-sdk-pca-overview/)
[12] Mixed Reality Support in Browser (WebXR). Meta for Developers. [developers.meta.com](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)
[13] Request: WebXR Raw Camera Access (camera-access) feature in Quest Browser. Meta Community Forums, thread with Feb 2026 report. [communityforums.atmeta.com](https://communityforums.atmeta.com/questions-and-discussions-26/request-webxr-raw-camera-access-camera-access-feature-in-quest-browser-177407); spec: [WebXR Raw Camera Access Module](https://immersive-web.github.io/raw-camera-access/)
[14] Meta Ray-Ban Display: How to Buy and Why. Meta, 2025-10-02. [meta.com](https://www.meta.com/blog/meta-ray-ban-display-retail-faq/)
[15] Meta Ray-Ban Display product page. Meta (regional store pages were unavailable in my fetch). [meta.com](https://www.meta.com/ai-glasses/meta-ray-ban-display-glasses-and-neural-band/)
[16] Best Buy and Meta team up to launch immersive in-store experience. Best Buy, 2025. [corporate.bestbuy.com](https://corporate.bestbuy.com/2025/best-buy-and-meta-team-up/)
[17] Meta Reveals Next-Gen Ray-Ban and New Oakley Vanguard Smart Glasses. Road to VR, 2025-09. [roadtovr.com](https://roadtovr.com/meta-smart-glasses-ray-ban-oakley-vanguard-price-release/); and [Engadget Connect 2025 roundup](https://www.engadget.com/wearables/everything-meta-announced-at-connect-2025-second-gen-ray-ban-meta-oakley-meta-vanguard-and-meta-ray-ban-display-100007120.html)
[18] Meta Connect 2026: Everything Announced. VR.org, 2026-09. [vr.org](https://vr.org/meta-connect-2026)
[19] Everything We Announced at Meta Connect 2026. Meta, 2026-09. [meta.com](https://www.meta.com/blog/meta-connect-2026-everything-we-announced/)
[20] Meta Ray-Ban Display coverage: Three Tiers of Meta Glasses, and a Wearables Toolkit That Still Cannot Publish to the Public. VR.org, 2026-09. [vr.org](https://vr.org/articles/meta-glasses-three-tiers-wearables-toolkit-publishing-connect-2026)
[21] Meta Ray-Ban Display specs (600x600, 20 degrees, 5,000 nits). Secondary: [Road to VR](https://roadtovr.com/meta-ray-ban-smart-glasses-display-price-release-date-specs/) and [iDevice](https://idevice.com/smart-glasses/ray-ban-display/roadmap).
[22] Meta Could "Offer" Orion AR Glasses To Developers Next Year. UploadVR (reporting Bloomberg). [uploadvr.com](https://www.uploadvr.com/meta-to-reportedly-offer-orion-ar-glasses-to-developers-2026/); and [Tom's Guide on 2027 AR glasses](https://tomsguide.com/computing/vr-ar/no-not-orion-metas-first-real-ar-glasses-tipped-to-debut-in-2027)
[23] Meta Quest price rise April 2026 and Quest 4 status. Secondary: [VR.org Quest 4](https://vr.org/meta-quest-4), [USA Daily Report](https://usadailyreport.com/guides/meta-increases-quest-3-and-quest-3s-prices-in-2026). Not verified on Meta's own store.
[24] meta-wearables-dat-android (README, modules, publishing restrictions). Meta (GitHub), 2026. [github.com](https://github.com/facebook/meta-wearables-dat-android)
[25] Wearables Developer Center: Device Access Toolkit docs (platform requirements, supported glasses, Developer Mode). Meta, 2026. [wearables.developer.meta.com](https://wearables.developer.meta.com/docs/develop/dat)
[26] Meta's Wearables Developer Center just gave Your App Eyes. Now What? Nervegna (Substack), 2025-12. [substack.com](https://nervegna.substack.com/p/metas-wearables-developer-center)
[27] Explore a New Era of Mixed Reality with the Passthrough Camera API. Meta for Developers, 2025. [developers.meta.com](https://developers.meta.com/vr/blog/new-era-mixed-reality-passthrough-camera-api-machine-learning-computer-vision/)
[28] Meta Quest Browser (version history). Wikipedia, accessed 2026-10-25. [wikipedia.org](https://en.wikipedia.org/wiki/Meta_Quest_Browser)
[29] Meta Horizon release notes (Browser). Meta for Developers. [developers.meta.com](https://latest.developers.meta.com/vr/release-notes/?search_key=browser)
[30] Apple Vision Pro. Wikipedia, accessed 2026-10-25. [wikipedia.org](https://en.wikipedia.org/wiki/Apple_Vision_Pro)
[31] Samsung Galaxy Glasses and Snap Specs coverage. [Smartprix](https://www.smartprix.com/bytes/samsung-galaxy-glasses-release-date-price-android-xr-features-specs-everything-else-we-know/); [VR.org on Snap Specs](https://vr.org/articles/snap-specs-true-ar-2500-fall-2026-beats-android-xr). Prices unverified.
[32] Lens Fest 2025: Building the Next Decade of AR Together. Snap, 2025. [newsroom.snap.com](https://newsroom.snap.com/lens-fest-2025)
[33] Brilliant Labs Halo: [Road to VR](https://roadtovr.com/brilliant-labs-halo-smart-glasses-price-release-date/) and [Best Smart Glasses 2026 roundup (Xreal Aura mention)](https://treeview.studio/blog/best-smart-glasses). Conflicting prices; low confidence.
[34] Reducing Camera Streaming Latency with Kotlin and Meta Wearables. DEV Community (third party). [dev.to](https://dev.to/vmodal_ai/reducing-camera-streaming-latency-with-kotlin-and-meta-wearables-266l)
