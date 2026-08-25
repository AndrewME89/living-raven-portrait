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
  var debugBuilt = false;
  var playbackWatchdog = null;
  var progressWatchdog = null;

  function debugRequested() {
    var queryDebug = /(?:^|[?&])debug=(?:1|true)(?:&|$)/i.test(window.location.search);
    var savedDebug = false;
    try { savedDebug = window.localStorage.getItem('hauntedPortraitDebug') === 'true'; }
    catch (error) { savedDebug = false; }
    return CONFIG.debug || queryDebug || savedDebug;
  }

  function between(min, max) { return min + Math.random() * (max - min); }
  function announce(message) { status.textContent = message; }
  function fileCandidates(filename) {
    var variants = [
      filename,
      filename.replace(/ – /g, ' - '),
      filename.replace(/ – /g, '-'),
      filename.replace(/ – /g, ' — ')
    ];
    return variants.filter(function (candidate, index) { return variants.indexOf(candidate) === index; });
  }
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
    window.clearTimeout(playbackWatchdog);
    window.clearTimeout(progressWatchdog);
    playbackWatchdog = null;
    progressWatchdog = null;
    video.onended = null;
    video.onerror = null;
    video.onloadeddata = null;
    video.onplaying = null;
    video.onstalled = null;
    portrait.classList.remove('clip-playing');
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
    var candidates = fileCandidates(CLIPS[name]);
    var candidateIndex = 0;

    video.onended = function () {
      window.clearTimeout(playbackWatchdog);
      window.clearTimeout(progressWatchdog);
      if (onComplete) onComplete();
      else showRestingFrame();
    };

    function fail(message) {
      console.error('[Haunted Portrait] ' + message);
      announce(message);
      window.setTimeout(showRestingFrame, 1400);
    }

    function tryCandidate() {
      var filename = candidates[candidateIndex];
      announce('Loading ' + name + ' (' + filename + ')');
      video.onerror = function () {
        candidateIndex += 1;
        if (candidateIndex < candidates.length) tryCandidate();
        else fail('Could not load ' + name + '. Check its filename and H.264 encoding.');
      };
      video.onloadeddata = function () {
        window.clearTimeout(playbackWatchdog);
        playbackWatchdog = null;
        announce('Loaded ' + name + '; waiting for playback');
      };
      video.onplaying = function () {
        var startedAt = video.currentTime;
        portrait.classList.add('clip-playing');
        video.classList.add('is-visible');
        announce('Playing ' + name + (soundUnlocked ? ' with sound' : ' muted — select Awaken portrait for sound'));
        window.clearTimeout(progressWatchdog);
        progressWatchdog = window.setTimeout(function () {
          if (!video.ended && video.currentTime <= startedAt + 0.05) {
            fail(name + ' loaded but its video is not advancing. Re-encode it as H.264/yuv420p.');
          }
        }, 3000);
      };
      video.onstalled = function () {
        announce(name + ' stalled at ' + video.currentTime.toFixed(2) + 's; waiting for data');
      };
      video.src = VIDEO_ROOT + filename;
      video.muted = !soundUnlocked;
      video.volume = CONFIG.videoVolume;
      video.currentTime = 0;
      video.load();
      var promise = video.play();
      if (promise && promise.catch) promise.catch(function (error) {
        if (!video.muted) {
          video.muted = true;
          video.play().catch(function () { fail('Playback was blocked for ' + name + '. Select Awaken portrait and try again.'); });
        } else fail('Playback was blocked for ' + name + ': ' + error.message);
      });
      window.clearTimeout(playbackWatchdog);
      playbackWatchdog = window.setTimeout(function () {
        fail('Timed out loading ' + name + '. Check its filename and video encoding.');
      }, 12000);
    }

    tryCandidate();
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
    if (debugBuilt) return;
    debugBuilt = true;
    portrait.classList.add('debug-enabled');
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

  function toggleDebugPanel() {
    if (!debugBuilt) {
      buildDebugPanel();
      try { window.localStorage.setItem('hauntedPortraitDebug', 'true'); }
      catch (error) { /* Private browsing can deny storage; the panel still works. */ }
      return;
    }
    var willShow = panel.hidden;
    panel.hidden = !willShow;
    try { window.localStorage.setItem('hauntedPortraitDebug', willShow ? 'true' : 'false'); }
    catch (error) { /* Private browsing can deny storage; the panel still works. */ }
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
    if (event.key === 'd' || event.key === 'D') toggleDebugPanel();
    if (debugBuilt && !panel.hidden && event.key >= '1' && event.key <= '9') trigger(['blink','doubleBlink','ruffle','settle','preen','wingStretch','lookLeft','lookViewer','flight'][Number(event.key) - 1]);
  });
  if (!CONFIG.watermarkMask) portrait.classList.add('mask-disabled');
  if (CONFIG.burnInProtection) scene.classList.add('scene--drift');
  if (debugRequested()) buildDebugPanel();
  SCHEDULES.forEach(schedule);
  setPortraitState('ACTIVE');

  window.HauntedPortrait = { trigger: trigger, setState: setPortraitState, clips: CLIPS };
}());
