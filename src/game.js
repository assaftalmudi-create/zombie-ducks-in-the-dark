const $=s=>document.querySelector(s),button=$('#start'),status=$('#status'),debug=$('#debug'),scoreEl=$('#score');
const directions=[{name:'front',x:0,z:-1,key:'ArrowUp'},{name:'right',x:1,z:0,key:'ArrowRight'},{name:'left',x:-1,z:0,key:'ArrowLeft'}];
let gameOver=false,tickleUntil=0,tickleNext=0;
const recordedDuckFiles={front:'Duck_Up.wav',left:'Duck_Left.wav',right:'Duck_Right.wav'};
const recordedDucks={};let recordedDuckSource=null,recordedDuckGain=null;
let ballBounce,swampBed,openingVoice;
async function loadAudioFile(file){
 try{
  const response=await fetch('./audio/'+file);
  if(!response.ok)throw Error(response.status);
  return await ctx.decodeAudioData(await response.arrayBuffer());
 }catch(error){
  console.warn('Audio unavailable:',file,error);
  return null;
 }
}
async function loadGameAudio(){
 await Promise.all([
  ...Object.entries(recordedDuckFiles).map(async ([direction,file])=>{
   recordedDucks[direction]=await loadAudioFile(file);
  }),
  loadAudioFile('Ball_Bounce.wav').then(buffer=>{ballBounce=buffer;}),
  loadAudioFile('Fuki_Night.mp3').then(buffer=>{swampBed=buffer;}),
  loadAudioFile('Opening_Voice.mp3').then(buffer=>{openingVoice=buffer;})
 ]);
}
function stopRecordedDuck(){if(recordedDuckSource){try{recordedDuckSource.stop();}catch(e){}recordedDuckSource.disconnect();recordedDuckSource=null;}if(recordedDuckGain){recordedDuckGain.disconnect();recordedDuckGain=null;}}
function startRecordedDuck(d,approachDuration,voice=duckVoices[2]){stopRecordedDuck();const buffer=recordedDucks[d.name];if(!buffer)return false;const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=voice.quackRate;source.loop=false;gain.gain.value=(d.name==='front'?1.9:.95)*1.5;source.connect(gain).connect(master);source.start(0,Math.max(0,buffer.duration-approachDuration*voice.quackRate));recordedDuckSource=source;recordedDuckGain=gain;source.onended=()=>{if(recordedDuckSource===source){recordedDuckSource=null;recordedDuckGain=null;}source.disconnect();gain.disconnect();};return true;}
let ctx,master,roomSend,playing=false,duck=null,balls=[],nextDuckAt=0,last=0,score=0,round=0,duckPanner,duckFilter,duckGain,duckDirect,duckRearSend,duckRearDelay,duckRearFilter,duckNotch,duckPresence,duckFrontReflection,duckBackReflection;
const rand=(a,b)=>a+Math.random()*(b-a);
function panner(){const p=ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=1.3;p.maxDistance=35;p.rolloffFactor=.85;p.coneInnerAngle=360;return p;}
function pos(p,x,y,z){if(p.positionX){p.positionX.value=x;p.positionY.value=y;p.positionZ.value=z;}else p.setPosition(x,y,z);}
// Original procedural cartoon palette: elastic pitch, soft attacks and short comic gestures.
const duckVoices=[
 {name:'Pip',       base:390,formant:2.80,wobble:19,tempo:.83,walkRate:1.22,semitones:3},
 {name:'Bloop',     base:185,formant:1.65,wobble:11,tempo:1.30,walkRate:.78,semitones:-3},
 {name:'Noodle',    base:275,formant:2.15,wobble:28,tempo:1.05,walkRate:1.00,semitones:0},
 {name:'Grumble',   base:135,formant:1.42,wobble:8, tempo:1.48,walkRate:.72,semitones:-7},
 {name:'Squeak',    base:475,formant:2.95,wobble:32,tempo:.66,walkRate:1.31,semitones:7,wingbeat:.14},
 {name:'Wobble',    base:235,formant:2.65,wobble:39,tempo:1.23,walkRate:.90,semitones:-2},
 {name:'Beak',      base:340,formant:3.20,wobble:12,tempo:.73,walkRate:1.11,semitones:4},
 {name:'Gurgle',    base:160,formant:2.45,wobble:33,tempo:1.38,walkRate:1.10,semitones:-5},
 {name:'Hiccup',    base:420,formant:1.88,wobble:31,tempo:.78,walkRate:.87,semitones:5,wingbeat:.22},
 {name:'Mumble',    base:210,formant:1.53,wobble:16,tempo:1.32,walkRate:.81,semitones:-4},
 {name:'Rattle',    base:310,formant:2.55,wobble:45,tempo:.90,walkRate:1.38,semitones:2,wingbeat:.12},
 {name:'Side Eye',  base:255,formant:1.98,wobble:14,tempo:1.15,walkRate:.95,semitones:-1,wingbeat:.26}
].map(voice=>({...voice,quackRate:2**(voice.semitones/12)}));

let remainingVoices=[],lastVoice;
function nextDuckVoice(){
 if(!remainingVoices.length)remainingVoices=[...duckVoices];
 let index=Math.floor(Math.random()*remainingVoices.length);
 if(remainingVoices[index]===lastVoice&&remainingVoices.length>1){
  index=(index+1)%remainingVoices.length;
 }
 [lastVoice]=remainingVoices.splice(index,1);
 return lastVoice;
}
function bounce(at,p,volume){
 if(!ballBounce){
  sound('bounce',at,p,volume);
  return;
 }
 const source=ctx.createBufferSource(),gain=ctx.createGain();
 source.buffer=ballBounce;
 source.playbackRate.value=rand(1.28,1.45);
 gain.gain.value=volume;
 source.connect(gain).connect(p);
 source.onended=()=>{source.disconnect();gain.disconnect();};
 source.start(at);
 sound('bounce',at,p,volume*.68);
}
function sound(type,at,p,volume=1,voice=duckVoices[0]){
 // Cartoon gestures are built as two articulated syllables rather than a sustained beep.
 const isDuck=type==='quack'||type==='retreat';
 const dur=isDuck?(.46*voice.tempo):(type==='throw'?.13:type==='yelp'?.52/voice.quackRate:type==='hit'?.48:type==='tickle'?.19:type==='death'?.95:type==='water'?.24:type==='wingbeat'?.105:type==='footstep'?.135:type==='bounce'?.19:.31);
 const buf=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate),data=buf.getChannelData(0);
 let phase=0,subPhase=0;let noiseState=0,noiseFast=0;
 const soft=(x)=>Math.max(0,Math.min(1,x));
 const bell=(u,a,b)=>{const x=soft((u-a)/(b-a));return Math.sin(Math.PI*x)**1.6;};
 const accent=rand(.91,1.09),variation=rand(.94,1.06);
 for(let i=0;i<data.length;i++){
  const t=i/ctx.sampleRate,u=t/dur;
  let f=250,v=0;
  if(isDuck){
   const first=bell(u,.015,.49),second=bell(u,.39,.98);
   const swoop=1+.31*Math.exp(-u*20)-.21*u+.085*Math.sin(u*voice.wobble);
   f=voice.base*swoop*variation*(type==='retreat'?1.28:1);
   const vowel=.46*Math.sin(phase)+.19*Math.sin(phase*2)+.09*Math.sin(phase*3);
   const nasal=.18*Math.sin(subPhase)+.07*Math.sin(subPhase*2.01);
   const trem=.91+.09*Math.sin(2*Math.PI*13*t);noiseFast=.78*noiseFast+.22*(Math.random()*2-1);
   v=(first*.75+second*.95)*trem*(vowel+nasal)+.07*noiseFast*(Math.exp(-t*80)+Math.exp(-Math.max(0,t-dur*.42)*85)*soft((t-dur*.42)*300));
   if(type==='retreat')v*=.76;
  }else if(type==='water'){
   // A wet plip, then a much smaller bubble.
   const drop=bell(u,0,.31),bubble=bell(u,.4,.69);
   f=(440+2150*u)*variation;
   noiseFast=.55*noiseFast+.45*(Math.random()*2-1);
   v=drop*(.65*Math.sin(phase)+.22*noiseFast)+bubble*.24*Math.sin(subPhase);
  }else if(type==='wingbeat'){
   noiseState=.92*noiseState+.08*(Math.random()*2-1);
   noiseFast=.55*noiseFast+.45*(Math.random()*2-1);
   const downstroke=bell(u,0,.56);
   const featherRustle=bell(u,.46,1);
   v=downstroke*(1.4*noiseState+.33*noiseFast)+featherRustle*.29*noiseFast;
  }else if(type==='footstep'){
   // Unpitched soft webbed-foot flap and tiny delayed scuff. No rubber resonance.
   f=70;
   noiseState=.91*noiseState+.09*(Math.random()*2-1);
   noiseFast=.55*noiseFast+.45*(Math.random()*2-1);
   const flap=Math.exp(-t*55)*(.68*noiseState+.16*noiseFast);
   const scuff=Math.exp(-Math.max(0,t-.047)*68)*.44*noiseState*soft((t-.047)*200);
   v=flap+scuff;
  }else if(type==='throw'){
   // A quick forward swish with a rising whistle at release.
   f=(360+1400*u*u)*variation;
   noiseFast=.42*noiseFast+.58*(Math.random()*2-1);
   v=.42*bell(u,0,.9)*noiseFast+.34*bell(u,.04,1)*Math.sin(phase);
  }else if(type==='yelp'){
   // Three clipped syllables: the startled bark, a grumble, and a sharp last word.
   const bark=bell(u,0,.24),grumble=bell(u,.29,.58),lastWord=bell(u,.63,.98);
   f=voice.base*(1.65+1.1*bark-.36*grumble+.68*lastWord)*variation;
   noiseFast=.65*noiseFast+.35*(Math.random()*2-1);
   const vowel=.52*Math.sin(phase)+.26*Math.sin(phase*2)+.14*Math.sin(phase*3);
   const rasp=.23*noiseFast+.14*Math.sin(subPhase);
   v=(bark+grumble*.66+lastWord*.9)*(vowel*(.85+.15*Math.sin(2*Math.PI*(20+voice.wobble)*t))+rasp);
  }else if(type==='bounce'){
   // Layer a short slap and an elastic pitch sweep over the recorded impact.
   f=(410+1350*Math.exp(-t*29)-95*u)*variation;
   noiseFast=.35*noiseFast+.65*(Math.random()*2-1);
   const slap=Math.exp(-t*145)*.58*noiseFast;
   const spring=Math.exp(-t*24)*(.48*Math.sin(phase)+.12*Math.sin(subPhase));
   v=slap+spring;
  }else if(type==='hit'){
   // The slap lands first, followed by a low rubber thump and a rising squeak.
   f=135+220*Math.exp(-t*42)+290*bell(u,.07,.68);
   noiseFast=.42*noiseFast+.58*(Math.random()*2-1);
   const smack=.95*noiseFast*Math.exp(-t*92);
   const thump=.8*Math.sin(phase)*Math.exp(-t*29);
   const squeak=bell(u,.055,.72)*(.45*Math.sin(subPhase)+.12*Math.sin(subPhase*2));
   v=smack+thump+squeak;
  }else if(type==='tickle'){
   // Feather-light close-up flutter; avoid piercing sustained treble.
   f=510+150*Math.sin(2*Math.PI*19*t)+80*Math.sin(2*Math.PI*7*t);
   v=bell(u,0,1)*(.2*Math.sin(phase)+.1*Math.sin(subPhase)+.055*Math.sin(phase*3));
  }else if(type==='death'){
   // A cartoon deflation rather than a frightening death sound.
   f=370*Math.pow(.37,u)+22*Math.sin(2*Math.PI*4*t);
   v=Math.sin(Math.PI*u)*(.33*Math.sin(phase)+.13*Math.sin(subPhase));
  }
  phase+=2*Math.PI*f/ctx.sampleRate;
  subPhase+=2*Math.PI*f*((isDuck||type==='yelp')?voice.formant:1.52)/ctx.sampleRate;
  // Smooth the very beginning/end to avoid clicks; preserve floating-point headroom.
  const fade=Math.min(1,t*800,Math.max(0,(dur-t)*240));
  data[i]=Math.tanh(v*1.1)*.64*accent*Math.max(0,fade);
 }
 const src=ctx.createBufferSource(),gain=ctx.createGain();
 src.buffer=buf;gain.gain.value=volume;
 src.connect(gain).connect(p);
 src.start(Math.max(at,ctx.currentTime));
 src.onended=()=>{src.disconnect();gain.disconnect();};
}
function init(){const Audio=window.AudioContext||window.webkitAudioContext;try{ctx=new Audio({sampleRate:48000,latencyHint:'interactive'});}catch(e){ctx=new Audio();}master=ctx.createGain();master.gain.value=.37;const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=6;limiter.ratio.value=3;limiter.attack.value=.004;limiter.release.value=.16;master.connect(limiter).connect(ctx.destination);
const impulse=ctx.createBuffer(2,Math.floor(ctx.sampleRate*.38),ctx.sampleRate);for(let c=0;c<2;c++){const a=impulse.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/ctx.sampleRate*15)*.12;}const verb=ctx.createConvolver();verb.buffer=impulse;roomSend=ctx.createGain();roomSend.gain.value=.16;roomSend.connect(verb).connect(master);
// Short, asymmetrical wall reflections give the empty room a sense of size.
for(const [delayTime,pan,level] of [[.037,-.72,.16],[.061,.65,.12],[.104,-.25,.08]]){
 const delay=ctx.createDelay(.3),reflection=ctx.createGain(),stereo=ctx.createStereoPanner();
 delay.delayTime.value=delayTime;reflection.gain.value=level;stereo.pan.value=pan;
 roomSend.connect(delay).connect(reflection).connect(stereo).connect(master);
}
const L=ctx.listener;if(L.positionX){L.positionX.value=0;L.positionY.value=0;L.positionZ.value=0;L.forwardX.value=0;L.forwardY.value=0;L.forwardZ.value=-1;L.upX.value=0;L.upY.value=1;L.upZ.value=0;}else {L.setPosition(0,0,0);L.setOrientation(0,0,-1,0,1,0);}
duckPanner=panner();duckFilter=ctx.createBiquadFilter();duckFilter.type='lowpass';duckFilter.frequency.value=4000;duckGain=ctx.createGain();duckGain.gain.value=1.2;duckNotch=ctx.createBiquadFilter();duckNotch.type='peaking';duckNotch.Q.value=2.1;duckNotch.frequency.value=6900;duckNotch.gain.value=-2;
duckPresence=ctx.createBiquadFilter();duckPresence.type='highshelf';duckPresence.frequency.value=3900;duckPresence.gain.value=0;
duckFilter.connect(duckNotch).connect(duckPresence).connect(duckGain).connect(duckPanner);duckDirect=ctx.createGain();duckRearSend=ctx.createGain();duckRearDelay=ctx.createDelay(.25);duckRearFilter=ctx.createBiquadFilter();
duckRearFilter.type='lowpass';duckRearFilter.frequency.value=1850;duckRearDelay.delayTime.value=.046;
duckPanner.connect(duckDirect).connect(master);
duckPanner.connect(roomSend);
// Direction-specific early wall reflections: front is short and crisp, rear is later and darker.
duckFrontReflection=ctx.createGain();duckBackReflection=ctx.createGain();
for(const [send,delayTime,cutoff,pan] of [[duckFrontReflection,.022,7200,-.35],[duckBackReflection,.073,1750,.38]]){
 const delay=ctx.createDelay(.2),tone=ctx.createBiquadFilter(),stereo=ctx.createStereoPanner();
 delay.delayTime.value=delayTime;tone.type='lowpass';tone.frequency.value=cutoff;stereo.pan.value=pan;
 duckPanner.connect(send).connect(delay).connect(tone).connect(stereo).connect(master);
}
duckPanner.connect(duckRearSend).connect(duckRearDelay).connect(duckRearFilter).connect(master);
startNightAmbience();
}
let windLevel,windTone,nextGustAt=0,nextInsectAt=0;
function startNightAmbience(){
 const rate=ctx.sampleRate;
 const noise=ctx.createBuffer(2,rate*4,rate);
 for(let channel=0;channel<2;channel++){
  const data=noise.getChannelData(channel);
  for(let i=0;i<data.length;i++){
   const edge=Math.min(1,i/128,(data.length-1-i)/128);
   data[i]=(Math.random()*2-1)*edge;
  }
 }
 const source=ctx.createBufferSource();
 source.buffer=noise;
 source.loop=true;
 windTone=ctx.createBiquadFilter();
 windTone.type='lowpass';
 windTone.frequency.value=320;
 windLevel=ctx.createGain();
 windLevel.gain.value=.025;
 source.connect(windTone).connect(windLevel).connect(master);
 source.start();
 nextInsectAt=ctx.currentTime+rand(3,8);
}
let nextSwampPhrase=0,nextWaterDrop=0,lastSwampOffset;
function updateSwamp(t){
 // Crossfade different stretches of the original binaural stereo field.
 if(t>=nextSwampPhrase){
  const duration=rand(15,23),fade=3;
  const halfway=(swampBed.duration-duration)/2;
  const offset=lastSwampOffset===undefined||lastSwampOffset>=halfway
   ?rand(0,halfway):rand(halfway,halfway*2);
  lastSwampOffset=offset;
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  source.buffer=swampBed;
  source.connect(gain).connect(master);
  gain.gain.setValueAtTime(0,t);
  gain.gain.linearRampToValueAtTime(.24,t+fade);
  gain.gain.setValueAtTime(.24,t+duration-fade);
  gain.gain.linearRampToValueAtTime(0,t+duration);
  source.onended=()=>{source.disconnect();gain.disconnect();};
  source.start(t,offset,duration);
  nextSwampPhrase=t+duration-fade;
 }
 if(t>=nextWaterDrop){
  nextWaterDrop=t+rand(5,17);
  const drop=panner(),angle=rand(-Math.PI,Math.PI),distance=rand(1.6,3.5);
  pos(drop,Math.sin(angle)*distance,-.8,Math.cos(angle)*distance);
  drop.connect(master);
  sound('water',t,drop,rand(.012,.028));
  setTimeout(()=>drop.disconnect(),500);
 }
}
let nextChimeAt=0;
function playChimePhrase(t){
 const tones=[220,246.94,293.66,329.63,392];
 const count=Math.floor(rand(2,4)),first=Math.floor(rand(0,tones.length));
 for(let note=0;note<count;note++){
  const at=t+note*rand(.6,1.35);
  const base=tones[(first+note*2)%tones.length];
  const bell=panner(),level=ctx.createGain();
  pos(bell,rand(-3,3),rand(.6,1.8),-3.3);
  bell.connect(master);
  level.connect(bell);
  level.gain.setValueAtTime(0,at);
  level.gain.linearRampToValueAtTime(.024,at+.035);
  level.gain.exponentialRampToValueAtTime(.0001,at+3.1);
  for(const [ratio,amplitude] of [[1,.85],[2.01,.16],[4.13,.06]]){
   const tone=ctx.createOscillator(),partial=ctx.createGain();
   tone.frequency.value=base*ratio;
   partial.gain.value=amplitude;
   tone.connect(partial).connect(level);
   tone.start(at);
   tone.stop(at+3.15);
   tone.onended=()=>{tone.disconnect();partial.disconnect();};
  }
  setTimeout(()=>{level.disconnect();bell.disconnect();},(at-t+7)*1000);
 }
}
function playOpening(t){
 const at=t+.35;
 if(!openingVoice)return t+.5;
 const voice=ctx.createBufferSource(),level=ctx.createGain(),location=panner();
 pos(location,-.62,.35,-1.35);
 if(location.positionX)location.positionX.setTargetAtTime(.58,at+.55,1.1);
 level.gain.value=.72;
 voice.buffer=openingVoice;
 voice.connect(level).connect(location);
 location.connect(master);
 location.connect(roomSend);
 voice.onended=()=>{voice.disconnect();level.disconnect();location.disconnect();};
 voice.start(at);
 return at+openingVoice.duration+.55;
}
function updateNightAmbience(t){
 if(t>=nextChimeAt){
  playChimePhrase(t);
  nextChimeAt=t+rand(22,43);
 }
 if(swampBed&&swampBed.duration>=24){
  updateSwamp(t);
  return;
 }
 if(t>=nextGustAt){
  const drift=rand(1.5,4);
  windLevel.gain.setTargetAtTime(rand(.018,.075),t,drift);
  windTone.frequency.setTargetAtTime(rand(180,780),t,drift);
  nextGustAt=t+rand(3,11);
 }
 if(t<nextInsectAt)return;
 nextInsectAt=t+rand(5,19);
 const rate=ctx.sampleRate,count=Math.floor(rand(2,5)),gap=rand(.12,.22);
 const chirpDuration=rand(.034,.072),pitch=rand(3250,4350);
 const buffer=ctx.createBuffer(1,Math.ceil((count*gap+.1)*rate),rate);
 const data=buffer.getChannelData(0);
 for(let chirp=0;chirp<count;chirp++){
  const start=Math.floor((chirp*gap+rand(0,.035))*rate);
  for(let i=0;i<chirpDuration*rate;i++){
   const age=i/rate;
   const envelope=Math.sin(Math.PI*age/chirpDuration)**2;
   data[start+i]=envelope*Math.sin(2*Math.PI*(pitch+480*age)*age)*(1+.3*Math.sin(2*Math.PI*115*age));
  }
 }
 const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
 source.buffer=buffer;
 gain.gain.value=rand(.002,.005);
 pan.pan.value=rand(-.92,.92);
 source.connect(gain).connect(pan).connect(master);
 source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};
 source.start(t);
}
function approachSpeed(){return Math.min(3.7,1.1+Math.max(0,round-1)*.19)*duck.voice.walkRate;}
function spawnGap(){
 // A quick follow-up can arrive over the previous duck's swear.
 return Math.random()<.35 ? rand(.16,.48) : rand(.85,3.6);
}
function spawn(){const d=directions[Math.floor(Math.random()*directions.length)];duck={direction:d,voice:nextDuckVoice(),distance:10,mode:'approach',nextQuack:ctx.currentTime+.15,nextStep:ctx.currentTime+.12,stepCount:0,escapeSpeed:5.8};round++;duck.recorded=!duck.voice.wingbeat&&startRecordedDuck(d,(duck.distance-1.35)/approachSpeed(),duck.voice);logEvent('SPAWN',{direction:d.name,voice:duck.voice.name,distance:duck.distance,speed:approachSpeed()});status.textContent='A duck is approaching…';}
let lastEvent='No throws yet';const eventLog=[];let throwCounter=0;
function logEvent(kind,details={}){const entry={time:new Date().toISOString(),round,kind,...details};eventLog.push(entry);if(eventLog.length>300)eventLog.shift();lastEvent=kind+' '+JSON.stringify(details);renderDebug();}
function exportLog(){const payload={version:'0.39',exportedAt:new Date().toISOString(),events:eventLog};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='zombie-ducks-debug-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#downloadLog').addEventListener('click',exportLog);
function throwBall(d){
 if(gameOver||!duck||duck.mode!=='approach')return;
 const p=panner();p.connect(master);p.connect(roomSend);
 const ball={id:++throwCounter,p,d,distance:0,age:0,lastBounce:0,nextBounce:.24,bounces:0,active:true};
 balls.push(ball);pos(p,d.x*.8,.1,d.z*.8);sound('throw',ctx.currentTime,p,.42);
 logEvent('THROW',{ball:ball.id,direction:d.name,duckDirection:duck.direction.name,duckDistance:duck.distance});
 status.textContent='Ball flying '+d.name+'…';
 if(d!==duck.direction){ball.active=false;startChase(ctx.currentTime);logEvent('MISS_WRONG_DIRECTION',{ball:ball.id,thrown:d.name,duck:duck.direction.name});status.textContent='Miss! The duck is coming to TICKLE you!';}
}
function startChase(t){
 stopRecordedDuck();
 duck.recorded=false;
 duck.mode='chase';
 duck.nextQuack=t+.08;
}
function hitDuck(ball,t){
 nextDuckAt=t+spawnGap();
 duck.mode='retreat';stopRecordedDuck();duck.recorded=false;duck.nextQuack=t+.09+.52/duck.voice.quackRate;score++;scoreEl.textContent='Ducks startled: '+score;
 status.textContent='BOINK! Duck startled!';logEvent('HIT',{ball:ball.id,direction:ball.d.name,distance:duck.distance});
 const impactDistance=Math.min(duck.distance,3.5);
 pos(ball.p,ball.d.x*impactDistance,duck.voice.wingbeat?3.6:0,ball.d.z*impactDistance);
 sound('hit',t,ball.p,1.25);
 sound('yelp',t+.045,ball.p,1.35,duck.voice);
 ball.age=999;ball.bounces=99;ball.active=false;
}
function tick(now){try{const dt=Math.min((now-last)/1000,.06);last=now;if(playing&&ctx){const t=ctx.currentTime;updateNightAmbience(t);if(!gameOver){if((!duck||duck.mode==='retreat')&&t>=nextDuckAt)spawn();const previousDuckDistance=duck?duck.distance:Infinity;if(duck){if(duck.mode==='approach'){duck.distance=Math.max(1.35,duck.distance-dt*approachSpeed());}else if(duck.mode==='chase'){duck.distance=Math.max(.65,duck.distance-dt*5.6*duck.voice.walkRate);if(duck.distance<=.68){duck.mode='tickle';tickleUntil=t+2.15;tickleNext=t;status.textContent='OH NO. TICKLES!';}}else if(duck.mode==='retreat')duck.distance+=dt*duck.escapeSpeed*duck.voice.walkRate;
const flying=Boolean(duck.voice.wingbeat);
const flightHeight=3.6+.45*Math.sin(t*7);
pos(duckPanner,duck.direction.x*duck.distance,flying?flightHeight:duck.direction.z>0?-2.8:duck.direction.z<0?2.7:0,duck.direction.z*duck.distance);
duckDirect.gain.setTargetAtTime(duck.direction.z>0?.63:1,t,.07);
duckRearSend.gain.setTargetAtTime(duck.direction.z>0?.20:.02,t,.07);
duckFrontReflection.gain.setTargetAtTime(duck.direction.z<0?.14:.018,t,.07);
duckBackReflection.gain.setTargetAtTime(duck.direction.z>0?.25:.018,t,.07);
duckNotch.frequency.setTargetAtTime(duck.direction.z>0?5700:duck.direction.z<0?8400:6800,t,.06);
duckNotch.gain.setTargetAtTime(duck.direction.z>0?-11:duck.direction.z<0?-3:-5,t,.06);
duckPresence.gain.setTargetAtTime(duck.direction.z>0?-5:duck.direction.z<0?3:0,t,.06);
if((flying||!duck.recorded)&&(duck.mode==='approach'||duck.mode==='chase'||duck.mode==='retreat')){
 if(t>=duck.nextStep){
  // The footsteps share the moving HRTF panner with the duck's voice.
  const gait=flying?duck.voice.wingbeat*rand(.85,1.15):duck.mode==='chase'?.16/duck.voice.walkRate:duck.mode==='retreat'?.19/duck.voice.walkRate:Math.max(.19,.37*1.1/approachSpeed());
  const offset=duck.stepCount%2===0?-.14:.14;
  const stepPanner=panner();pos(stepPanner,duck.direction.x*duck.distance+(duck.direction.z!==0?offset:0),flying?flightHeight:duck.direction.z>0?-3.0:duck.direction.z<0?1.05:-.65,duck.direction.z*duck.distance+(duck.direction.x!==0?offset:0));
  const stepTone=ctx.createBiquadFilter();stepTone.type='lowpass';stepTone.frequency.value=duck.direction.z>0?1100:duck.direction.z<0?7800:4200;stepTone.Q.value=.65;stepTone.connect(stepPanner);stepPanner.connect(master);stepPanner.connect(roomSend);
  if(duck.direction.z>0){const reflection=ctx.createDelay(.2),rg=ctx.createGain();reflection.delayTime.value=.055;rg.gain.value=.24;stepTone.connect(reflection).connect(rg).connect(master);setTimeout(()=>{reflection.disconnect();rg.disconnect();},350);}
  sound(flying?'wingbeat':'footstep',t,stepTone,flying?1.05:duck.mode==='chase'?.78:.62,duck.voice);
  // Disconnect after the brief footfall has finished.
  setTimeout(()=>{stepTone.disconnect();stepPanner.disconnect();},350);
  duck.stepCount++;duck.nextStep=t+gait*(duck.stepCount%2===0?1.08:.92);
 }
}
duckFilter.frequency.setTargetAtTime(Math.max(900,(duck.direction.z>0?2350:duck.direction.z<0?9000:6000)/(1+duck.distance*.075)),t,.06);
if(duck.mode==='tickle'){if(recordedDuckSource)stopRecordedDuck();if(t>=tickleNext){sound('tickle',t,duckFilter,.42);tickleNext=t+.12+Math.random()*.11;}if(t>=tickleUntil){sound('death',t,duckFilter,.6);gameOver=true;logEvent('GAME_OVER',{reason:'tickled'});status.textContent='GAME OVER — TICKLED TO DEATH. Restart to try again.';button.disabled=false;button.textContent='Play again';}}else if(t>=duck.nextQuack){if(!duck.recorded)sound(duck.mode==='retreat'?'retreat':'quack',t+.01,duckFilter,duck.mode==='retreat'?.43:duck.mode==='chase'?.8:.68,duck.voice);duck.nextQuack=t+(duck.mode==='retreat'?.55:duck.mode==='chase'?rand(.22,.38):rand(.8,1.35))/duck.voice.quackRate;}
if(duck.mode==='retreat'&&duck.distance>13){stopRecordedDuck();duck=null;status.textContent='Listening for another duck…';}}
for(const b of balls){if(b.age>=999)continue;b.age+=dt;const previousDistance=b.distance;b.distance+=dt*12.5;
 const bouncePhase=Math.min(1,(b.age-b.lastBounce)/(b.nextBounce-b.lastBounce));
 const height=1.55*Math.pow(.78,b.bounces)*Math.sin(Math.PI*bouncePhase);
 pos(b.p,b.d.x*b.distance,-.7+height,b.d.z*b.distance);
 if(b.active&&duck&&duck.mode==='approach'&&b.d===duck.direction&&previousDistance<=previousDuckDistance+.6&&b.distance>=duck.distance-.6){hitDuck(b,t);continue;}
 if(b.active&&b.distance>=14){b.active=false;logEvent('MISS_OUT_OF_RANGE',{ball:b.id,direction:b.d.name,distance:b.distance,duckDistance:duck?duck.distance:null});if(duck&&duck.mode==='approach'){startChase(t);status.textContent='Miss! The duck is coming to TICKLE you!';}}if(b.age>=b.nextBounce&&b.bounces<6){pos(b.p,b.d.x*b.distance,-.7,b.d.z*b.distance);bounce(t,b.p,.70*Math.pow(.72,b.bounces));b.bounces++;b.lastBounce=b.age;b.nextBounce=b.age+Math.max(.075,.28*Math.pow(.82,b.bounces));}}
balls=balls.filter(b=>b.age<4&&(b.active||b.bounces<6));if(duck&&duck.mode==='approach'&&duck.distance<=1.36){duck.mode='tickle';tickleUntil=t+2.15;tickleNext=t;logEvent('TICKLE_REACHED_PLAYER',{direction:duck.direction.name});status.textContent='OH NO. TICKLES!';}renderDebug();}}}catch(error){const message=String(error&&error.stack||error);console.error('Duck game loop error',error);lastEvent='ERROR '+message;eventLog.push({time:new Date().toISOString(),round,kind:'RUNTIME_ERROR',message});status.textContent='Game error — open debug and download log';debug.hidden=false;debugToggle.textContent='Hide debug radar (D)';try{renderDebug()}catch(e){telemetry.textContent=message;}}finally{requestAnimationFrame(tick);}}
button.addEventListener('click',async()=>{button.disabled=true;
if(!ctx){
 init();
 await ctx.resume();
 button.textContent='Loading audio…';
 status.textContent='Loading game audio…';
 await loadGameAudio();
}else{
 await ctx.resume();
}if(gameOver){stopRecordedDuck();logEvent('RESTART');gameOver=false;duck=null;balls=[];score=0;round=0;scoreEl.textContent='Ducks startled: 0';}playing=true;button.textContent='Audio running';button.disabled=true;nextChimeAt=ctx.currentTime+1.3;nextDuckAt=playOpening(ctx.currentTime);status.textContent='When you close your eyes, the ducks appear.';});
window.addEventListener('keydown',async e=>{if(['ArrowUp','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='KeyD')toggleDebug();if(e.code==='Space'&&ctx&&!gameOver&&(playing||button.textContent==='Audio running')){playing=!playing;if(playing)await ctx.resume();else await ctx.suspend();status.textContent=playing?'Listen for a duck…':'Paused';}const d=directions.find(x=>x.key===e.code);if(d&&playing)throwBall(d);});
// Pointer presses throw immediately. Keyboard and assistive activation still use click.
document.querySelectorAll('.touch-controls button[data-direction]').forEach(control=>{
 const handleThrow=async()=>{
  const d=directions.find(item=>item.name===control.dataset.direction);
  if(!d)return;
  if(!ctx||!playing){status.textContent='Tap PLAY GAME first.';return;}
  if(ctx.state==='suspended')await ctx.resume();
  if(gameOver){status.textContent='Game over — tap Play again.';return;}
  if(!duck){status.textContent='Listening… wait for the next duck.';return;}
  if(duck.mode!=='approach'){status.textContent='The duck is '+duck.mode+' — wait for the next round.';return;}
  throwBall(d);
 };
 control.addEventListener('pointerdown',event=>{
  if(event.isPrimary&&event.button===0)handleThrow();
 });
 control.addEventListener('click',event=>{
  if(event.detail===0)handleThrow();
 });
});
requestAnimationFrame(t=>{last=t;requestAnimationFrame(tick);});
const debugToggle=$('#debugToggle'),radar=$('#radar'),telemetry=$('#telemetry'),radarCtx=radar.getContext('2d');
function toggleDebug(){debug.hidden=!debug.hidden;debugToggle.textContent=debug.hidden?'Show debug radar (D)':'Hide debug radar (D)';debugToggle.setAttribute('aria-pressed',String(!debug.hidden));if(!debug.hidden)renderDebug();}
debugToggle.addEventListener('click',toggleDebug);
function renderDebug(){
 if(debug.hidden)return;
 const c=radarCtx,w=radar.width,h=radar.height,cx=w/2,cy=h/2,scale=12,limit=13;
 c.clearRect(0,0,w,h);c.fillStyle='#101b19';c.fillRect(0,0,w,h);
 c.strokeStyle='#345345';c.lineWidth=1;
 for(const m of [5,10,13]){c.beginPath();c.arc(cx,cy,m*scale,0,Math.PI*2);c.stroke();c.fillStyle='#789e87';c.font='11px monospace';c.fillText(m+'m',cx+4,cy-m*scale+12);}
 c.beginPath();c.moveTo(cx,8);c.lineTo(cx,h-8);c.moveTo(8,cy);c.lineTo(w-8,cy);c.stroke();
 c.fillStyle='#a3b8aa';c.font='bold 12px monospace';c.textAlign='center';
 c.fillText('FRONT ↑',cx,16);c.fillText('LEFT',24,cy-8);c.fillText('RIGHT',w-25,cy-8);
 c.fillStyle='#e3f2e4';c.beginPath();c.arc(cx,cy,7,0,Math.PI*2);c.fill();c.fillStyle='#0b1510';c.font='bold 10px monospace';c.fillText('YOU',cx,cy-13);
 const point=(d,dist)=>({x:cx+d.x*Math.min(dist,limit)*scale,y:cy+d.z*Math.min(dist,limit)*scale});
 if(duck){const p=point(duck.direction,duck.distance);c.fillStyle=duck.mode==='chase'||duck.mode==='tickle'?'#ff8e83':duck.mode==='retreat'?'#b5d8a6':'#ffd77e';c.beginPath();c.arc(p.x,p.y,10,0,Math.PI*2);c.fill();c.fillStyle='#e5f2e7';c.font='12px monospace';c.fillText('DUCK',p.x,p.y-15);}
 for(const b of balls){const p=point(b.d,b.distance);c.fillStyle='#8bd8f4';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();}
 c.textAlign='left';
 telemetry.textContent='STATE: '+(!ctx?'not started':gameOver?'game over':playing?'running':'paused')+'\nROUND: '+round+'   SCORE: '+score+'\nDUCK: '+(duck?duck.direction.name.toUpperCase()+' · '+duck.voice.name+' · '+duck.distance.toFixed(2)+' m · '+duck.mode:'waiting')+'\nLAST EVENT: '+lastEvent+'\nBALLS: '+balls.length+'   AUDIO: '+(ctx?ctx.state:'off')+'\nRECENT EVENTS:\n'+eventLog.slice(-7).map(e=>e.kind+' '+(e.direction||e.thrown||'')+' '+(e.distance??'')).join('\n')+'\nHRTF: Web Audio PannerNode\nKEYS: arrows=throw · D=toggle · Space=pause';
}
renderDebug();
