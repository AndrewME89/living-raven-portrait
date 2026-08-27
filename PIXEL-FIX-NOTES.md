# Pixel corruption fix

The current repository still contained the WebGL luminance-key compositor in `app.js`. Every MP4 in `assets/video/` is an opaque, full-scene H.264 video (`yuv420p`), so keying dark pixels was incorrect. The fragment shader made near-black raven pixels transparent, exposing the layer underneath. Because the configured `hero.png` and `cemetery-background.png` are absent from this repository, the exposed layer was the greenish CSS fallback artwork, which is why the corruption appeared as dark/green holes and shadows in moving feathers.

This patch:

- removes both video canvases;
- removes WebGL/shader/compositor code;
- renders every clip directly as an opaque `<video>`;
- places active video above decorative scene layers so the MP4 pixels are not altered by grain/patch overlays;
- removes the obsolete CSS lightning/mausoleum visual overlays (their generated MP4s already contain those visuals);
- retains environment audio logic;
- bumps CSS/JS/asset cache versions to `2026-08-28-pixelfix1` so browsers do not keep executing the old compositor after deployment.

No video assets were modified.
