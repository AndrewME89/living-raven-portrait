# Haunted Raven Portrait

A deliberately quiet, full-screen living portrait for Amazon Fire TV/Silk. The raven spends almost all of its time paused on the opening frame of its next video; independent random schedulers occasionally play that already-visible clip.

## Quick start

This repository contains the application but not the licensed artwork, video, or audio. Add the assets listed below first.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Do not open `index.html` directly: serving over HTTP gives browsers more reliable media behavior. Select **Awaken portrait** once after loading to permit clip audio under browser autoplay policies and request a screen wake lock. The portrait continues silently if this is not selected.

Screen wake lock is available only in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): use HTTPS for the deployed portrait (browsers generally treat `localhost` as trustworthy for local development). The explicit **Awaken portrait** click—or Enter key press—provides the user gesture for both audio and wake-lock acquisition. When the page becomes visible again after switching away, it automatically requests a replacement because browsers normally release wake locks while a document is hidden. If Silk does not provide the Screen Wake Lock API or rejects a request, the portrait logs the condition and continues playback normally.

## Assets

Create the video folder using these exact, case-sensitive filenames:

```text
assets/video/Adjust.mp4
assets/video/Away.mp4
assets/video/Blink.mp4
assets/video/DoubleBlink.mp4
assets/video/Lightning.mp4
assets/video/LookLeft.mp4
assets/video/LookViewer.mp4
assets/video/Mausoleum.mp4
assets/video/Preen.mp4
assets/video/Return.mp4
assets/video/Ruffle.mp4
assets/video/Settle.mp4
assets/video/Stretch.mp4
```

Every clip is displayed directly by its video element, with no still image, background image, shader, chroma key, pixel removal, canvas copy, or colour adjustment. A small repeating monochrome texture is deliberately composited above the finished portrait to approximate GIMP's **Apply Canvas** filter at Depth 3; it is a decorative CSS layer, not an HTML canvas or a copy of the video frame.

The video plane deliberately avoids ancestor transforms, animated burn-in drift, opacity-based slot switching, filters, and blend modes. The one intentional exception is the static canvas-weave overlay: an 8×8 grayscale SVG tile repeats at low opacity using ordinary alpha compositing. The text-based asset stays small, rasterizes to only 64 pixels, and has no animation, event handling, filter, or blend mode, keeping its decoded memory and compositing cost small. The overlay sits above the video slots, sound gate, and debug panel so it remains continuous through slot swaps and every UI state, including fullscreen. These effects can still force hardware-decoded video through an extra GPU compositing path on Silk and other embedded Chromium browsers, producing block-shaped corruption even when the source file is intact. Slots switch with `visibility`, and the inactive slot releases its media source immediately after every swap so only one decoder remains allocated during playback.

Before deploying unattended, run prolonged playback on the target Fire TV/Silk device with the overlay enabled. Exercise fullscreen, both video slots, the sound gate, and debug mode, and watch especially for rectangular or block-shaped corruption during clip transitions. If corruption appears, do not add `mix-blend-mode` or further runtime effects: bake the same canvas treatment into every source video, remove the `.portrait::after` overlay, and retest the complete clip set. Desktop-browser testing cannot validate the Fire TV hardware-decoding path.

Encode MP4 as H.264/AAC for broad Silk compatibility. Lightning and any future Mausoleum clip should be 864×480 at 24 fps.

Lightning and Mausoleum are played as complete, opaque video frames without clip-specific CSS visual treatment; they receive only the shared canvas-weave layer. The sound-bearing Mausoleum render is used only as a separate audio source, configured by `mausoleumSound`, so its lower-quality duplicate picture is never displayed.

Lightning audio does not require another asset: after **Awaken portrait** is selected, Web Audio synthesizes a restrained low thunder roll and starts it at `lightningThunderDelayRatio` of the clip duration. To use a sourced/licensed recording later, set `lightningSound` to its path; the same timing and `lightningThunderVolume` are retained. Keeping the default procedural sound avoids shipping an unlicensed sample and avoids another network dependency.

There is no still-image path, including during initial loading or after an error. Two video elements provide a handoff buffer: the next clip is loaded in the hidden slot, sought to `0.001`, and paused only after `seeked` confirms its first frame is decoded. The slots then swap, the old slot is unloaded immediately, and the upcoming clip's own first frame becomes the idle portrait. When its independent random deadline arrives, that exact video element starts playing—there is no still-to-video boundary, image fallback, black source-loading flash, or second decoder retained during playback. If loading fails, the player clears both video sources and retries without substituting any PNG.

Flight is a locked pair: `FLIGHT AWAY → paused first frame of FLIGHT RETURN → wait → FLIGHT RETURN`. No perched gesture can be selected while away, and only the completed return re-enters the normal scheduling queue. Flight Away pauses at `flightAwayCleanFrameSeconds`, using `requestVideoFrameCallback` where available and `timeupdate` as a compatibility fallback. This holds the first clean empty frame instead of exposing unwanted encoded tail frames while the hidden slot prepares Flight Return.

If Lightning works but another clip does not, open debug mode and press that clip's button once. The status line distinguishes **Loaded** (Silk decoded the first frame) from **Playing** (the browser emitted its actual playback event). It also reports missing files, autoplay blocking, stalls, load timeouts, and clips whose playback clock does not advance.

Silk's support is most reliable with H.264 video (`yuv420p`) and AAC audio in an MP4 container. A clip that loads its first frame but does not advance should be re-encoded with:

```bash
ffmpeg -i input.mp4 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k output.mp4
```

## Configuration

Edit the single `CONFIG` object in `config.js`. All replaceable background paths and video filenames live at the top of that object; there are no asset filenames to keep synchronized in the HTML, CSS, or player code. Every behavior has its own randomized min/max range. `longQuietChance` occasionally stretches a scheduled delay, preventing a recognizable rhythm.

### Replacing assets on GitHub Pages

GitHub Pages and Silk may continue displaying a cached file when its filename stays the same. After replacing any MP4 or audio asset, change `assetVersion` in `config.js` (for example from `2026-08-25-1` to `2026-08-25-2`) in the same commit. The player appends that version to every asset request, forcing the updated file to be fetched without requiring filenames to be changed throughout the project.

After deploying, open `https://YOUR-PAGES-URL/?debug=1`, force one affected clip, and confirm its loading message contains the configured filename and new `?v=` value. Asset paths on GitHub Pages are case-sensitive, including the `.mp4` extension. If the old asset remains temporarily, reload after GitHub Pages finishes publishing the commit; changing `assetVersion` handles browser/CDN asset caching but cannot make an unfinished Pages deployment complete sooner.

### Opening the debug controls

Use any of these methods, then reload if applicable:

1. Open the portrait with `?debug=1` appended, for example `http://localhost:8080/?debug=1`. This is the quickest and most reliable method because it does not depend on an edited file being fresh in Silk's cache.
2. Press **D** on a connected keyboard to show or hide the panel at any time. This choice is remembered when browser storage is available.
3. Set `debug: true` in `config.js` and fully reload the page. In Silk, close/reopen the tab or clear its cached site data if an old configuration persists.

A small **DEBUG** marker at bottom-left confirms that debug mode initialized. The panel appears at top-right. Number keys 1–9 trigger common actions while the panel is visible. Debug controls are neither built nor shown in a normal session unless one of these opt-in methods is used.

The debug panel has twelve actions, including **Adjust**. **Flight away + return** is one paired action; Flight Return is intentionally not exposed on its own. **Mausoleum + sound** and **Lightning + thunder** automatically use the debug button click as the browser's sound-unlock gesture, so they can be tested without first selecting **Awaken portrait**. On a short Fire TV viewport, the debug panel scrolls rather than dropping the last actions below the screen.

The public integration seam is `window.HauntedPortrait`:

```js
HauntedPortrait.setState('IDLE'); // ACTIVE, IDLE, SLEEP, or AWAY
HauntedPortrait.trigger('settle');
```

State changes also emit a `portraitstatechange` browser event. Version 1 does not connect to weather, occupancy, Home Assistant, or a backend.

## Fire TV / Amazon Silk

1. Serve the folder from any static HTTPS host or a computer on the same network for testing.
2. In Silk, open the URL, select **Awaken portrait**, then use Silk's full-screen option.
3. In Fire TV **Preferences**, choose screen-saver and sleep settings appropriate for a continuously powered display. Menu names vary by Fire OS release.
4. Disable Silk data-saving modes if they interfere with local media. Test HDMI audio at the deliberately low default volume.
5. For unattended use, configure the display's own sleep schedule and periodically confirm Silk remains foregrounded.

The portrait requests a screen wake lock after **Awaken portrait** and reacquires it when the page returns to the foreground. Validate the deployment on the target Fire Stick by leaving it idle longer than the configured system timeout, switching away from Silk and returning, and repeating the idle test after restarting Silk.

Silk may suspend a background tab or reclaim it under memory pressure, and Fire OS device-level sleep or screen-saver settings may take precedence over a browser wake lock. Browser JavaScript cannot override those operating-system policies. If kiosk reliability is inadequate, these same static files can be wrapped in a Fire TV WebView application without redesigning the portrait. Only consider a locally vendored fallback after target-device testing shows the native API is unavailable or ineffective. In particular, do not adopt a hidden-video workaround without proving that it uses no competing decoder, does not corrupt the visible MP4 or interrupt audio, and complies with autoplay restrictions.

## Reliability and display safety

Timers schedule only their next event. Missing clips clear the player and retry rather than substituting a still, and inactive video sources are released after every handoff. Hardware sleep/away scheduling remains recommended for burn-in prevention.

## Debugging and asset replacement

Open `?debug=1` (or use either method above) and use the panel to force each clip or flight sequence. The status line reports missing files. Browser developer tools will show the exact failed asset request. To add a new animation, add its filename to `CLIPS`, optionally add a scheduler entry, and expose a debug button in `app.js`.

Known V1 limitations: no generated substitute for missing artwork, no weather or separate ambient-audio library, no automatic fullscreen (browsers require a gesture), and no smart-home integrations. These are intentional phase boundaries.
