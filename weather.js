/**
 * Weather module (Version 2).
 *
 * Inert by default: it only starts polling once CONFIG.latitude/longitude
 * are set to real numbers. Until then, boot() logs a note and returns —
 * the portrait runs exactly like Version 1.
 *
 * Uses Open-Meteo (https://open-meteo.com) — free, no API key required.
 * On any failure, the last known-good state is kept and applied instead
 * of crashing or clearing the visuals; if there has never been a
 * successful fetch, the portrait simply stays in its neutral default look.
 */

(function () {
  'use strict';

  let lastGoodState = null;
  let pollTimer = null;

  function weatherCodeToKind(code) {
    // Open-Meteo WMO weather codes: https://open-meteo.com/en/docs
    if ([95, 96, 99].includes(code)) return 'thunderstorm';
    if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([45, 48].includes(code)) return 'fog';
    return 'clear';
  }

  function rainIntensityFor(kind, code) {
    if (kind === 'drizzle') return 0.25;
    if (kind === 'rain') return code >= 80 ? 0.55 : (code >= 63 ? 0.6 : 0.35);
    if (kind === 'thunderstorm') return 0.75;
    return 0;
  }

  async function fetchWeather() {
    const { latitude, longitude } = CONFIG;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,is_day,precipitation,weathercode,cloudcover,windspeed_10m`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
    const data = await res.json();
    return data.current;
  }

  function applyState(current) {
    const kind = weatherCodeToKind(current.weathercode);
    const rain = rainIntensityFor(kind, current.weathercode);
    const fog = kind === 'fog' ? 0.7 : (current.cloudcover > 90 && Math.random() < 0.15 ? 0.3 : 0);
    const overcast = clamp01(current.cloudcover / 100);
    const isNight = current.is_day === 0;
    const windy = current.windspeed_10m > 30; // km/h

    window.RavenPortrait.setRain(rain);
    window.RavenPortrait.setFog(fog);
    window.RavenPortrait.setOvercast(overcast * 0.7);
    window.RavenPortrait.setNight(isNight);

    if (kind === 'thunderstorm' && CONFIG.lightningEnabled) {
      Storm.ensureRunning();
    } else {
      Storm.stop();
    }

    // Wind subtly raises ruffle likelihood — handled by nudging CONFIG at
    // runtime rather than rewriting the scheduler.
    CONFIG.ruffleMinMinutes = windy ? 2.5 : 4;
    CONFIG.ruffleMaxMinutes = windy ? 12 : 20;

    window.RavenPortrait.log('weather applied:', kind, { rain, fog, overcast, isNight, windy });
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // Minimal self-contained storm loop reuse (kept separate from debug's
  // storm toggle in app.js so weather-driven and debug-driven storms
  // don't fight each other).
  const Storm = (function () {
    let active = false;
    let timer = null;
    function loop() {
      if (!active) return;
      timer = setTimeout(() => {
        if (!active) return;
        window.RavenPortrait.triggerLightning(Math.random() < 0.3 ? 'strong' : 'weak');
        loop();
      }, 4000 + Math.random() * 41000);
    }
    return {
      ensureRunning() { if (active) return; active = true; loop(); },
      stop() { active = false; if (timer) clearTimeout(timer); }
    };
  })();

  async function poll() {
    try {
      const current = await fetchWeather();
      lastGoodState = current;
      applyState(current);
    } catch (err) {
      if (lastGoodState) {
        window.RavenPortrait.log('weather fetch failed, keeping last known state:', err.message);
        applyState(lastGoodState);
      } else {
        window.RavenPortrait.log('weather fetch failed, no prior state, staying neutral:', err.message);
      }
    }
  }

  function init() {
    if (CONFIG.latitude == null || CONFIG.longitude == null) {
      window.RavenPortrait?.log?.('weather module idle — set CONFIG.latitude/longitude to enable');
      return;
    }
    poll();
    pollTimer = setInterval(poll, CONFIG.weatherUpdateMinutes * 60 * 1000);
  }

  window.Weather = { init };
})();
