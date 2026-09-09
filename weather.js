/** Lightweight current-condition integration for Open-Meteo. */
(function () {
  'use strict';

  var lastGoodState=null,pollTimer=null,stormTimer=null,forced=false,started=false;

  function weatherCodeToKind(code) {
    if(code===95||code===96||code===99)return 'storm';
    if(code===45||code===48)return 'fog';
    if(code>=51&&code<=57)return 'drizzle';
    if((code>=61&&code<=67)||(code>=80&&code<=82))return 'rain';
    if((code>=71&&code<=77)||(code>=85&&code<=86))return 'snow';
    if(code>=1&&code<=3)return 'cloudy';
    return 'clear';
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

  function stopStorm(){if(stormTimer)clearTimeout(stormTimer);stormTimer=null;}
  function scheduleStorm(){
    stopStorm();
    if(!CONFIG.weatherStormLightningEnabled)return;
    stormTimer=setTimeout(function(){stormTimer=null;if(window.HauntedPortrait.getWeather()&&window.HauntedPortrait.getWeather().kind==='storm'){window.HauntedPortrait.triggerWeatherLightning();scheduleStorm();}},45000+Math.random()*195000);
  }
  function apply(state){
    window.HauntedPortrait.setWeather(state);
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
      rain:{kind:'rain',weatherCode:63,cloudCover:100,precipitation:3,windSpeed:15,isDay:false},
      storm:{kind:'storm',weatherCode:95,cloudCover:100,precipitation:5,windSpeed:25,isDay:false},
      windy:{kind:'cloudy',weatherCode:3,cloudCover:70,precipitation:0,windSpeed:threshold+10,isDay:false}
    };
    return states[kind]||states.clear;
  }
  function force(kind){forced=true;var state=forcedState(kind);state.temperature=null;state.lastUpdated=null;apply(state);}
  function useLive(){forced=false;if(lastGoodState)apply(lastGoodState);else apply({kind:'clear',weatherCode:0,cloudCover:0,precipitation:0,windSpeed:0,isDay:false,temperature:null,lastUpdated:null});return refresh();}
  function init(){
    if(started)return;started=true;
    if(!CONFIG.weatherEnabled){console.info('[Haunted Portrait] Weather is disabled in CONFIG');return;}
    if(!coordinatesReady()){console.info('[Haunted Portrait] Weather is idle — set numeric CONFIG.latitude and CONFIG.longitude to enable it');return;}
    refresh();pollTimer=setInterval(refresh,Math.max(1,Number(CONFIG.weatherUpdateMinutes)||15)*60000);
  }

  window.Weather={init:init,refresh:refresh,force:force,useLive:useLive};
  init();
}());
