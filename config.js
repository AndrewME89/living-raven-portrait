/* The only file most installations need to edit. Times are deliberately broad. */
var CONFIG = Object.freeze({
  /* Bump this value whenever replacing an asset without changing its filename. */
  assetVersion: '2026-08-25-3',
  heroImage: 'assets/backgrounds/hero.png',
  cemeteryImage: 'assets/backgrounds/cemetery-background.png',
  videoRoot: 'assets/video/',
  videoFiles: Object.freeze({
    blink: 'Raven Movement – Blink.mp4',
    doubleBlink: 'Raven Movement – Double Blink.mp4',
    flightAway: 'Raven Movement – Flight Away.mp4',
    flightReturn: 'Raven Movement – Flight Return.mp4',
    lightning: 'Raven Movement – Lightning.mp4',
    mausoleum: 'Raven Movement – Mausoleum.mp4',
    lookLeft: 'Raven Movement – Look Left.mp4',
    lookViewer: 'Raven Movement – Look Viewer.mp4',
    preen: 'Raven Movement – Preen.mp4',
    ruffle: 'Raven Movement – Ruffle.mp4',
    settle: 'Raven Movement – Small Feather Settle.mp4',
    wingStretch: 'Raven Movement – Wing Stretch.mp4'
  }),
  mausoleumSound: 'assets/audio/Raven Movement – Mausoleum.mp4',
  /* Optional licensed thunder file. Null uses the built-in Web Audio thunder. */
  lightningSound: null,
  lightningThunderDelayRatio: 0.16,
  lightningThunderVolume: 0.16,
  /* Fine alignment for keyed gesture footage relative to the cemetery. */
  gestureAlignment: Object.freeze({ scale: 1, xPixels: 0, yPixels: 0 }),
  /* Percentage bounds of the mausoleum window: adjust here, not in CSS. */
  mausoleumWindow: Object.freeze({ left: 61, top: 35, width: 7, height: 12 }),
  blinkMinSeconds: 20,
  blinkMaxSeconds: 120,
  doubleBlinkChance: 0.12,
  ruffleMinMinutes: 4,
  ruffleMaxMinutes: 20,
  settleMinMinutes: 3,
  settleMaxMinutes: 14,
  preenMinMinutes: 15,
  preenMaxMinutes: 45,
  wingStretchMinMinutes: 30,
  wingStretchMaxMinutes: 60,
  headMoveMinMinutes: 10,
  headMoveMaxMinutes: 40,
  flightAwayMinHours: 2,
  flightAwayMaxHours: 4,
  flightReturnMinSeconds: 30,
  flightReturnMaxSeconds: 180,
  longQuietChance: 0.12,
  longQuietMultiplier: 1.8,
  videoVolume: 0.22,
  burnInProtection: true,
  watermarkMask: true,
  debug: false
});
