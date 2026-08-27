(function () {
  'use strict';

  var DEBUG_ACTIONS = [
    ['blink','Blink'], ['doubleBlink','Double blink'], ['ruffle','Ruffle'],
    ['settle','Feather settle'], ['preen','Preen'], ['wingStretch','Wing stretch'],
    ['lookLeft','Look left'], ['lookViewer','Look viewer'], ['flight','Flight away + return'],
    ['lightning','Lightning + thunder'], ['mausoleum','Mausoleum + sound']
  ];
  var BEHAVIOURS = [
    { name:'blink', unit:1000, min:'blinkMinSeconds', max:'blinkMaxSeconds' },
    { name:'ruffle', unit:60000, min:'ruffleMinMinutes', max:'ruffleMaxMinutes' },
    { name:'settle', unit:60000, min:'settleMinMinutes', max:'settleMaxMinutes' },
    { name:'preen', unit:60000, min:'preenMinMinutes', max:'preenMaxMinutes' },
    { name:'wingStretch', unit:60000, min:'wingStretchMinMinutes', max:'wingStretchMaxMinutes' },
    { name:'gaze', unit:60000, min:'headMoveMinMinutes', max:'headMoveMaxMinutes' },
    { name:'flight', unit:3600000, min:'flightAwayMinHours', max:'flightAwayMaxHours' }
  ];
  var portrait=document.getElementById('portrait'), scene=document.getElementById('scene');
  var still=document.getElementById('ravenStill'), gate=document.getElementById('soundGate');
  var panel=document.getElementById('debugPanel'), status=document.getElementById('debugStatus');
  var soundUnlocked=false, audioContext=null, eventAudio=null, eventTimer=null;
  var actionTimer=null, busy=false, away=false, debugBuilt=false;
  var dueTimes={}, generation=0;

  function assetUrl(path) { return path+(path.indexOf('?')<0?'?':'&')+'v='+encodeURIComponent(CONFIG.assetVersion); }
  function rand(min,max) { return min+Math.random()*(max-min); }
  function announce(text) { status.textContent=text; }
  function clipName(name) {
    if(name==='blink'&&Math.random()<CONFIG.doubleBlinkChance)return 'doubleBlink';
    if(name==='gaze')return Math.random()<.5?'lookLeft':'lookViewer';
    return name;
  }
  function candidates(filename) {
    var list=[filename,filename.replace('Raven Movement','Raven Animation'),filename.replace(/ – /g,' - '),filename.replace(/ – /g,'-'),filename.replace(/ – /g,' — ')];
    return list.filter(function(value,index){return list.indexOf(value)===index;});
  }
  function configureScene() {
    var hero=assetUrl(CONFIG.heroImage);
    still.src=hero; scene.style.setProperty('--hero-image','url("'+hero+'")');
    scene.style.setProperty('--cemetery-image','url("'+assetUrl(CONFIG.cemeteryImage)+'")');
  }

  function makeSlot(id) { var root=document.getElementById(id);return {root:root,video:root.querySelector('video'),name:null,frameCallback:null,onCleanFrame:null}; }
  var active=makeSlot('videoSlotA'), standby=makeSlot('videoSlotB');
  function waitEvent(target,event) { return new Promise(function(resolve,reject){var timeout=setTimeout(function(){cleanup();reject(new Error('Timed out waiting for '+event));},12000);function done(){cleanup();resolve();}function fail(){cleanup();reject(new Error('Media failed'));}function cleanup(){clearTimeout(timeout);target.removeEventListener(event,done);target.removeEventListener('error',fail);}target.addEventListener(event,done);target.addEventListener('error',fail);}); }
  function loadCandidate(slot,name,index) {
    var names=candidates(CONFIG.videoFiles[name]);if(index>=names.length)return Promise.reject(new Error('No playable file for '+name));
    slot.video.src=assetUrl(CONFIG.videoRoot+names[index]);slot.video.load();
    return waitEvent(slot.video,'loadeddata').catch(function(){return loadCandidate(slot,name,index+1);});
  }
  function prime(slot,name) {
    slot.name=name;slot.video.muted=!soundUnlocked||name==='lightning'||name==='mausoleum';slot.video.volume=CONFIG.videoVolume;
    announce('Priming '+name);
    return loadCandidate(slot,name,0).then(function(){slot.video.currentTime=.001;return waitEvent(slot.video,'seeked');}).then(function(){slot.video.pause();announce('Ready: '+name+' — first frame paused');});
  }
  function swapToStandby() {
    active.root.classList.remove('is-active');standby.root.classList.add('is-active');
    var old=active;active=standby;standby=old;portrait.classList.add('video-idle');still.classList.add('is-video-ready');
    resetSlot(standby);
  }
  function resetSlot(slot) { if(slot.frameCallback!==null&&slot.video.cancelVideoFrameCallback)slot.video.cancelVideoFrameCallback(slot.frameCallback);slot.frameCallback=null;slot.onCleanFrame=null;slot.root.classList.remove('is-active');slot.video.pause();slot.video.removeAttribute('src');slot.video.load();slot.name=null; }
  function primeAndSwap(name) { resetSlot(standby);return prime(standby,name).then(swapToStandby); }

  function getAudioContext(){if(!audioContext){var C=window.AudioContext||window.webkitAudioContext;if(C)audioContext=new C();}if(audioContext&&audioContext.state==='suspended')audioContext.resume();return audioContext;}
  function thunder(){var c=getAudioContext();if(!c)return;var duration=3.8,b=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=b.getChannelData(0),last=0;for(var i=0;i<data.length;i++){var white=Math.random()*2-1;last=last*.985+white*.015;data[i]=(white*.22+last*3.2)*Math.pow(1-i/data.length,1.7);}var source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),now=c.currentTime;filter.type='lowpass';filter.frequency.value=190;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(CONFIG.lightningThunderVolume,now+.08);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);source.buffer=b;source.connect(filter);filter.connect(gain);gain.connect(c.destination);source.start();}
  function environmentStart(name){if(!soundUnlocked)return;if(name==='mausoleum'&&CONFIG.mausoleumSound){eventAudio=new Audio(assetUrl(CONFIG.mausoleumSound));eventAudio.volume=CONFIG.videoVolume;eventAudio.play().catch(function(){});}if(name==='lightning'){eventTimer=setTimeout(function(){if(CONFIG.lightningSound){eventAudio=new Audio(assetUrl(CONFIG.lightningSound));eventAudio.volume=CONFIG.lightningThunderVolume;eventAudio.play().catch(function(){});}else thunder();},active.video.duration*CONFIG.lightningThunderDelayRatio*1000);}}
  function environmentStop(){if(eventTimer)clearTimeout(eventTimer);eventTimer=null;if(eventAudio){eventAudio.pause();eventAudio=null;}}

  function enterAwayState(){away=true;portrait.classList.add('raven-away');}
  function leaveAwayState(){away=false;portrait.classList.remove('raven-away');}
  function playActive() {
    return new Promise(function(resolve,reject){
      var slot=active,name=slot.name,finished=false;
      busy=true;
      function complete(){
        if(finished)return;
        finished=true;slot.video.onended=null;slot.video.ontimeupdate=null;slot.onCleanFrame=null;
        if(slot.frameCallback!==null&&slot.video.cancelVideoFrameCallback)slot.video.cancelVideoFrameCallback(slot.frameCallback);
        slot.frameCallback=null;
        environmentStop(name);busy=false;resolve(name);
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
      slot.video.onerror=function(){busy=false;reject(new Error('Playback failed: '+name));};
      slot.video.muted=!soundUnlocked||name==='lightning'||name==='mausoleum';
      if(name==='lightning'||name==='mausoleum')environmentStart(name);
      if(name==='flightAway'&&slot.video.requestVideoFrameCallback){
        var watchCleanFrame=function(unused,metadata){
          if(metadata.mediaTime>=CONFIG.flightAwayCleanFrameSeconds){holdCleanAwayFrame();return;}
          slot.frameCallback=slot.video.requestVideoFrameCallback(watchCleanFrame);
        };
        slot.frameCallback=slot.video.requestVideoFrameCallback(watchCleanFrame);
      }
      slot.video.play().then(function(){announce('Playing '+name);}).catch(reject);
    });
  }
  function scheduleDue(item){var delay=rand(CONFIG[item.min],CONFIG[item.max])*item.unit;if(Math.random()<CONFIG.longQuietChance)delay*=CONFIG.longQuietMultiplier;dueTimes[item.name]=Date.now()+delay;}
  function nextPlan(){var item=BEHAVIOURS[0];BEHAVIOURS.forEach(function(value){if(dueTimes[value.name]<dueTimes[item.name])item=value;});return {behaviour:item,name:clipName(item.name),due:dueTimes[item.name]};}
  function runNormalLoop() {
    if(away)return;var token=++generation,plan=nextPlan();
    primeAndSwap(plan.name).then(function(){if(token!==generation)return;var delay=Math.max(0,plan.due-Date.now());announce('Idle on '+plan.name+' first frame');actionTimer=setTimeout(function(){playActive().then(function(){scheduleDue(plan.behaviour);if(plan.behaviour.name==='flight')runFlightReturn();else runNormalLoop();}).catch(fallback);},delay);}).catch(fallback);
  }
  function runFlightReturn(){enterAwayState();primeAndSwap('flightReturn').then(function(){var delay=rand(CONFIG.flightReturnMinSeconds,CONFIG.flightReturnMaxSeconds)*1000;announce('Raven away — return in '+Math.round(delay/1000)+'s');actionTimer=setTimeout(function(){playActive().then(function(){leaveAwayState();runNormalLoop();}).catch(fallback);},delay);}).catch(fallback);}
  function fallback(error){console.error('[Haunted Portrait]',error);busy=false;away=false;portrait.classList.remove('raven-away','video-idle');still.classList.remove('is-video-ready');announce(error.message+' — using hero fallback');setTimeout(runNormalLoop,2000);}
  function force(name){if(name==='flightReturn'||busy)return;clearTimeout(actionTimer);generation++;var chosen=name==='flight'?'flightAway':name;primeAndSwap(chosen).then(function(){return playActive();}).then(function(){if(name==='flight')runFlightReturn();else runNormalLoop();}).catch(fallback);}

  function unlock(){soundUnlocked=true;getAudioContext();gate.classList.add('is-hidden');}
  function buildDebug(){if(debugBuilt)return;debugBuilt=true;panel.hidden=false;portrait.classList.add('debug-enabled');var box=document.getElementById('debugButtons');DEBUG_ACTIONS.forEach(function(item){var b=document.createElement('button');b.type='button';b.textContent=item[1];b.setAttribute('data-action',item[0]);box.appendChild(b);});panel.addEventListener('click',function(e){var action=e.target.getAttribute('data-action');if(!action)return;if(action==='fullscreen'){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();return;}unlock();force(action);});}
  function debugRequested(){return CONFIG.debug||/(?:^|[?&])debug=(?:1|true)(?:&|$)/i.test(location.search);}
  function setState(state){portrait.setAttribute('data-state',state);}

  gate.addEventListener('click',unlock);still.addEventListener('error',function(){still.classList.add('is-missing');});
  document.addEventListener('keydown',function(e){if(e.key==='Enter')unlock();if(e.key==='d'||e.key==='D'){if(!debugBuilt)buildDebug();else panel.hidden=!panel.hidden;}});
  configureScene();if(debugRequested())buildDebug();
  BEHAVIOURS.forEach(scheduleDue);setState('ACTIVE');runNormalLoop();
  window.HauntedPortrait={trigger:force,setState:setState,clips:CONFIG.videoFiles};
}());
