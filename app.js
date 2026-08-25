(function () {
  'use strict';

  var VIDEO_ROOT = CONFIG.videoRoot;
  var CLIPS = CONFIG.videoFiles;
  var DEBUG_ACTIONS = [
    { action: 'blink', label: 'Blink' },
    { action: 'doubleBlink', label: 'Double blink' },
    { action: 'ruffle', label: 'Ruffle' },
    { action: 'settle', label: 'Feather settle' },
    { action: 'preen', label: 'Preen' },
    { action: 'wingStretch', label: 'Wing stretch' },
    { action: 'lookLeft', label: 'Look left' },
    { action: 'lookViewer', label: 'Look viewer' },
    { action: 'flight', label: 'Flight away + return' },
    { action: 'lightning', label: 'Lightning + thunder' },
    { action: 'mausoleum', label: 'Mausoleum + sound' }
  ];
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
  var videoCanvas = document.getElementById('ravenVideoCanvas');
  var gate = document.getElementById('soundGate');
  var panel = document.getElementById('debugPanel');
  var status = document.getElementById('debugStatus');
  var busy = false;
  var ravenAway = false;
  var soundUnlocked = false;
  var debugBuilt = false;
  var playbackWatchdog = null;
  var progressWatchdog = null;
  var frameRequest = null;
  var compositor = null;
  var eventSound = null;
  var eventSoundTimer = null;
  var audioContext = null;

  function assetUrl(path) {
    var separator = path.indexOf('?') === -1 ? '?' : '&';
    return path + separator + 'v=' + encodeURIComponent(CONFIG.assetVersion);
  }

  function configureAssets() {
    var heroUrl = assetUrl(CONFIG.heroImage);
    scene.style.setProperty('--hero-image', 'url("' + heroUrl + '")');
    scene.style.setProperty('--cemetery-image', 'url("' + assetUrl(CONFIG.cemeteryImage) + '")');
    still.src = heroUrl;
    scene.style.setProperty('--gesture-scale', CONFIG.gestureAlignment.scale);
    scene.style.setProperty('--gesture-x', CONFIG.gestureAlignment.xPixels + 'px');
    scene.style.setProperty('--gesture-y', CONFIG.gestureAlignment.yPixels + 'px');
    scene.style.setProperty('--mausoleum-left', CONFIG.mausoleumWindow.left + '%');
    scene.style.setProperty('--mausoleum-top', CONFIG.mausoleumWindow.top + '%');
    scene.style.setProperty('--mausoleum-width', CONFIG.mausoleumWindow.width + '%');
    scene.style.setProperty('--mausoleum-height', CONFIG.mausoleumWindow.height + '%');
  }

  function isEnvironmentClip(name) { return name === 'lightning' || name === 'mausoleum'; }

  function playMausoleumSound() {
    if (!soundUnlocked || !CONFIG.mausoleumSound) return;
    eventSound = new Audio(assetUrl(CONFIG.mausoleumSound));
    eventSound.volume = CONFIG.videoVolume;
    eventSound.play().catch(function () { announce('Mausoleum is playing, but its separate sound was blocked.'); });
  }

  function getAudioContext() {
    if (!audioContext) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function synthesizeThunder() {
    var context = getAudioContext();
    if (!context) { announce('Lightning is playing, but Web Audio is unavailable.'); return; }
    var duration = 3.8;
    var buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    var samples = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < samples.length; i += 1) {
      var white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      var decay = Math.pow(1 - i / samples.length, 1.7);
      samples[i] = (white * 0.22 + last * 3.2) * decay;
    }
    var source = context.createBufferSource();
    var lowpass = context.createBiquadFilter();
    var gain = context.createGain();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 190; lowpass.Q.value = 0.7;
    var now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(CONFIG.lightningThunderVolume, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(CONFIG.lightningThunderVolume * 0.42, now + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.buffer = buffer; source.connect(lowpass); lowpass.connect(gain); gain.connect(context.destination);
    source.start(now); source.stop(now + duration);
  }

  function scheduleLightningSound() {
    if (!soundUnlocked) return;
    var delay = Math.max(0, video.duration * CONFIG.lightningThunderDelayRatio * 1000);
    eventSoundTimer = window.setTimeout(function () {
      if (CONFIG.lightningSound) {
        eventSound = new Audio(assetUrl(CONFIG.lightningSound));
        eventSound.volume = CONFIG.lightningThunderVolume;
        eventSound.play().catch(function () { announce('Lightning is playing, but its thunder audio was blocked.'); });
      } else synthesizeThunder();
    }, delay);
  }

  function initVideoCompositor() {
    var gl = videoCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
      videoCanvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    var vertexSource = 'attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
    var fragmentSource = [
      'precision mediump float; varying vec2 uv; uniform sampler2D tex; uniform vec2 scale; uniform vec2 offset;',
      'void main(){vec2 q=uv*scale+offset;vec4 c=texture2D(tex,q);',
      'float distanceFromBlack=max(c.r,max(c.g,c.b));',
      'float alpha=smoothstep(0.001,0.008,distanceFromBlack);',
      'if(q.x<0.07&&q.y>0.93)alpha=0.0;',
      'gl_FragColor=vec4(c.rgb,alpha);}'
    ].join('');
    function shader(type, source) {
      var value = gl.createShader(type);
      gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) return null;
      return value;
    }
    var vertex = shader(gl.VERTEX_SHADER, vertexSource);
    var fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    return { gl: gl, program: program, texture: texture,
      scale: gl.getUniformLocation(program, 'scale'), offset: gl.getUniformLocation(program, 'offset') };
  }

  function drawVideoFrame() {
    if (!compositor || video.paused || video.ended) return;
    var gl = compositor.gl;
    var boxWidth = videoCanvas.clientWidth || scene.clientWidth;
    var boxHeight = videoCanvas.clientHeight || scene.clientHeight;
    var pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    var width = Math.round(boxWidth * pixelRatio), height = Math.round(boxHeight * pixelRatio);
    if (videoCanvas.width !== width || videoCanvas.height !== height) { videoCanvas.width = width; videoCanvas.height = height; }
    var videoAspect = video.videoWidth / video.videoHeight;
    var boxAspect = boxWidth / boxHeight;
    var scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0;
    if (videoAspect > boxAspect) { scaleX = boxAspect / videoAspect; offsetX = (1 - scaleX) / 2; }
    else { scaleY = videoAspect / boxAspect; offsetY = (1 - scaleY) / 2; }
    gl.viewport(0, 0, width, height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, compositor.texture);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); }
    catch (error) { announce('WebGL could not read this video; using the unkeyed clip.'); useRawVideo(); return; }
    gl.uniform2f(compositor.scale, scaleX, scaleY); gl.uniform2f(compositor.offset, offsetX, offsetY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    frameRequest = window.requestAnimationFrame(drawVideoFrame);
  }

  function useRawVideo() {
    if (frameRequest) window.cancelAnimationFrame(frameRequest);
    frameRequest = null;
    portrait.classList.add('raw-video-playing');
    video.classList.add('is-visible');
    videoCanvas.classList.remove('is-visible');
  }

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
      filename.replace('Raven Animation', 'Raven Movement'),
      filename.replace('Raven Movement', 'Raven Animation'),
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
    if (frameRequest) window.cancelAnimationFrame(frameRequest);
    frameRequest = null;
    portrait.classList.remove('clip-playing');
    portrait.classList.remove('raw-video-playing');
    portrait.classList.remove('lightning-playing');
    portrait.classList.remove('mausoleum-playing');
    video.classList.remove('is-visible');
    videoCanvas.classList.remove('is-visible');
    video.removeAttribute('src');
    video.load();
    if (eventSound) { eventSound.pause(); eventSound = null; }
    if (eventSoundTimer) { window.clearTimeout(eventSoundTimer); eventSoundTimer = null; }
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
      var requestUrl = assetUrl(VIDEO_ROOT + filename);
      announce('Loading ' + name + ' (' + requestUrl + ')');
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
        if (isEnvironmentClip(name)) {
          useRawVideo();
          scene.style.setProperty('--environment-duration', (isFinite(video.duration) ? video.duration : 4) + 's');
          portrait.classList.add(name + '-playing');
          video.muted = true;
          if (name === 'mausoleum') playMausoleumSound();
          if (name === 'lightning') scheduleLightningSound();
        } else if (compositor) {
          video.classList.remove('is-visible');
          videoCanvas.classList.add('is-visible');
          frameRequest = window.requestAnimationFrame(drawVideoFrame);
        } else useRawVideo();
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
      video.src = requestUrl;
      video.muted = isEnvironmentClip(name) || !soundUnlocked;
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
    /* Return is an internal half of the paired flight sequence, never a public action. */
    if (name === 'flightReturn') return false;
    if (name === 'flight') return flightSequence();
    if (ravenAway) return;
    playClip(clipFor(name));
  }

  function buildDebugPanel() {
    if (debugBuilt) return;
    debugBuilt = true;
    portrait.classList.add('debug-enabled');
    panel.hidden = false;
    var container = document.getElementById('debugButtons');
    DEBUG_ACTIONS.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button'; button.textContent = item.label; button.setAttribute('data-action', item.action);
      container.appendChild(button);
    });
    panel.addEventListener('click', function (event) {
      var action = event.target.getAttribute('data-action');
      if (!action) return;
      if (action === 'fullscreen') return document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      /* A debug click is a valid user gesture: unlock sound before testing the event. */
      unlockSound();
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
    getAudioContext();
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
  configureAssets();
  compositor = initVideoCompositor();
  if (debugRequested()) buildDebugPanel();
  SCHEDULES.forEach(schedule);
  setPortraitState('ACTIVE');

  window.HauntedPortrait = { trigger: trigger, setState: setPortraitState, clips: CLIPS };
}());
