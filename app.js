(function () {
  'use strict';

  var VIDEO_ROOT = 'assets/video/';
  var CLIPS = {
    blink: 'Raven Animation – Blink.mp4',
    doubleBlink: 'Raven Animation – Double Blink.mp4',
    flightAway: 'Raven Animation – Flight Away.mp4',
    flightReturn: 'Raven Animation – Flight Return.mp4',
    lightning: 'Raven Animation – Lightning.mp4',
    lookLeft: 'Raven Animation – Look Left.mp4',
    lookViewer: 'Raven Animation – Look Viewer.mp4',
    preen: 'Raven Animation – Preen.mp4',
    ruffle: 'Raven Animation – Ruffle.mp4',
    settle: 'Raven Animation – Small Feather Settle.mp4',
    wingStretch: 'Raven Animation – Wing Stretch.mp4'
  };
  var SCHEDULES = [
    { name: 'blink', unit: 1000, min: 'blinkMinSeconds', max: 'blinkMaxSeconds' },
    { name: 'ruffle', unit: 60000, min: 'ruffleMinMinutes', max: 'ruffleMaxMinutes' },
    { name: 'settle', unit: 60000, min: 'settleMinMinutes', max: 'settleMaxMinutes' },
    { name: 'preen', unit: 60000, min: 'preenMinMinutes', max: 'preenMaxMinutes' },
    { name: 'wingStretch', unit: 60000, min: 'wingStretchMinMinutes', max: 'wingStretchMaxMinutes' },
    { name: 'gaze', unit: 60000, min: 'headMoveMinMinutes', max: 'headMoveMaxMinutes' },
    { name: 'flight', unit: 3600000, min: 'flightAwayMinHours', max: 'flightAwayMaxHours' }
  ];
  var portrait = document.getElementById('portrait');
  var scene = document.getElementById('scene');
  var still = document.getElementById('ravenStill');
  var video = document.getElementById('ravenVideo');
  var gate = document.getElementById('soundGate');
  var panel = document.getElementById('debugPanel');
  var status = document.getElementById('debugStatus');
  var busy = false;
  var ravenAway = false;
  var soundUnlocked = false;

  function between(min, max) { return min + Math.random() * (max - min); }
  function announce(message) { status.textContent = message; }
  function setPortraitState(nextState) {
    portrait.setAttribute('data-state', nextState);
    window.dispatchEvent(new CustomEvent('portraitstatechange', { detail: { state: nextState } }));
  }

  function nextDelay(item) {
    var delay = between(CONFIG[item.min], CONFIG[item.max]) * item.unit;
    if (Math.random() < CONFIG.longQuietChance) delay *= CONFIG.longQuietMultiplier;
    return delay;
  }

  function schedule(item) {
    window.setTimeout(function () {
      trigger(item.name);
      schedule(item);
    }, nextDelay(item));
  }

  function clipFor(name) {
    if (name === 'blink') return Math.random() < CONFIG.doubleBlinkChance ? 'doubleBlink' : 'blink';
    if (name === 'gaze') return Math.random() < 0.5 ? 'lookLeft' : 'lookViewer';
    return name;
  }

  function showRestingFrame() {
    video.classList.remove('is-visible');
    video.removeAttribute('src');
    video.load();
    if (!ravenAway) still.classList.remove('is-away');
    busy = false;
    announce(ravenAway ? 'Raven away' : 'Resting');
  }

  function playClip(name, onComplete) {
    if (busy || (!CLIPS[name])) return false;
    busy = true;
    announce('Playing ' + name);
    video.src = VIDEO_ROOT + encodeURIComponent(CLIPS[name]);
    video.volume = soundUnlocked ? CONFIG.videoVolume : 0;
    video.currentTime = 0;
    video.onended = function () {
      video.onended = null;
      if (onComplete) onComplete();
      else showRestingFrame();
    };
    video.onerror = function () {
      video.onerror = null;
      announce('Asset unavailable: ' + name);
      window.setTimeout(showRestingFrame, 900);
    };
    var promise = video.play();
    if (promise && promise.catch) promise.catch(function () { video.muted = true; video.play().catch(showRestingFrame); });
    video.classList.add('is-visible');
    return true;
  }

  function flightSequence() {
    if (busy || ravenAway) return;
    playClip('flightAway', function () {
      ravenAway = true;
      still.classList.add('is-away');
      showRestingFrame();
      var delay = between(CONFIG.flightReturnMinSeconds, CONFIG.flightReturnMaxSeconds) * 1000;
      announce('Raven away — return in ' + Math.round(delay / 1000) + 's');
      window.setTimeout(function () {
        playClip('flightReturn', function () {
          ravenAway = false;
          showRestingFrame();
        });
      }, delay);
    });
  }

  function trigger(name) {
    if (portrait.getAttribute('data-state') !== 'ACTIVE') return;
    if (name === 'flight') return flightSequence();
    if (ravenAway) return;
    playClip(clipFor(name));
  }

  function buildDebugPanel() {
    if (!CONFIG.debug) return;
    panel.hidden = false;
    var labels = ['blink', 'doubleBlink', 'ruffle', 'settle', 'preen', 'wingStretch', 'lookLeft', 'lookViewer', 'flight', 'lightning'];
    var container = document.getElementById('debugButtons');
    labels.forEach(function (name) {
      var button = document.createElement('button');
      button.type = 'button'; button.textContent = name; button.setAttribute('data-action', name);
      container.appendChild(button);
    });
    panel.addEventListener('click', function (event) {
      var action = event.target.getAttribute('data-action');
      if (!action) return;
      if (action === 'fullscreen') return document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      trigger(action);
    });
  }

  function unlockSound() {
    soundUnlocked = true;
    video.muted = false;
    gate.classList.add('is-hidden');
  }

  still.addEventListener('error', function () { still.classList.add('is-missing'); });
  gate.addEventListener('click', unlockSound);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') unlockSound();
    if (CONFIG.debug && event.key >= '1' && event.key <= '9') trigger(['blink','doubleBlink','ruffle','settle','preen','wingStretch','lookLeft','lookViewer','flight'][Number(event.key) - 1]);
  });
  if (!CONFIG.watermarkMask) portrait.classList.add('mask-disabled');
  if (CONFIG.burnInProtection) scene.classList.add('scene--drift');
  buildDebugPanel();
  SCHEDULES.forEach(schedule);
  setPortraitState('ACTIVE');

  window.HauntedPortrait = { trigger: trigger, setState: setPortraitState, clips: CLIPS };
}());
