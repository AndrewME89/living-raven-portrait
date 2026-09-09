(function () {
  'use strict';

  var DEBUG_ACTIONS = [
    ['blink','Blink'], ['doubleBlink','Double blink'], ['adjust','Adjust'], ['ruffle','Ruffle'],
    ['settle','Feather settle'], ['preen','Preen'], ['wingStretch','Wing stretch'],
    ['lookLeft','Look left'], ['lookViewer','Look viewer'], ['flight','Flight away + return'],
    ['dance','Dance'], ['danceHardstyle','Dance (Hardstylez)'],
    ['lightning','Lightning + thunder'], ['mausoleum','Mausoleum + sound']
  ];
  var BEHAVIOURS = [
    { name:'blink', unit:1000, min:'blinkMinSeconds', max:'blinkMaxSeconds' },
    { name:'adjust', unit:60000, min:'adjustMinMinutes', max:'adjustMaxMinutes' },
    { name:'ruffle', unit:60000, min:'ruffleMinMinutes', max:'ruffleMaxMinutes' },
    { name:'settle', unit:60000, min:'settleMinMinutes', max:'settleMaxMinutes' },
    { name:'preen', unit:60000, min:'preenMinMinutes', max:'preenMaxMinutes' },
    { name:'wingStretch', unit:60000, min:'wingStretchMinMinutes', max:'wingStretchMaxMinutes' },
    { name:'gaze', unit:60000, min:'headMoveMinMinutes', max:'headMoveMaxMinutes' },
    { name:'dance', unit:3600000, min:'danceMinHours', max:'danceMaxHours' },
    { name:'flight', unit:3600000, min:'flightAwayMinHours', max:'flightAwayMaxHours' }
  ];
  var portrait=document.getElementById('portrait'), gate=document.getElementById('soundGate');
  var panel=document.getElementById('debugPanel'), status=document.getElementById('debugStatus');
  var soundUnlocked=false, audioContext=null, wakeLock=null, wakeLockRequest=null, eventAudio=null, eventTimer=null;
  var actionTimer=null, busy=false, away=false, debugBuilt=false;
  var dueTimes={}, generation=0;

  function assetUrl(path) { return path+(path.indexOf('?')<0?'?':'&')+'v='+encodeURIComponent(CONFIG.assetVersion); }
  function rand(min,max) { return min+Math.random()*(max-min); }
  function announce(text) { status.textContent=text; }
  function clipEnabled(name) { return !CONFIG.disabledClips||!CONFIG.disabledClips[name]; }
  function clipName(name) {
    if(name==='blink'&&clipEnabled('doubleBlink')&&Math.random()<CONFIG.doubleBlinkChance)return 'doubleBlink';
    if(name==='gaze')return Math.random()<.5?'lookLeft':'lookViewer';
    if(name==='dance')return Math.random()<.5?'dance':'danceHardstyle';
    if(name==='flight')return 'flightAway';
    return name;
  }
  function makeSlot(id) { var root=document.getElementById(id);return {root:root,video:root.querySelector('video'),name:null,frameCallback:null,onCleanFrame:null}; }
  var active=makeSlot('videoSlotA'), standby=makeSlot('videoSlotB');
  function waitEvent(target,event) { return new Promise(function(resolve,reject){var timeout=setTimeout(function(){cleanup();reject(new Error('Timed out waiting for '+event));},12000);function done(){cleanup();resolve();}function fail(){cleanup();reject(new Error('Media failed'));}function cleanup(){clearTimeout(timeout);target.removeEventListener(event,done);target.removeEventListener('error',fail);}target.addEventListener(event,done);target.addEventListener('error',fail);}); }
  function loadVideo(slot,name) {
    if(!clipEnabled(name))return Promise.reject(new Error('Clip disabled: '+name));
    if(!CONFIG.videoFiles[name])return Promise.reject(new Error('Unknown clip: '+name));
    slot.video.src=assetUrl(CONFIG.videoRoot+CONFIG.videoFiles[name]);slot.video.load();
    return waitEvent(slot.video,'loadeddata');
  }
  function seekToIdleFrame(slot) { slot.video.pause();if(slot.video.readyState>=2&&Math.abs(slot.video.currentTime-.001)<.0005)return Promise.resolve();var ready=waitEvent(slot.video,'seeked');slot.video.currentTime=.001;return ready.then(function(){slot.video.pause();}); }
  function prime(slot,name) {
    if(!clipEnabled(name))return Promise.reject(new Error('Clip disabled: '+name));
    slot.name=name;slot.video.muted=!soundUnlocked||name==='lightning'||name==='mausoleum';slot.video.volume=CONFIG.videoVolume;
    announce('Priming '+name);
    return loadVideo(slot,name).then(function(){return seekToIdleFrame(slot);}).then(function(){announce('Ready: '+name+' — first frame paused');});
  }
  function swapToStandby() {
    active.root.classList.remove('is-active');standby.root.classList.add('is-active');
    var old=active;active=standby;standby=old;
    resetSlot(standby);
  }
  function resetSlot(slot) { if(slot.frameCallback!==null&&slot.video.cancelVideoFrameCallback)slot.video.cancelVideoFrameCallback(slot.frameCallback);slot.frameCallback=null;slot.onCleanFrame=null;slot.video.onended=null;slot.video.ontimeupdate=null;slot.video.onerror=null;slot.root.classList.remove('is-active');slot.video.pause();slot.video.removeAttribute('src');slot.video.load();slot.name=null; }
  function primeAndSwap(name) { resetSlot(standby);return prime(standby,name).then(swapToStandby); }

  function getAudioContext(){if(!audioContext){var C=window.AudioContext||window.webkitAudioContext;if(C)audioContext=new C();}if(audioContext&&audioContext.state==='suspended')audioContext.resume();return audioContext;}
  function requestWakeLock(){
    if(!navigator.wakeLock||typeof navigator.wakeLock.request!=='function'){
      console.warn('[Haunted Portrait] Screen Wake Lock API is unavailable; continuing without it');
      return;
    }
    if((wakeLock&&!wakeLock.released)||wakeLockRequest)return;
    try{
      wakeLockRequest=navigator.wakeLock.request('screen').then(function(sentinel){
        wakeLock=sentinel;
        sentinel.addEventListener('release',function(){if(wakeLock===sentinel)wakeLock=null;});
        return sentinel;
      }).catch(function(error){console.warn('[Haunted Portrait] Could not acquire screen wake lock; continuing playback',error);}).then(function(result){wakeLockRequest=null;return result;});
    }catch(error){
      wakeLockRequest=null;
      console.warn('[Haunted Portrait] Could not acquire screen wake lock; continuing playback',error);
    }
    return wakeLockRequest;
  }
  function thunder(){var c=getAudioContext();if(!c)return;var duration=3.8,b=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=b.getChannelData(0),last=0;for(var i=0;i<data.length;i++){var white=Math.random()*2-1;last=last*.985+white*.015;data[i]=(white*.22+last*3.2)*Math.pow(1-i/data.length,1.7);}var source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),now=c.currentTime;filter.type='lowpass';filter.frequency.value=190;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(CONFIG.lightningThunderVolume,now+.08);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);source.buffer=b;source.connect(filter);filter.connect(gain);gain.connect(c.destination);source.start();}
  function environmentStart(name){if(!soundUnlocked)return;if(name==='mausoleum'&&CONFIG.mausoleumSound){eventAudio=new Audio(assetUrl(CONFIG.mausoleumSound));eventAudio.volume=CONFIG.videoVolume;eventAudio.play().catch(function(){});}if(name==='lightning'){eventTimer=setTimeout(function(){if(CONFIG.lightningSound){eventAudio=new Audio(assetUrl(CONFIG.lightningSound));eventAudio.volume=CONFIG.lightningThunderVolume;eventAudio.play().catch(function(){});}else thunder();},active.video.duration*CONFIG.lightningThunderDelayRatio*1000);}}
  function environmentStop(){if(eventTimer)clearTimeout(eventTimer);eventTimer=null;if(eventAudio){eventAudio.pause();eventAudio=null;}}

  function enterAwayState(){away=true;portrait.classList.add('raven-away');}
  function leaveAwayState(){away=false;portrait.classList.remove('raven-away');}
  function playActive() {
    return new Promise(function(resolve,reject){
      var slot=active,name=slot.name,finished=false;
      busy=true;
      function cleanup(){
        slot.video.onended=null;slot.video.ontimeupdate=null;slot.video.onerror=null;slot.onCleanFrame=null;
        if(slot.frameCallback!==null&&slot.video.cancelVideoFrameCallback)slot.video.cancelVideoFrameCallback(slot.frameCallback);
        slot.frameCallback=null;environmentStop(name);
      }
      function fail(error){
        if(finished)return;
        finished=true;cleanup();busy=false;reject(error);
      }
      function complete(){
        if(finished)return;
        finished=true;cleanup();
        if(name==='flightAway'||name==='flightReturn'){slot.video.pause();busy=false;resolve(name);return;}
        seekToIdleFrame(slot).then(function(){busy=false;resolve(name);}).catch(function(error){busy=false;reject(error);});
      }
      function holdCleanAwayFrame(){
        if(finished)return;
        enterAwayState();
        slot.video.pause();
        complete();
      }
      slot.video.onended=complete;
      slot.onCleanFrame=name==='flightAway'?holdCleanAwayFrame:null;
      slot.video.ontimeupdate=function(){
        if(name==='flightAway'&&CONFIG.flightAwayCleanFrameSeconds&&slot.video.currentTime>=CONFIG.flightAwayCleanFrameSeconds)holdCleanAwayFrame();
      };
      slot.video.onerror=function(){fail(new Error('Playback failed: '+name));};
      slot.video.muted=!soundUnlocked||name==='lightning'||name==='mausoleum';
      if(name==='lightning'||name==='mausoleum')environmentStart(name);
      if(name==='flightAway'&&slot.video.requestVideoFrameCallback){
        var watchCleanFrame=function(unused,metadata){
          if(metadata.mediaTime>=CONFIG.flightAwayCleanFrameSeconds){holdCleanAwayFrame();return;}
          slot.frameCallback=slot.video.requestVideoFrameCallback(watchCleanFrame);
        };
        slot.frameCallback=slot.video.requestVideoFrameCallback(watchCleanFrame);
      }
      slot.video.play().then(function(){announce('Playing '+name);}).catch(function(error){fail(error);});
    });
  }
  function scheduleDue(item){var delay=rand(CONFIG[item.min],CONFIG[item.max])*item.unit;if(Math.random()<CONFIG.longQuietChance)delay*=CONFIG.longQuietMultiplier;dueTimes[item.name]=Date.now()+delay;}
  function nextPlan(){var item=BEHAVIOURS[0];BEHAVIOURS.forEach(function(value){if(dueTimes[value.name]<dueTimes[item.name])item=value;});return {behaviour:item,name:clipName(item.name),due:dueTimes[item.name]};}
  function scheduleRetry(error,token){
    console.error('[Haunted Portrait]',error);busy=false;clearTimeout(actionTimer);
    announce(error.message+' — keeping current frame and retrying');
    actionTimer=setTimeout(function(){if(token===generation)runNormalLoop();},2000);
  }
  function recoverPlan(error,plan,token){
    if(token!==generation)return;
    resetSlot(standby);scheduleDue(plan.behaviour);scheduleRetry(error,token);
  }
  function recoverPlayback(error,plan,token){
    if(token!==generation)return;
    scheduleDue(plan.behaviour);
    seekToIdleFrame(active).catch(function(){}).then(function(){scheduleRetry(error,token);});
  }
  function runNormalLoop() {
    if(away)return;var token=++generation,plan=nextPlan();
    primeAndSwap(plan.name).then(function(){if(token!==generation)return;var delay=Math.max(0,plan.due-Date.now());announce('Idle on '+plan.name+' first frame');clearTimeout(actionTimer);actionTimer=setTimeout(function(){if(token!==generation)return;playActive().then(function(){if(token!==generation)return;scheduleDue(plan.behaviour);if(plan.behaviour.name==='flight')runFlightReturn(token,plan);else runNormalLoop();}).catch(function(error){recoverPlayback(error,plan,token);});},delay);}).catch(function(error){recoverPlan(error,plan,token);});
  }
  function runFlightReturn(token,plan){enterAwayState();primeAndSwap('flightReturn').then(function(){if(token!==generation)return;var delay=rand(CONFIG.flightReturnMinSeconds,CONFIG.flightReturnMaxSeconds)*1000;announce('Raven away — return in '+Math.round(delay/1000)+'s');clearTimeout(actionTimer);actionTimer=setTimeout(function(){if(token!==generation)return;playActive().then(function(){if(token!==generation)return;leaveAwayState();runNormalLoop();}).catch(function(error){leaveAwayState();recoverPlayback(error,plan,token);});},delay);}).catch(function(error){leaveAwayState();recoverPlan(error,plan,token);});}
  function force(name){
    if(name==='flightReturn'||busy)return;
    var chosen=name==='flight'?'flightAway':name;
    if(!clipEnabled(chosen)){announce('Disabled clip: '+chosen);return;}
    clearTimeout(actionTimer);var token=++generation;
    primeAndSwap(chosen).then(function(){if(token!==generation)return;return playActive();}).then(function(){if(token!==generation)return;if(name==='flight'){var flight=BEHAVIOURS.filter(function(item){return item.name==='flight';})[0];scheduleDue(flight);runFlightReturn(token,{behaviour:flight});}else runNormalLoop();}).catch(function(error){if(token!==generation)return;resetSlot(standby);scheduleRetry(error,token);});
  }

  function unlock(){if(!soundUnlocked){soundUnlocked=true;getAudioContext();gate.classList.add('is-hidden');}else if(audioContext&&audioContext.state==='suspended')audioContext.resume();requestWakeLock();}
  function buildDebug(){if(debugBuilt)return;debugBuilt=true;panel.hidden=false;portrait.classList.add('debug-enabled');var box=document.getElementById('debugButtons');DEBUG_ACTIONS.forEach(function(item){var b=document.createElement('button'),chosen=item[0]==='flight'?'flightAway':item[0];b.type='button';b.textContent=item[1];b.setAttribute('data-action',item[0]);if(!clipEnabled(chosen)){b.disabled=true;b.textContent+=' (disabled)';}box.appendChild(b);});panel.addEventListener('click',function(e){var action=e.target.getAttribute('data-action');if(!action)return;if(action==='fullscreen'){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();return;}unlock();force(action);});}
  function debugRequested(){return CONFIG.debug||/(?:^|[?&])debug=(?:1|true)(?:&|$)/i.test(location.search);}
  function setState(state){portrait.setAttribute('data-state',state);}
  function applyMuseumFinish(){portrait.classList.toggle('museum-finish-disabled',!CONFIG.museumFinishEnabled);portrait.style.setProperty('--museum-glaze-opacity',CONFIG.museumGlazeOpacity);portrait.style.setProperty('--museum-vignette-opacity',CONFIG.museumVignetteOpacity);}

  gate.addEventListener('click',unlock);
  document.addEventListener('keydown',function(e){if(e.key==='Enter')unlock();if(e.key==='d'||e.key==='D'){if(!debugBuilt)buildDebug();else panel.hidden=!panel.hidden;}});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&soundUnlocked)requestWakeLock();});
  applyMuseumFinish();if(debugRequested())buildDebug();
  BEHAVIOURS.forEach(scheduleDue);setState('ACTIVE');runNormalLoop();
  window.HauntedPortrait={trigger:force,setState:setState,clips:CONFIG.videoFiles};
}());
