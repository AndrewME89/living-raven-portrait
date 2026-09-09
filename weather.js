/** Open-Meteo current-condition integration with painted/canvas weather visuals. */
(function () {
  'use strict';

  var lastGoodState=null,pollTimer=null,stormTimer=null,forced=false,started=false;
  var portrait=document.getElementById('portrait');
  var scene=document.getElementById('scene');
  var overcastEl=document.querySelector('.weather-overcast');
  var fogFarEl=document.querySelector('.weather-fog-far');
  var fogNearEl=document.querySelector('.weather-fog-near');
  var rainCanvas=document.getElementById('weatherRain');
  var snowCanvas=document.getElementById('weatherSnow');

  var rainCtx=null,rainDrops=[],rainRAF=null,rainIntensity=0;
  var snowCtx=null,snowFlakes=[],snowRAF=null,snowIntensity=0;

  function rand(min,max){return min+Math.random()*(max-min);}
  function clamp(value,min,max){value=Number(value);if(!isFinite(value))value=0;return Math.max(min,Math.min(max,value));}

  function weatherCodeToKind(code) {
    if(code===95||code===96||code===99)return 'storm';
    if(code===45||code===48)return 'fog';
    if(code>=51&&code<=57)return 'drizzle';
    if((code>=61&&code<=67)||(code>=80&&code<=82))return 'rain';
    if((code>=71&&code<=77)||(code>=85&&code<=86))return 'snow';
    if(code>=1&&code<=3)return 'cloudy';
    return 'clear';
  }

  /* This deliberately matches the earlier A-Light-Haunting rain tuning. */
  function rainIntensityFor(kind,code) {
    if(kind==='drizzle')return .25;
    if(kind==='rain')return code>=80?.55:(code>=63?.60:.35);
    if(kind==='storm')return .75;
    return 0;
  }

  function debugRequested(){return CONFIG.debug||/(?:^|[?&])debug=(?:1|true)(?:&|$)/i.test(location.search);}
  function coordinatesReady(){return CONFIG.weatherEnabled&&typeof CONFIG.latitude==='number'&&isFinite(CONFIG.latitude)&&typeof CONFIG.longitude==='number'&&isFinite(CONFIG.longitude);}
  function normalize(current){
    var code=Number(current.weather_code);
    return {kind:weatherCodeToKind(code),cloudCover:Number(current.cloud_cover)||0,precipitation:Number(current.precipitation)||0,windSpeed:Number(current.wind_speed_10m)||0,isDay:Number(current.is_day)===1,weatherCode:isFinite(code)?code:0,temperature:current.temperature_2m==null?null:Number(current.temperature_2m),lastUpdated:new Date().toISOString()};
  }

  function fetchWeather(){
    var fields='weather_code,precipitation,cloud_cover,wind_speed_10m,is_day,temperature_2m';
    var url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(CONFIG.latitude)+'&longitude='+encodeURIComponent(CONFIG.longitude)+'&current='+fields+'&wind_speed_unit=kmh';
    return fetch(url,{cache:'no-store'}).then(function(response){if(!response.ok)throw new Error('weather HTTP '+response.status);return response.json();}).then(function(data){if(!data.current)throw new Error('weather response has no current conditions');return normalize(data.current);});
  }

  function setOvercast(state){
    if(!overcastEl)return;
    var kind=state.kind||'clear';
    var cloud=clamp(state.cloudCover,0,100)/100;
    var intensity=0;
    if(CONFIG.weatherOvercastEnabled){
      if(kind==='cloudy')intensity=cloud*.42;
      else if(kind==='drizzle')intensity=.14;
      else if(kind==='rain')intensity=.20;
      else if(kind==='storm')intensity=.27;
      else if(kind==='snow')intensity=.12;
      else if(kind==='fog')intensity=.05;
    }
    overcastEl.classList.toggle('is-overcast',intensity>0);
    overcastEl.style.setProperty('--overcast-intensity',clamp(intensity,0,.5).toFixed(3));
  }

  function setFog(intensity){
    intensity=clamp(intensity,0,1);
    var on=intensity>0&&CONFIG.weatherFogEnabled;
    if(fogFarEl){fogFarEl.classList.toggle('fog-on',on);fogFarEl.style.setProperty('--fog-intensity',(intensity*.70).toFixed(3));}
    if(fogNearEl){fogNearEl.classList.toggle('fog-on',on);fogNearEl.style.setProperty('--fog-intensity',(intensity*.55).toFixed(3));}
  }

  function resizeCanvas(canvas){
    if(!canvas||!scene)return;
    var rect=scene.getBoundingClientRect();
    var width=Math.max(1,Math.round(rect.width));
    var height=Math.max(1,Math.round(rect.height));
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
  }

  /* ------------------------------------------------------------------
     Rain — port of the Claude Code canvas effect from A-Light-Haunting.
     ------------------------------------------------------------------ */
  function spawnRainDrop(){
    var w=rainCanvas.width,h=rainCanvas.height;
    var angle=12+rainIntensity*10;
    return {
      x:rand(0,w+h*Math.tan(angle*Math.PI/180)),
      y:rand(-h,0),
      len:rand(10,22)*(.6+rainIntensity*.8),
      speed:rand(6,10)*(.6+rainIntensity),
      angle:angle,
      opacity:rand(.08,.22)
    };
  }

  function rebuildRainDrops(){
    if(!rainCanvas)return;
    var count=Math.round(40+rainIntensity*260);
    rainDrops=[];
    for(var i=0;i<count;i++)rainDrops.push(spawnRainDrop());
  }

  function drawRain(){
    if(!rainCtx||!rainCanvas)return;
    var w=rainCanvas.width,h=rainCanvas.height;
    rainCtx.clearRect(0,0,w,h);
    rainCtx.strokeStyle='rgba(200,210,225,1)';
    rainCtx.lineCap='round';
    for(var i=0;i<rainDrops.length;i++){
      var d=rainDrops[i];
      var rad=d.angle*Math.PI/180;
      var dx=Math.sin(rad)*d.len;
      var dy=Math.cos(rad)*d.len;
      rainCtx.globalAlpha=d.opacity;
      rainCtx.lineWidth=1;
      rainCtx.beginPath();
      rainCtx.moveTo(d.x,d.y);
      rainCtx.lineTo(d.x+dx,d.y+dy);
      rainCtx.stroke();
      d.x+=Math.sin(rad)*d.speed;
      d.y+=Math.cos(rad)*d.speed;
      if(d.y>h){var fresh=spawnRainDrop();fresh.y=rand(-40,0);rainDrops[i]=fresh;}
    }
    rainCtx.globalAlpha=1;
  }

  function startRainLoop(){
    if(!rainCanvas)return;
    rainCtx=rainCtx||rainCanvas.getContext('2d');
    resizeCanvas(rainCanvas);
    rebuildRainDrops();
    if(rainRAF)return;
    var step=function(){
      if(rainIntensity<=0){rainRAF=null;return;}
      drawRain();
      rainRAF=requestAnimationFrame(step);
    };
    rainRAF=requestAnimationFrame(step);
  }

  function stopRainLoop(){
    if(rainRAF){cancelAnimationFrame(rainRAF);rainRAF=null;}
    if(rainCtx&&rainCanvas)rainCtx.clearRect(0,0,rainCanvas.width,rainCanvas.height);
  }

  function setRain(intensity){
    var next=clamp(intensity,0,1);
    var changed=Math.abs(next-rainIntensity)>.01;
    rainIntensity=next;
    if(rainCanvas)rainCanvas.classList.toggle('rain-on',rainIntensity>0);
    if(rainIntensity>0){
      if(!rainRAF)startRainLoop();
      else if(changed)rebuildRainDrops();
    }else stopRainLoop();
  }

  /* Snow uses the same lightweight canvas model: individual flakes instead
     of a patterned white/grey overlay. */
  function spawnSnowFlake(fromTop){
    var w=snowCanvas.width,h=snowCanvas.height;
    return {
      x:rand(0,w),
      y:fromTop?rand(-50,0):rand(-h,h),
      radius:rand(.7,2.4)*(0.75+snowIntensity*.45),
      speed:rand(.35,1.15)*(0.75+snowIntensity*.55),
      drift:rand(-.28,.28),
      phase:rand(0,Math.PI*2),
      opacity:rand(.18,.52)
    };
  }

  function rebuildSnowFlakes(){
    if(!snowCanvas)return;
    var count=Math.round(35+snowIntensity*120);
    snowFlakes=[];
    for(var i=0;i<count;i++)snowFlakes.push(spawnSnowFlake(false));
  }

  function drawSnow(){
    if(!snowCtx||!snowCanvas)return;
    var w=snowCanvas.width,h=snowCanvas.height;
    snowCtx.clearRect(0,0,w,h);
    snowCtx.fillStyle='rgba(226,234,231,1)';
    for(var i=0;i<snowFlakes.length;i++){
      var f=snowFlakes[i];
      snowCtx.globalAlpha=f.opacity;
      snowCtx.beginPath();
      snowCtx.arc(f.x,f.y,f.radius,0,Math.PI*2);
      snowCtx.fill();
      f.phase+=.012;
      f.x+=f.drift+Math.sin(f.phase)*.16;
      f.y+=f.speed;
      if(f.y>h+10||f.x<-20||f.x>w+20)snowFlakes[i]=spawnSnowFlake(true);
    }
    snowCtx.globalAlpha=1;
  }

  function startSnowLoop(){
    if(!snowCanvas)return;
    snowCtx=snowCtx||snowCanvas.getContext('2d');
    resizeCanvas(snowCanvas);
    rebuildSnowFlakes();
    if(snowRAF)return;
    var step=function(){
      if(snowIntensity<=0){snowRAF=null;return;}
      drawSnow();
      snowRAF=requestAnimationFrame(step);
    };
    snowRAF=requestAnimationFrame(step);
  }

  function stopSnowLoop(){
    if(snowRAF){cancelAnimationFrame(snowRAF);snowRAF=null;}
    if(snowCtx&&snowCanvas)snowCtx.clearRect(0,0,snowCanvas.width,snowCanvas.height);
  }

  function setSnow(intensity){
    var next=clamp(intensity,0,1);
    var changed=Math.abs(next-snowIntensity)>.01;
    snowIntensity=next;
    if(snowCanvas)snowCanvas.classList.toggle('snow-on',snowIntensity>0);
    if(snowIntensity>0){
      if(!snowRAF)startSnowLoop();
      else if(changed)rebuildSnowFlakes();
    }else stopSnowLoop();
  }

  function applySceneWeather(state){
    if(!portrait)return;
    var kind=state.kind||'clear';
    var code=Number(state.weatherCode)||0;
    var windy=Number(state.windSpeed)>=Number(CONFIG.weatherWindRuffleThresholdKmh||30);
    var fogIntensity=kind==='fog'&&CONFIG.weatherFogEnabled?clamp(CONFIG.weatherFogMaxOpacity,0,1):0;
    var rain=rainIntensityFor(kind,code);
    var snow=kind==='snow'?clamp(.42+Math.min(.18,clamp(state.precipitation,0,8)*.02),0,.65):0;

    portrait.setAttribute('data-weather-kind',kind);
    portrait.setAttribute('data-weather-windy',windy?'true':'false');
    setOvercast(state);
    setFog(fogIntensity);
    setRain(rain);
    setSnow(snow);
  }

  function stopStorm(){if(stormTimer)clearTimeout(stormTimer);stormTimer=null;}
  function scheduleStorm(){
    stopStorm();
    if(!CONFIG.weatherStormLightningEnabled)return;
    stormTimer=setTimeout(function(){
      stormTimer=null;
      var current=window.HauntedPortrait.getWeather();
      if(current&&current.kind==='storm'){
        window.HauntedPortrait.triggerWeatherLightning();
        scheduleStorm();
      }
    },45000+Math.random()*195000);
  }

  function apply(state){
    window.HauntedPortrait.setWeather(state);
    applySceneWeather(state);
    if(state.kind==='storm')scheduleStorm();else stopStorm();
    if(debugRequested())console.info('[Haunted Portrait] Weather applied',state);
  }

  function refresh(){
    if(!coordinatesReady())return Promise.resolve(null);
    return fetchWeather().then(function(state){lastGoodState=state;if(!forced)apply(state);return state;}).catch(function(error){console.warn('[Haunted Portrait] Weather update failed; keeping last known conditions',error);return lastGoodState;});
  }

  function forcedState(kind){
    var threshold=Number(CONFIG.weatherWindRuffleThresholdKmh)||30;
    var states={
      clear:{kind:'clear',weatherCode:0,cloudCover:5,precipitation:0,windSpeed:5,isDay:false},
      cloudy:{kind:'cloudy',weatherCode:3,cloudCover:95,precipitation:0,windSpeed:10,isDay:false},
      fog:{kind:'fog',weatherCode:45,cloudCover:100,precipitation:0,windSpeed:4,isDay:false},
      drizzle:{kind:'drizzle',weatherCode:53,cloudCover:95,precipitation:1,windSpeed:12,isDay:false},
      rain:{kind:'rain',weatherCode:63,cloudCover:100,precipitation:3,windSpeed:15,isDay:false},
      storm:{kind:'storm',weatherCode:95,cloudCover:100,precipitation:5,windSpeed:25,isDay:false},
      snow:{kind:'snow',weatherCode:73,cloudCover:100,precipitation:2,windSpeed:10,isDay:false},
      windy:{kind:'clear',weatherCode:0,cloudCover:15,precipitation:0,windSpeed:threshold+10,isDay:false}
    };
    return states[kind]||states.clear;
  }

  function force(kind){forced=true;var state=forcedState(kind);state.temperature=null;state.lastUpdated=null;apply(state);}
  function useLive(){forced=false;if(lastGoodState)apply(lastGoodState);else apply({kind:'clear',weatherCode:0,cloudCover:0,precipitation:0,windSpeed:0,isDay:false,temperature:null,lastUpdated:null});return refresh();}

  function handleResize(){
    if(rainCanvas){resizeCanvas(rainCanvas);if(rainIntensity>0)rebuildRainDrops();}
    if(snowCanvas){resizeCanvas(snowCanvas);if(snowIntensity>0)rebuildSnowFlakes();}
  }

  function init(){
    if(started)return;started=true;
    window.addEventListener('resize',handleResize);
    if(!CONFIG.weatherEnabled){console.info('[Haunted Portrait] Weather is disabled in CONFIG');return;}
    if(!coordinatesReady()){console.info('[Haunted Portrait] Weather is idle — set numeric CONFIG.latitude and CONFIG.longitude to enable it');return;}
    refresh();
    pollTimer=setInterval(refresh,Math.max(1,Number(CONFIG.weatherUpdateMinutes)||15)*60000);
  }

  window.Weather={init:init,refresh:refresh,force:force,useLive:useLive};
  init();
}());
