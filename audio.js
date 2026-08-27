/**
 * Audio module (Version 3).
 *
 * Inert unless CONFIG.audioEnabled is true. Drop mp3s into assets/audio/
 * matching the manifest below (or edit the manifest) and flip the flag —
 * no other code changes needed.
 *
 * Timing follows the same "never learnable" principle as the raven
 * behaviour scheduler: a fresh random delay every time, with an
 * occasional much longer silent stretch.
 */

(function () {
  'use strict';

  // value = filename in assets/audio/, weight = relative likelihood.
  // Distant/soft sounds should heavily outweigh close/intense ones.
  const SAMPLE_MANIFEST = [
    { file: 'caw-distant-01.mp3', weight: 10 },
    { file: 'caw-distant-02.mp3', weight: 10 },
    { file: 'caw-double-01.mp3', weight: 4 },
    { file: 'croak-01.mp3', weight: 3 },
    { file: 'wings-01.mp3', weight: 3 },
    { file: 'wind-01.mp3', weight: 2 }
  ];

  let available = [];
  let timer = null;

  function pickWeighted(entries) {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) {
      if (r < e.weight) return e.value;
      r -= e.weight;
    }
    return entries[entries.length - 1].value;
  }

  async function probe(file) {
    return new Promise((resolve) => {
      const a = new Audio();
      a.oncanplaythrough = () => resolve(file);
      a.onerror = () => resolve(null);
      a.src = `assets/audio/${file}`;
    });
  }

  function playRandomSample() {
    if (!available.length) return;
    const file = pickWeighted(available.map(f => {
      const entry = SAMPLE_MANIFEST.find(m => m.file === f);
      return { value: f, weight: entry ? entry.weight : 1 };
    }));
    const state = window.RavenPortrait?.getPortraitState?.();
    if (state === 'SLEEP') return; // raven doesn't call while asleep

    const audio = new Audio(`assets/audio/${file}`);
    audio.volume = CONFIG.audioVolume;
    audio.play().catch(() => {}); // autoplay restrictions: fail silently
    window.RavenPortrait?.log?.('audio:', file);
  }

  function scheduleNext() {
    let delayMin = CONFIG.audioMinMinutes;
    let delayMax = CONFIG.audioMaxMinutes;
    let delay = (delayMin + Math.random() * (delayMax - delayMin)) * 60 * 1000;
    if (Math.random() < CONFIG.longSilenceChance) {
      delay += (15 + Math.random() * 30) * 60 * 1000; // add 15-45 extra minutes
    }
    timer = setTimeout(() => {
      playRandomSample();
      scheduleNext();
    }, delay);
  }

  async function init() {
    if (!CONFIG.audioEnabled) {
      window.RavenPortrait?.log?.('audio module idle — CONFIG.audioEnabled is false');
      return;
    }
    const results = await Promise.all(SAMPLE_MANIFEST.map(m => probe(m.file)));
    available = results.filter(Boolean);
    if (!available.length) {
      window.RavenPortrait?.log?.('audio enabled but no samples found in assets/audio/ — staying silent');
      return;
    }
    window.RavenPortrait?.log?.(`audio ready, ${available.length} sample(s) available`);
    scheduleNext();
  }

  function stop() {
    if (timer) clearTimeout(timer);
  }

  window.RavenAudio = { init, stop, playRandomSample };
})();
