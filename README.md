# Haunted Raven Portrait

A deliberately quiet, full-screen living portrait for Amazon Fire TV/Silk. The raven spends almost all of its time still; independent random schedulers occasionally play one supplied animation and then return to the hero frame.

## Quick start

This repository contains the application but not the licensed artwork, video, or audio. Add the assets listed below first.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Do not open `index.html` directly: serving over HTTP gives browsers more reliable media behavior. Select **Awaken portrait** once after loading to permit clip audio under browser autoplay policies. The portrait continues silently if this is not selected.

## Assets

Create these folders using the names below. The player first tries the en dash `–` names from the supplied asset specification, then automatically retries common ASCII-hyphen and em-dash variants:

```text
assets/backgrounds/hero.png
assets/backgrounds/cemetery-background.png
assets/video/Raven Movement – Blink.mp4
assets/video/Raven Movement – Double Blink.mp4
assets/video/Raven Movement – Flight Away.mp4
assets/video/Raven Movement – Flight Return.mp4
assets/video/Raven Movement – Lightning.mp4
assets/video/Raven Movement – Mausoleum.mp4
assets/video/Raven Movement – Look Left.mp4
assets/video/Raven Movement – Look Viewer.mp4
assets/video/Raven Movement – Preen.mp4
assets/video/Raven Movement – Ruffle.mp4
assets/video/Raven Movement – Small Feather Settle.mp4
assets/video/Raven Movement – Wing Stretch.mp4
```

All stills and clips should share the same framing and aspect ratio so the first/last frames meet `hero.png` without a jump. The raven gesture clips have a flat black background rather than transparency. During playback a small WebGL shader removes that black background and composites the moving raven over `hero.png`; full-scene Lightning remains a normal opaque video. If WebGL is unavailable, the player deliberately falls back to the unkeyed video so movement remains testable rather than silently showing the still.

Encode MP4 as H.264/AAC for broad Silk compatibility. Lightning and any future Mausoleum clip should be 864×480 at 24 fps. The shader also removes the top-left 7% watermark corner from gesture clips, revealing the matching hero artwork beneath. The separate opaque-video corner patch is controlled by `watermarkMask`; disable it when source assets are clean.

Lightning and Mausoleum are opaque environment clips rather than black-keyed gestures. CSS restores Lightning's missing illumination with an irregular multi-flash overlay. Mausoleum gets a warm window light that ignites, flickers, and extinguishes; adjust its percentage bounds with `mausoleumWindow` in `config.js` rather than editing CSS. The sound-bearing Mausoleum render is used only as a separate audio source, configured by `mausoleumSound`, so its lower-quality duplicate picture is never displayed.

Lightning audio does not require another asset: after **Awaken portrait** is selected, Web Audio synthesizes a restrained low thunder roll and starts it at `lightningThunderDelayRatio` of the clip duration, aligned with the strongest CSS flash. To use a sourced/licensed recording later, set `lightningSound` to its path; the same timing and `lightningThunderVolume` are retained. Keeping the default procedural sound avoids shipping an unlicensed sample and avoids another network dependency.

During keyed raven gestures, `hero.png` fades away to reveal `cemetery-background.png` beneath the moving raven. This prevents the baked-in resting raven from ghosting around slightly differently framed animation footage. If a final clip still needs a tiny registration correction, adjust `gestureAlignment` in `config.js`; it moves/scales only the animation canvas.

Flight is one atomic paired event: `NORMAL → FLIGHT AWAY → AWAY → FLIGHT RETURN → NORMAL`. At `flightAwayCleanFrameSeconds`, playback stops on the first known frame after the raven has cleared the scene and the portrait enters a persistent `raven-away` state before the video layer is removed. Only Flight Return may leave that state and reveal `hero.png`; an `!important` away-state guard prevents a transition or cleanup frame from resurrecting the perched raven between clips.

If Lightning works but another clip does not, open debug mode and press that clip's button once. The status line distinguishes **Loaded** (Silk decoded the first frame) from **Playing** (the browser emitted its actual playback event). It also reports missing files, autoplay blocking, stalls, load timeouts, and clips whose playback clock does not advance.

Silk's support is most reliable with H.264 video (`yuv420p`) and AAC audio in an MP4 container. A clip that loads its first frame but does not advance should be re-encoded with:

```bash
ffmpeg -i input.mp4 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k output.mp4
```

## Configuration

Edit the single `CONFIG` object in `config.js`. All replaceable background paths and video filenames live at the top of that object; there are no asset filenames to keep synchronized in the HTML, CSS, or player code. Every behavior has its own randomized min/max range. `longQuietChance` occasionally stretches a scheduled delay, preventing a recognizable rhythm.

### Replacing assets on GitHub Pages

GitHub Pages and Silk may continue displaying a cached file when its filename stays the same. After replacing any PNG or MP4, change `assetVersion` in `config.js` (for example from `2026-08-25-1` to `2026-08-25-2`) in the same commit. The player appends that version to every asset request, forcing the updated file to be fetched without requiring filenames to be changed throughout the project.

After deploying, open `https://YOUR-PAGES-URL/?debug=1`, force one affected clip, and confirm its loading message contains the configured filename and new `?v=` value. Asset paths on GitHub Pages are case-sensitive, including the `.mp4` extension. If the old asset remains temporarily, reload after GitHub Pages finishes publishing the commit; changing `assetVersion` handles browser/CDN asset caching but cannot make an unfinished Pages deployment complete sooner.

### Opening the debug controls

Use any of these methods, then reload if applicable:

1. Open the portrait with `?debug=1` appended, for example `http://localhost:8080/?debug=1`. This is the quickest and most reliable method because it does not depend on an edited file being fresh in Silk's cache.
2. Press **D** on a connected keyboard to show or hide the panel at any time. This choice is remembered when browser storage is available.
3. Set `debug: true` in `config.js` and fully reload the page. In Silk, close/reopen the tab or clear its cached site data if an old configuration persists.

A small **DEBUG** marker at bottom-left confirms that debug mode initialized. The panel appears at top-right. Number keys 1–9 trigger common actions while the panel is visible. Debug controls are neither built nor shown in a normal session unless one of these opt-in methods is used.

The debug panel has eleven actions. **Flight away + return** is one paired action; Flight Return is intentionally not exposed on its own. **Mausoleum + sound** and **Lightning + thunder** automatically use the debug button click as the browser's sound-unlock gesture, so they can be tested without first selecting **Awaken portrait**. On a short Fire TV viewport, the debug panel scrolls rather than dropping the last actions below the screen.

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

Silk may suspend a background tab or reclaim it under memory pressure, and Fire OS may show its screen saver despite page activity. Browser JavaScript cannot override those operating-system policies. If kiosk reliability is inadequate, these same static files can be wrapped in a Fire TV WebView application without redesigning the portrait.

## Reliability and display safety

Timers schedule only their next event and CSS handles atmosphere and 1–3 pixel burn-in drift. Missing clips fail back to the still rather than stopping later schedules. Video is loaded on demand and released after playback. Set `burnInProtection: false` to disable drift; hardware sleep/away scheduling remains recommended because subtle movement cannot guarantee burn-in prevention.

## Debugging and asset replacement

Open `?debug=1` (or use either method above) and use the panel to force each clip or flight sequence. The status line reports missing files. Browser developer tools will show the exact failed asset request. To add a new animation, add its filename to `CLIPS`, optionally add a scheduler entry, and expose a debug button in `app.js`.

Known V1 limitations: no generated substitute for missing artwork, no weather or separate ambient-audio library, no automatic fullscreen (browsers require a gesture), and no smart-home integrations. These are intentional phase boundaries.
