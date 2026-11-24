const $=s=>document.querySelector(s),button=$('#start'),status=$('#status'),debug=$('#debug'),scoreEl=$('#score');
const directions=[{name:'front',x:0,z:-1,key:'ArrowUp'},{name:'right',x:1,z:0,key:'ArrowRight'},{name:'left',x:-1,z:0,key:'ArrowLeft'}];
let statusBeforePause,lightsOutAt=Infinity;
const startingLives=3;
let lives=startingLives,gameOver=false,replayAt=Infinity;
const guidedDucks=directions.length;
let remainingGuideDirections=[];
let guideFinished=false;
const directionHints={
 left:{file:'Hint_Left',line:"Here it comes from the left."},
 right:{file:'Hint_Right',line:"a zombie duck on the right."},
 front:{file:'Hint_Front',line:"Straight ahead."}
};
const practiceMiss={
 left:{file:'Practice_Left',line:"You should have thrown left. Try again."},
 right:{file:'Practice_Right',line:"You should have thrown right. Try again."},
 front:{file:'Practice_Front',line:"You should have thrown straight ahead. Try again."}
};
let pendingCoaching=null;
const practicePraise=[
 {file:'Practice_Hit',line:"Good job. That will teach him."},
 {file:'Practice_Beak',line:"Right on the beak!"},
 {file:'Practice_Quack',line:"Well thrown."}
];
const story={
 finale:{file:'Final_Attack',line:"And now, the final attack. All three lousy creatures are back. Who’s next?"},
 opening:{file:'Opening_Voice',line:"When you close your eyes, the ducks appear. Where they waddle, throw your ball. You have only one bouncy ball for each animal. Don’t waste it."},
 geese:{file:'Flight_Voice',line:"Well done, little warrior. Now look out for the flying junkie geese."},
 monkeys:{file:'Monkey_Voice',line:"Ah, the unemployed monkeys. they have all day."},
 solo:{file:'On_Your_Own',line:"Now, you are on your own."},
 tickles:{file:'Tickles',line:"Here come the tickles!"},
 two:{file:'Two_Lives',line:"You have two lives left, little warrior."},
 one:{file:'One_Life',line:"You have one life left, little warrior."},
 goodnight:{file:'Goodnight',line:"Goodnight, little warrior. You did your best."},
 victory:{file:'Swamp_Safer',line:"You made the swamp a little safer for tonight. Go to bed, little warrior. You did well."}
};
function narrate(t,cue){
 status.textContent=cue.line;
 return playNarration(t,cue.buffer,null,cue===story.opening);
}
function updateScore(){
 scoreEl.textContent='Animals startled: '+score+' · Lives: '+lives;
 if(round>finaleAfter)scoreEl.textContent+=' · Final attack';
 if(round>=groundRounds&&round<monkeyRound)scoreEl.textContent+=' · Monkeys in '+(monkeyRound-round);
}
const recordedDuckFiles={front:'Duck_Up.wav',left:'Duck_Left.wav',right:'Duck_Right.wav'};
const recordedDucks={};let recordedDuckSource=null,recordedDuckGain=null;
let ballBounce,swampBed,monkeyChatter;
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
  ...[...Object.values(story),...Object.values(directionHints),...Object.values(practiceMiss),...practicePraise].map(async cue=>{cue.buffer=await loadAudioFile(cue.file+'.mp3?v=0.68');}),
  ...Object.entries(recordedDuckFiles).map(async ([direction,file])=>{
   recordedDucks[direction]=await loadAudioFile(file.replace('.wav','.mp3'))||await loadAudioFile(file);
  }),
  loadAudioFile('Ball_Bounce.wav').then(buffer=>{ballBounce=buffer;}),
  loadAudioFile('Fuki_Night.mp3').then(buffer=>{swampBed=buffer;}),
  loadAudioFile('Monkey_Chatter.mp3').then(buffer=>{monkeyChatter=buffer;})
 ]);
}
function stopRecordedDuck(){
 const source=recordedDuckSource,gain=recordedDuckGain;
 if(!source)return;
 recordedDuckSource=recordedDuckGain=null;
 const t=ctx.currentTime;
 gain.gain.cancelScheduledValues(t);
 gain.gain.setTargetAtTime(0,t,.006);
 source.stop(t+.04);
}
function recordedDuckLevel(direction){
 return {front:2.85,left:1.52,right:1.30}[direction.name];
}
function startRecordedDuck(d,approachDuration,voice=duckVoices[2]){
 stopRecordedDuck();
 const buffer=recordedDucks[d.name];
 if(!buffer)return false;
 const source=ctx.createBufferSource(),gain=ctx.createGain();
 const level=recordedDuckLevel(d),t=ctx.currentTime;
 source.buffer=buffer;
 source.playbackRate.value=voice.quackRate;
 gain.gain.setValueAtTime(0,t);
 gain.gain.linearRampToValueAtTime(level,t+.035);
 source.connect(gain).connect(master);
 recordedDuckSource=source;recordedDuckGain=gain;
 source.onended=()=>{
  if(recordedDuckSource===source)recordedDuckSource=recordedDuckGain=null;
  source.disconnect();gain.disconnect();
 };
 source.start(t,Math.max(0,buffer.duration-approachDuration*voice.quackRate));
 return true;
}
const masterLevel=.44;
let ctx,master,roomSend,playing=false,duck=null,balls=[],nextDuckAt=0,last=0,score=0,round=0;
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

const walkingVoices=duckVoices.filter(voice=>!voice.wingbeat);
const flyingVoices=duckVoices.filter(voice=>voice.wingbeat);
const monkeyVoices=[
 {...duckVoices[2],name:'Clerk',monkey:true,clipStart:0,clipLength:.97,quackRate:.91},
 {...duckVoices[0],name:'Temp',monkey:true,clipStart:2.14,clipLength:1.02,quackRate:1.08},
 {...duckVoices[1],name:'Foreman',monkey:true,clipStart:3.51,clipLength:.97,quackRate:.78}
];
const encountersPerLevel=8;
const groundRounds=guidedDucks+encountersPerLevel;
const monkeyRound=groundRounds+encountersPerLevel;
const finaleAfter=monkeyRound+5;
const finalRound=finaleAfter+encountersPerLevel;
let finaleAnnounced=false,finaleRosters=[],creatureBus;
function activeCreatures(){return duck ? [duck] : [];}
const animals={
 duck:{name:'Duck',arrival:'A zombie duck is waddling closer…'},
 goose:{name:'Goose',arrival:'A flying junkie goose is circling overhead…'},
 monkey:{name:'Monkey',arrival:'An unemployed monkey is approaching…'}
};
function animalFor(voice){return voice.monkey?animals.monkey:voice.wingbeat?animals.goose:animals.duck;}
let monkeysAnnounced=false;
let remainingVoices=[],lastVoice,currentRoster,flightRounds=0,flightAnnounced=false;
function makeFinaleRosters(){
 const species=[walkingVoices,flyingVoices,monkeyVoices];
 // Give each species a turn at being the rarer visitor on replay.
 const rotation=Math.floor(Math.random()*species.length);
 const bag=Array.from({length:encountersPerLevel},(_,i)=>species[(i+rotation)%species.length]);
 for(let i=bag.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [bag[i],bag[j]]=[bag[j],bag[i]];
 }
 return bag;
}
function nextDuckVoice(){
 const roster=finaleAnnounced ? finaleRosters.pop() : round>=monkeyRound ? monkeyVoices : round<groundRounds ? walkingVoices : flyingVoices;
 if(roster===flyingVoices)flightRounds++;
 if(roster!==currentRoster||!remainingVoices.length)remainingVoices=[...roster];
 currentRoster=roster;
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
 if(voice.monkey && monkeyChatter && (type==='quack'||type==='yelp')){
  const call=ctx.createBufferSource(),level=ctx.createGain();
  call.buffer=monkeyChatter;
  call.playbackRate.value=voice.quackRate*(type==='yelp'?1.22:rand(.96,1.04));
  level.gain.value=volume*2.5;
  call.connect(level).connect(p);
  call.onended=()=>{call.disconnect();level.disconnect();};
  call.start(Math.max(ctx.currentTime,at),voice.clipStart,voice.clipLength);
  return;
 }
 const isDuck=type==='quack'||type==='retreat';
 const impactDuration=type==='firstHit' ? .15 : .48;
 const dur=isDuck?(.46*voice.tempo):(type==='throw'?.13:type==='yelp'?.52/voice.quackRate:(type==='hit'||type==='firstHit')?impactDuration:type==='tickle'?rand(.34,.47)*voice.tempo:type==='water'?.24:type==='wingbeat'?.105:type==='footstep'?.135:type==='bounce'?.19:.31);
 const buf=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate),data=buf.getChannelData(0);
 let phase=0,subPhase=0;let noiseState=0,noiseFast=0;
 const soft=(x)=>Math.max(0,Math.min(1,x));
 const bell=(u,a,b)=>{const x=soft((u-a)/(b-a));return Math.sin(Math.PI*x)**1.6;};
 const accent=rand(.91,1.09),variation=rand(.94,1.06);
 for(let i=0;i<data.length;i++){
  const t=i/ctx.sampleRate,u=t/dur;
  let f=250,v=0;
  if(voice.monkey&&(isDuck||type==='yelp')){
   const chatter=Math.sin(Math.PI*u)**.65*(.25+.75*Math.sin(Math.PI*3*u)**2);
   f=voice.base*(1.6+.95*Math.sin(2*Math.PI*u)+.12*Math.sin(2*Math.PI*5*u));
   v=chatter*(.46*Math.sin(phase)+.20*Math.sin(phase*3));
  }else if(voice.wingbeat && isDuck){
   // A goose opens its beak on a low reed note, then pinches the note shut.
   const breath=bell(u,0,.26),honk=bell(u,.07,.78),catchNote=bell(u,.72,.99);
   f=(136+voice.base*.19)*variation*(.92+.35*honk-.14*u+.23*catchNote);
   noiseFast+=.24*(Math.random()*2-1-noiseFast);
   const reed=.34*Math.sin(phase)+.24*Math.sin(phase*3)+.095*Math.sin(phase*5);
   v=(honk+.53*catchNote)*reed+.17*breath*noiseFast;
  }else if(isDuck){
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
  }else if(type==='footstep' && voice.monkey){
   // A palm on hollow wood followed by the lighter fingertips.
   const palm=bell(u,0,.46),fingers=bell(u,.48,.83);
   f=(190+voice.base*.35)*variation*(1-.42*u);
   noiseFast+=.42*(Math.random()*2-1-noiseFast);
   v=palm*(.31*Math.sin(phase)+.46*noiseFast)+fingers*(.14*Math.sin(2*phase)+.30*noiseFast);
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
  }else if(type==='hit'||type==='firstHit'){
   // The slap lands first, followed by a low rubber thump and a rising squeak.
   f=135+220*Math.exp(-t*42)+290*bell(u,.07,.68);
   noiseFast=.42*noiseFast+.58*(Math.random()*2-1);
   const smack=.95*noiseFast*Math.exp(-t*92);
   const thump=.8*Math.sin(phase)*Math.exp(-t*29);
   const squeak=bell(u,.055,.72)*(.45*Math.sin(subPhase)+.12*Math.sin(subPhase*2));
   v=smack+thump+squeak;
  }else if(type==='tickle'){
   const grain=Math.random()*2-1;
   noiseFast+=.38*(grain-noiseFast);
   noiseState+=.065*(noiseFast-noiseState);
   const rustle=noiseFast-noiseState;
   if(voice.monkey){
    // Three fingertip taps, with a chattering little chuckle between them.
    const taps=bell(u,0,.12)+.8*bell(u,.16,.29)+.65*bell(u,.34,.47);
    const laugh=bell(u,.24,.49)+.8*bell(u,.52,.76)+.5*bell(u,.79,.98);
    f=voice.base*(1.25+.85*laugh)*voice.quackRate*variation;
    v=taps*(.74*rustle+.30*Math.sin(phase))+
      laugh*(.35*Math.sin(phase)+.14*Math.sin(phase*3)+.12*noiseFast);
   }else if(voice.wingbeat){
    // A broad wing sweep with a breathy, pinched double honk.
    const sweep=bell(u,0,.63)+.56*bell(u,.49,.99);
    const honk=bell(u,.18,.43)+.72*bell(u,.56,.81);
    f=voice.base*(.68+.23*honk-.15*u)*variation;
    v=sweep*(.88*rustle+.38*noiseState)+honk*(.27*Math.sin(phase)+.19*Math.sin(3*phase));
   }else{
    // A damp feather brushing the cheek, followed by a swallowed quack.
    const brush=bell(u,0,.43)+.63*bell(u,.25,.62);
    const giggle=.72*bell(u,.43,.63)+bell(u,.68,.91);
    f=voice.base*(.93+.54*giggle+.12*Math.sin(2*Math.PI*u))*variation;
    const cheek=.46*Math.sin(phase)+.17*Math.sin(2*phase)+.08*Math.sin(3*phase);
    v=brush*rustle*(.51+.18*Math.sin(2*Math.PI*voice.wobble*t))+
      giggle*(cheek+.22*noiseFast)+.22*bell(u,.58,.78)*noiseState;
   }
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
 return src;
}
function init(){const Audio=window.AudioContext||window.webkitAudioContext;try{ctx=new Audio({sampleRate:48000,latencyHint:'interactive'});}catch(e){ctx=new Audio();}master=ctx.createGain();master.gain.value=masterLevel;const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=6;limiter.ratio.value=3;limiter.attack.value=.004;limiter.release.value=.16;master.connect(limiter).connect(ctx.destination);
const impulse=ctx.createBuffer(2,Math.floor(ctx.sampleRate*.38),ctx.sampleRate);for(let c=0;c<2;c++){const a=impulse.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/ctx.sampleRate*15)*.12;}const verb=ctx.createConvolver();verb.buffer=impulse;roomSend=ctx.createGain();roomSend.gain.value=.105;roomSend.connect(verb).connect(master);
// Short, asymmetrical wall reflections give the empty room a sense of size.
for(const [delayTime,pan,level] of [[.037,-.72,.16],[.061,.65,.12],[.104,-.25,.08]]){
 const delay=ctx.createDelay(.3),reflection=ctx.createGain(),stereo=ctx.createStereoPanner();
 delay.delayTime.value=delayTime;reflection.gain.value=level;stereo.pan.value=pan;
 roomSend.connect(delay).connect(reflection).connect(stereo).connect(master);
}
const L=ctx.listener;if(L.positionX){L.positionX.value=0;L.positionY.value=0;L.positionZ.value=0;L.forwardX.value=0;L.forwardY.value=0;L.forwardZ.value=-1;L.upX.value=0;L.upY.value=1;L.upZ.value=0;}else {L.setPosition(0,0,0);L.setOrientation(0,0,-1,0,1,0);}
creatureBus=makeCreatureBus();
startNightAmbience();
}
function makeCreatureBus(){
 const duckPanner=panner(),duckFilter=ctx.createBiquadFilter(),duckGain=ctx.createGain();
 const duckNotch=ctx.createBiquadFilter(),duckPresence=ctx.createBiquadFilter();
 duckFilter.type='lowpass';duckFilter.frequency.value=4000;duckGain.gain.value=1.2;
 duckNotch.type='peaking';duckNotch.Q.value=2.1;duckNotch.frequency.value=6900;duckNotch.gain.value=-2;
 duckPresence.type='highshelf';duckPresence.frequency.value=3900;
 duckFilter.connect(duckNotch).connect(duckPresence).connect(duckGain).connect(duckPanner);
 const duckDirect=ctx.createGain(),duckRearSend=ctx.createGain(),duckRearDelay=ctx.createDelay(.25);
 const duckRearFilter=ctx.createBiquadFilter();
 duckRearFilter.type='lowpass';duckRearFilter.frequency.value=1850;duckRearDelay.delayTime.value=.046;
 duckPanner.connect(duckDirect).connect(master);
 duckPanner.connect(roomSend);
 const duckFrontReflection=ctx.createGain(),duckBackReflection=ctx.createGain();
 for(const [send,delayTime,cutoff,pan] of [[duckFrontReflection,.022,7200,-.35],[duckBackReflection,.073,1750,.38]]){
  const delay=ctx.createDelay(.2),tone=ctx.createBiquadFilter(),stereo=ctx.createStereoPanner();
  delay.delayTime.value=delayTime;tone.type='lowpass';tone.frequency.value=cutoff;stereo.pan.value=pan;
  duckPanner.connect(send).connect(delay).connect(tone).connect(stereo).connect(master);
 }
 duckPanner.connect(duckRearSend).connect(duckRearDelay).connect(duckRearFilter).connect(master);
 return {duckPanner,duckFilter,duckDirect,duckRearSend,duckNotch,duckPresence,duckFrontReflection,duckBackReflection};
}
let landscape,swampSpeechEQ,windLevel,windTone,nextGustAt=0,nextInsectAt=0;
function startNightAmbience(){
 landscape=ctx.createGain();
 swampSpeechEQ=ctx.createBiquadFilter();
 swampSpeechEQ.type='peaking';
 swampSpeechEQ.frequency.value=2200;
 swampSpeechEQ.Q.value=.85;
 landscape.connect(swampSpeechEQ).connect(master);
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
 source.connect(windTone).connect(windLevel).connect(landscape);
 source.start();
 nextInsectAt=ctx.currentTime+rand(3,8);
}
let nextSwampPhrase=0,nextWaterDrop=0,nextFrogAt=0,lastSwampOffset;
function distantFrog(t){
 const bank=panner(),tone=ctx.createBiquadFilter(),level=ctx.createGain();
 pos(bank,-3.1,-.45,3.7);
 tone.type='lowpass';tone.frequency.value=920;
 const throat=ctx.createOscillator();
 throat.type='triangle';
 throat.connect(tone).connect(level).connect(bank);bank.connect(landscape);
 const count=Math.random()<.6?2:3,root=rand(133,166);
 let end=t;
 for(let call=0;call<count;call++){
  const at=end+(call?rand(.13,.31):0),length=rand(.09,.17);
  throat.frequency.setValueAtTime(root*.86,at);
  throat.frequency.exponentialRampToValueAtTime(root*1.24,at+.027);
  throat.frequency.exponentialRampToValueAtTime(root*.80,at+length);
  level.gain.setValueAtTime(.0001,at);
  level.gain.exponentialRampToValueAtTime(.065/(1+call*.28),at+.022);
  level.gain.exponentialRampToValueAtTime(.0001,at+length);
  end=at+length;
 }
 throat.start(t);throat.stop(end+.02);
 throat.onended=()=>{throat.disconnect();tone.disconnect();level.disconnect();bank.disconnect();};
}
// Equal-power envelopes keep the level steady across unrelated stereo excerpts.
const swampFadeIn=Float32Array.from({length:33},(_,i)=>.24*Math.sin(i*Math.PI/64));
const swampFadeOut=Float32Array.from(swampFadeIn).reverse();
function updateSwamp(t){
 if(!nextFrogAt)nextFrogAt=t+rand(10,17);
 if(t>=nextFrogAt){distantFrog(t);nextFrogAt=t+rand(16,34);}
 // Crossfade different stretches of the original binaural stereo field.
 if(t+.12>=nextSwampPhrase){
  const start=Math.max(t,nextSwampPhrase);
  const duration=rand(15,23),fade=3;
  const halfway=(swampBed.duration-duration)/2;
  const offset=lastSwampOffset===undefined||lastSwampOffset>=halfway
   ?rand(0,halfway):rand(halfway,halfway*2);
  lastSwampOffset=offset;
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  source.buffer=swampBed;
  source.connect(gain).connect(landscape);
  gain.gain.setValueCurveAtTime(swampFadeIn,start,fade);
  gain.gain.setValueCurveAtTime(swampFadeOut,start+duration-fade,fade);
  source.onended=()=>{source.disconnect();gain.disconnect();};
  source.start(start,offset,duration);
  nextSwampPhrase=start+duration-fade;
 }
 if(t>=nextWaterDrop){
  nextWaterDrop=t+rand(5,17);
  const drop=panner(),angle=rand(-Math.PI,Math.PI),distance=rand(1.6,3.5);
  pos(drop,Math.sin(angle)*distance,-.8,Math.cos(angle)*distance);
  drop.connect(landscape);
  sound('water',t,drop,rand(.012,.028));
  setTimeout(()=>drop.disconnect(),500);
 }
}
let nextBowlAt=0,lastBowlOnset=-Infinity;
function playSingingBowl(at,treatAsCue=false){
 if(treatAsCue && lastBowlOnset>=at-.08)return lastBowlOnset;
 const root=[146.83,164.81,196][Math.floor(rand(0,3))];
 const duration=rand(9,13),onset=Math.max(at,ctx.currentTime+.025);
 const stereo=ctx.createChannelMerger(2),tail=ctx.createGain();
 tail.gain.setValueAtTime(0,onset);
 tail.gain.linearRampToValueAtTime(.028,onset+.30);
 tail.gain.setValueAtTime(.028,onset+duration-1.4);
 tail.gain.linearRampToValueAtTime(0,onset+duration);
 stereo.connect(tail).connect(master);
 let ringing=6;
 for(const [ratio,amplitude,decay] of [[1,.84,4.8],[2.73,.12,2.3],[5.34,.04,.9]]){
  for(let ear=0;ear<2;ear++){
   const mode=ctx.createOscillator(),level=ctx.createGain();
   mode.frequency.value=root*ratio+(ear===0?-1:1);
   level.gain.setValueAtTime(amplitude,onset);
   level.gain.exponentialRampToValueAtTime(amplitude*Math.exp(-duration/decay),onset+duration);
   mode.connect(level);level.connect(stereo,0,ear);
   mode.onended=()=>{
    mode.disconnect();level.disconnect();
    if(--ringing===0){stereo.disconnect();tail.disconnect();}
   };
   mode.start(onset);mode.stop(onset+duration);
  }
 }
 lastBowlOnset=onset;
 nextBowlAt=onset+rand(21,38);
 return onset;
}
function moveNarrator(location,direction,at,duration){
 const center=direction?Math.atan2(direction.x,-direction.z):-.06;
 const sweep=(direction ? .13 : .21)*(Math.random()<.5?-1:1);
 const radius=direction?1.32:1.12;
 function positionAt(u){
  const angle=center-sweep*Math.cos(Math.PI*u);
  const lean=Math.sin(Math.PI*u);
  const distance=radius-.13*lean;
  return [Math.sin(angle)*distance,.06+.10*lean,-Math.cos(angle)*distance];
 }
 pos(location,...positionAt(0));
 if(location.positionX){
  const axes=[location.positionX,location.positionY,location.positionZ];
  const segments=Math.max(12,Math.ceil(duration*6));
  for(let i=0;i<=segments;i++){
   const u=i/segments,point=positionAt(u);
   for(let axis=0;axis<3;axis++){
    if(i===0)axes[axis].setValueAtTime(point[axis],at);
    else axes[axis].linearRampToValueAtTime(point[axis],at+duration*u);
   }
  }
 }else{
  // Older panners expose setPosition only. Follow the audio clock through pauses.
  const follow=()=>{
   const u=Math.min(1,Math.max(0,(ctx.currentTime-at)/duration));
   pos(location,...positionAt(u));
   if(u<1)requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
 }
}
function playNarration(t,buffer,direction=null,opening=false){
 const at=playSingingBowl(t,true)+.8;
 if(opening)lightsOutAt=at;
 if(!buffer)return at+.15;
 const voice=ctx.createBufferSource(),level=ctx.createGain(),location=panner();
 moveNarrator(location,direction,at,buffer.duration);
 level.gain.value=.90;
 voice.buffer=buffer;
 voice.connect(level).connect(location);
 location.connect(master);
 location.connect(roomSend);
 voice.onended=()=>{voice.disconnect();level.disconnect();location.disconnect();};
 if(landscape){
  // Leave the marsh audible around the guide. Make most of the space in the speech band.
  for(const [param,rest,underVoice] of [[landscape.gain,1,.93],[swampSpeechEQ.gain,0,-2.6]]){
   const attack=at-.16;
   if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(attack);
   else {param.cancelScheduledValues(attack);param.setValueAtTime(rest,attack);}
   param.linearRampToValueAtTime(underVoice,at);
   param.setValueAtTime(underVoice,at+buffer.duration);
   param.linearRampToValueAtTime(rest,at+buffer.duration+.5);
  }
 }
 voice.start(at);
 return at+buffer.duration+.55;
}
function updateNightAmbience(t){
 if(!gameOver&&t>=nextBowlAt)playSingingBowl(t);
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
function approachSpeed(duck){return Math.min(3.7,1.1+Math.max(0,round-1)*.19)*duck.voice.walkRate;}
function spawnGap(){
 if(currentRoster===flyingVoices){
  // Leave silence after the goose has retreated, then tighten the gaps.
  const retreatTime=(13-duck.distance)/(duck.escapeSpeed*duck.voice.walkRate);
  const minimumQuiet=Math.max(1.3,3.1-.6*(flightRounds-1));
  return retreatTime+rand(minimumQuiet,minimumQuiet+1.5);
 }
 // A quick follow-up can arrive over the previous duck's swear.
 return Math.random()<.35 ? rand(.16,.48) : rand(.85,3.6);
}
function introduceMonkey(t){
 const perch=panner();
 pos(perch,duck.direction.x*2.2,1.3,duck.direction.z*2.2);
 perch.connect(master);
 sound('quack',t,perch,1,duck.voice);
 duck.nextQuack=t+1.25;
 setTimeout(()=>perch.disconnect(),2000);
}
let lastDirection=null,directionStreak=0;
function nextDirection(){
 let chosen;
 if(remainingGuideDirections.length){
  const index=Math.floor(Math.random()*remainingGuideDirections.length);
  [chosen]=remainingGuideDirections.splice(index,1);
 }else{
  const choices=directionStreak>=2 ? directions.filter(d=>d!==lastDirection) : directions;
  chosen=choices[Math.floor(Math.random()*choices.length)];
 }
 directionStreak=chosen===lastDirection ? directionStreak+1 : 1;
 lastDirection=chosen;
 return chosen;
}
function createCreature(direction,voice,bus){
 const t=ctx.currentTime;
 return {direction,voice,bus,distance:10,mode:'approach',nextQuack:t+.15,nextStep:t+.12,stepCount:0,escapeSpeed:9.5};
}
function beginApproach(direction,voice){
 duck=createCreature(direction,voice,creatureBus);
 duck.recorded=!voice.monkey&&!voice.wingbeat&&startRecordedDuck(direction,(duck.distance-1.35)/approachSpeed(duck),voice);
 status.textContent=animalFor(voice).arrival;
}
function spawn(){
 const t=ctx.currentTime;
 if(round>=finalRound){endGame(t,story.victory,'GAME_COMPLETE');return;}
 if(round===finaleAfter&&!finaleAnnounced){
  finaleAnnounced=true;
  finaleRosters=makeFinaleRosters();
  nextDuckAt=narrate(t,story.finale);
  return;
 }
 if(round===guidedDucks&&!guideFinished){
  guideFinished=true;
  nextDuckAt=narrate(t,story.solo);
  return;
 }
 if(round>=groundRounds&&!flightAnnounced){
  flightAnnounced=true;
  nextDuckAt=narrate(t,story.geese);
  return;
 }
 if(round>=monkeyRound&&!monkeysAnnounced){
  monkeysAnnounced=true;
  nextDuckAt=narrate(t,story.monkeys);
  return;
 }
 const direction=nextDirection(),voice=nextDuckVoice();
 round++;
 beginApproach(direction,voice);
 logEvent('SPAWN',{direction:direction.name,voice:voice.name,distance:duck.distance,speed:approachSpeed(duck)});
 if(round===monkeyRound+1)introduceMonkey(t);
 updateScore();
 if(round<=guidedDucks){
  const hint=directionHints[direction.name];
  duck.hintUntil=playNarration(t,hint.buffer,direction);
  if(duck.recorded && hint.buffer){
   // Keep the feet audible under the guide, then bring this duck into focus.
   const gain=recordedDuckGain.gain;
   const level=recordedDuckLevel(direction);
   gain.cancelScheduledValues(t);
   gain.setValueAtTime(0,t);
   gain.linearRampToValueAtTime(level*.68,t+.06);
   gain.setValueAtTime(level*.68,duck.hintUntil-.48);
   gain.linearRampToValueAtTime(level,duck.hintUntil+.12);
  }
  status.textContent+=' '+hint.line;
 }
}
let lastEvent='No throws yet';const eventLog=[];let throwCounter=0;
function logEvent(kind,details={}){const entry={time:new Date().toISOString(),round,kind,...details};eventLog.push(entry);if(eventLog.length>300)eventLog.shift();lastEvent=kind+' '+JSON.stringify(details);renderDebug();}
function exportLog(){const payload={version:'0.68',exportedAt:new Date().toISOString(),events:eventLog};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='zombie-ducks-debug-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#downloadLog').addEventListener('click',exportLog);
function throwBall(d){
 const target=duck;
 if(gameOver||!target||target.mode!=='approach'||target.ballThrown)return;
 target.ballThrown=true;
 const p=panner();p.connect(master);p.connect(roomSend);
 const ball={id:++throwCounter,p,d,target,distance:0,age:0,lastBounce:0,nextBounce:.24,bounces:0,active:true};
 balls.push(ball);pos(p,d.x*.8,.1,d.z*.8);sound('throw',ctx.currentTime,p,.42);
 logEvent('THROW',{ball:ball.id,direction:d.name,duckDirection:target.direction.name,duckDistance:target.distance});
 status.textContent='The ball skips '+(d.name==='front'?'straight ahead':d.name)+'…';
 if(d!==target.direction){ball.active=false;startChase(target,ctx.currentTime);logEvent('MISS_WRONG_DIRECTION',{ball:ball.id,thrown:d.name,duck:target.direction.name});}
}
function queueCoaching(cue,at){
 pendingCoaching={cue,direction:duck.direction,at:Math.max(at,duck.hintUntil||0)};
 nextDuckAt=Infinity;
}
function correctPracticeThrow(t){
 stopRecordedDuck();
 duck.mode='practiceRetry';
 duck.nextQuack=Infinity;
 queueCoaching(practiceMiss[duck.direction.name],t+.15);
}
function updateCoaching(t){
 if(pendingCoaching && t>=pendingCoaching.at){
  const {cue,direction}=pendingCoaching;
  pendingCoaching=null;
  status.textContent=cue.line;
  const done=playNarration(t,cue.buffer,direction);
  if(practicePraise.includes(cue))nextDuckAt=done;
  else duck.retryAt=done;
 }
 if(duck?.mode==='practiceRetry' && t>=duck.retryAt){
  beginApproach(duck.direction,duck.voice);
 }
}
function startChase(duck,t){
 if(round<=guidedDucks){correctPracticeThrow(t);return;}
 status.textContent='Miss! Here come the tickles!';
 if(duck.recorded)stopRecordedDuck();
 duck.recorded=false;
 duck.mode='chase';
 duck.nextQuack=t+.08;
}
function startTickle(duck,t){
 if(round<=guidedDucks){
  for(const ball of balls)ball.active=false;
  correctPracticeThrow(t);
  return;
 }
 duck.mode='tickle';
 const {direction,voice}=duck;
 const spacing=(voice.monkey?.27:voice.wingbeat?.42:.35)*voice.tempo;
 let at=t;
 for(let stroke=0;stroke<4;stroke++){
  const brush=panner();
  const side=stroke%2===0?1:-1;
  const x=stroke===0?direction.x*.55:side*(direction.x||1)*rand(.30,.52);
  const z=stroke===0?direction.z*.55:-.26;
  pos(brush,x,voice.wingbeat?.34:.02,z);
  brush.connect(master);
  const source=sound('tickle',at,brush,.66,voice);
  source.addEventListener('ended',()=>brush.disconnect());
  duck.tickleUntil=at+source.buffer.duration;
  at+=spacing*rand(.92,1.08);
 }
 stopRecordedDuck();
 duck.recorded=false;
 const warningEnd=narrate(Math.max(t,duck.hintUntil||0),story.tickles);
 duck.tickleUntil=Math.max(duck.tickleUntil+.08,warningEnd);
}
function endGame(t,cue,event){
 lightsOutAt=Infinity;
 document.body.classList.remove('night-listening');
 stopRecordedDuck();
 duck=null;
 gameOver=true;
 replayAt=narrate(t,cue);
 // Let the last words and their reflections hang before the marsh falls quiet.
 master.gain.setValueAtTime(masterLevel,replayAt);
 master.gain.linearRampToValueAtTime(0,replayAt+3.5);
 button.disabled=true;delete button.dataset.mode;
 button.textContent='Good night…';
 logEvent(event,{lives,score});
}
function updateTickle(creature,t){
 if(t<creature.tickleUntil)return;
 lives--;
 updateScore();
 logEvent('TICKLED',{lives});
 if(!lives){endGame(t,story.goodnight,'GAME_OVER');return;}
 nextDuckAt=narrate(t,lives===2?story.two:story.one);
 if(creature.voice.monkey){
  creature.mode='retreat';
  creature.nextStep=t;
  creature.nextQuack=Infinity;
 }else duck=null;
}
function playRecordedRetreat(buffer,voice,direction,at){
 const duration=Math.min(buffer.duration,1.15*voice.quackRate);
 const length=duration/voice.quackRate;
 const source=ctx.createBufferSource(),gain=ctx.createGain();
 source.buffer=buffer;
 source.playbackRate.value=voice.quackRate;
 source.connect(gain).connect(master);
 const level=direction.name==='front'?.85:.43;
 gain.gain.setValueAtTime(0,at);
 gain.gain.linearRampToValueAtTime(level,at+.07);
 gain.gain.exponentialRampToValueAtTime(.001,at+length);
 source.onended=()=>{source.disconnect();gain.disconnect();};
 source.start(at,buffer.duration-duration,duration);
}
function hitDuck(ball,t){
 const duck=ball.target;
 const firstHit=score===0;
 // On the first hit the short slap ends before the duck answers.
 const replyAt=t+(firstHit ? .255 : .045);
 const retreatAt=replyAt+.52/duck.voice.quackRate+.045;
 const introducesLevel=round===groundRounds || round===monkeyRound || round===finaleAfter;
 nextDuckAt=Math.max(duck.voice.monkey||finaleAnnounced?t:t+spawnGap(),duck.hintUntil||0,introducesLevel?t+1.15:t);
 if(firstHit)nextDuckAt=Math.max(nextDuckAt,retreatAt);
 const retreatBuffer=duck.recorded?recordedDucks[duck.direction.name]:null;
 duck.mode='retreat';if(duck.recorded)stopRecordedDuck();duck.recorded=false;duck.nextQuack=retreatAt;
 if(firstHit)duck.nextStep=retreatAt;
 score++;updateScore();
 status.textContent=duck.voice.monkey?'The monkey has a few words for you.':duck.voice.wingbeat?'A honk of protest overhead.':'One very offended duck.';logEvent('HIT',{ball:ball.id,direction:ball.d.name,distance:duck.distance});
 const impactDistance=Math.min(duck.distance,3.5);
 pos(ball.p,ball.d.x*impactDistance,duck.voice.wingbeat?3.6:0,ball.d.z*impactDistance);
 sound(firstHit?'firstHit':'hit',t,ball.p,1.25);
 sound('yelp',replyAt,ball.p,1.35,duck.voice);
 if(retreatBuffer){
  // Two wet footfalls trail the same voice away from the listener.
  const firstStepAt=firstHit ? retreatAt+.07 : t+.27;
  for(const [delay,distance,volume] of [[0,1.7,.14],[.26,3.5,.10]]){
   const ripple=panner();
   pos(ripple,duck.direction.x*distance,-.55,duck.direction.z*distance);
   ripple.connect(master);
   const plip=sound('water',firstStepAt+delay,ripple,volume);
   plip.addEventListener('ended',()=>ripple.disconnect());
  }
  playRecordedRetreat(retreatBuffer,duck.voice,duck.direction,duck.nextQuack);
  duck.nextQuack=Infinity;
 }
 if(round<=guidedDucks)queueCoaching(practicePraise[round-1],retreatAt+.12);
 ball.age=999;ball.bounces=99;ball.active=false;
}
function updateCreature(duck,dt,t){
 const {duckPanner,duckFilter,duckDirect,duckRearSend,duckNotch,duckPresence,duckFrontReflection,duckBackReflection}=duck.bus;
 duck.previousDistance=duck.distance;
 if(duck.mode==='approach'){
  duck.distance=Math.max(1.35,duck.distance-dt*approachSpeed(duck));
 }else if(duck.mode==='chase'){
  duck.distance=Math.max(.65,duck.distance-dt*5.6*duck.voice.walkRate);
  if(duck.distance<=.68)startTickle(duck,t);
 }else if(duck.mode==='retreat')duck.distance+=dt*duck.escapeSpeed*duck.voice.walkRate;
const flying=Boolean(duck.voice.wingbeat);
// Settle lower as the goose closes the distance. The throw lane stays fixed.
const flightHeight=1.65+.12*Math.min(10,duck.distance)+.34*Math.sin(t*2.1);
const flightDrift=flying?.26*Math.sin(2.25*t)*Math.min(1,duck.distance/4):0;
pos(duckPanner,duck.direction.x*duck.distance-duck.direction.z*flightDrift,
 flying?flightHeight:-.32,duck.direction.z*duck.distance+duck.direction.x*flightDrift);
duckDirect.gain.setTargetAtTime(duck.direction.z>0?.63:1,t,.07);
duckRearSend.gain.setTargetAtTime(duck.direction.z>0?.20:.02,t,.07);
duckFrontReflection.gain.setTargetAtTime(duck.direction.z<0?.14:.018,t,.07);
duckBackReflection.gain.setTargetAtTime(duck.direction.z>0?.25:.018,t,.07);
duckNotch.frequency.setTargetAtTime(duck.direction.z>0?5700:duck.direction.z<0?8400:6800,t,.06);
duckNotch.gain.setTargetAtTime(duck.direction.z>0?-11:duck.direction.z<0?-3:-5,t,.06);
duckPresence.gain.setTargetAtTime(duck.direction.z>0?-5:duck.direction.z<0?3:0,t,.06);
if(duck.mode==='approach'||duck.mode==='chase'||duck.mode==='retreat'){
 if(t>=duck.nextStep){
  // The footsteps share the moving HRTF panner with the duck's voice.
  const gait=flying?duck.voice.wingbeat*rand(.85,1.15):duck.mode==='chase'?.16/duck.voice.walkRate:duck.mode==='retreat'?.19/duck.voice.walkRate:Math.max(.19,.37*1.1/approachSpeed(duck));
  const offset=duck.stepCount%2===0?-.14:.14;
  const stepPanner=panner();pos(stepPanner,duck.direction.x*duck.distance+(duck.direction.z!==0?offset:0),flying?flightHeight:-.72,duck.direction.z*duck.distance+(duck.direction.x!==0?offset:0));
  const stepTone=ctx.createBiquadFilter();stepTone.type='lowpass';stepTone.frequency.value=duck.direction.z>0?1100:duck.direction.z<0?7800:4200;stepTone.Q.value=.65;stepTone.connect(stepPanner);stepPanner.connect(master);stepPanner.connect(roomSend);
  if(duck.direction.z>0){const reflection=ctx.createDelay(.2),rg=ctx.createGain();reflection.delayTime.value=.055;rg.gain.value=.24;stepTone.connect(reflection).connect(rg).connect(master);setTimeout(()=>{reflection.disconnect();rg.disconnect();},350);}
  const footfall=sound(flying?'wingbeat':'footstep',t,stepTone,flying?1.05:duck.recorded?.36:duck.mode==='chase'?.78:.62,duck.voice);
  // Disconnect after the brief footfall has finished.
  footfall.addEventListener('ended',()=>{stepTone.disconnect();stepPanner.disconnect();});
  duck.stepCount++;duck.nextStep=t+gait*(duck.stepCount%2===0?1.08:.92);
 }
}
duckFilter.frequency.setTargetAtTime(Math.max(900,(duck.direction.z>0?2350:duck.direction.z<0?9000:6000)/(1+duck.distance*.075)),t,.06);
if(duck.mode==='tickle'){updateTickle(duck,t);}else if(t>=duck.nextQuack){if(!duck.recorded)sound('quack',t+.01,duckFilter,duck.mode==='retreat'?.43:duck.mode==='chase'?.8:.68,duck.voice);duck.nextQuack=t+(duck.mode==='retreat'?.55:duck.mode==='chase'?rand(.22,.38):rand(.8,1.35))/duck.voice.quackRate;}
}

function finishRetreat(creature,t){
 const lifeCuePlaying=creature.voice.monkey && t<nextDuckAt && creature.nextQuack===Infinity;
 if(creature.voice.monkey||finaleAnnounced){
  const quiet=finaleAnnounced && !creature.voice.monkey ? rand(.65,1.85) : rand(2.25,3.75);
  nextDuckAt=Math.max(nextDuckAt,t+quiet);
 }
 duck=null;
 if(round>guidedDucks&&!lifeCuePlaying&&!(flightAnnounced&&flightRounds===0)&&!(monkeysAnnounced&&round===monkeyRound))status.textContent='Listening…';
}
function advanceBalls(dt,t){
 for(const ball of balls){
  if(ball.age>=999)continue;
  const target=ball.target,previousDistance=ball.distance;
  ball.age+=dt;ball.distance+=dt*12.5;
  const phase=Math.min(1,(ball.age-ball.lastBounce)/(ball.nextBounce-ball.lastBounce));
  const height=1.55*Math.pow(.78,ball.bounces)*Math.sin(Math.PI*phase);
  pos(ball.p,ball.d.x*ball.distance,-.7+height,ball.d.z*ball.distance);
  if(ball.active&&target.mode==='approach'&&ball.d===target.direction){
   if(previousDistance<=target.previousDistance+.6&&ball.distance>=target.distance-.6){
    hitDuck(ball,t);
    continue;
   }
  }
  if(ball.active&&ball.distance>=14){
   ball.active=false;
   logEvent('MISS_OUT_OF_RANGE',{ball:ball.id,direction:ball.d.name,distance:ball.distance,duckDistance:target.distance});
   if(target.mode==='approach')startChase(target,t);
  }
  if(ball.age>=ball.nextBounce&&ball.bounces<6){
   pos(ball.p,ball.d.x*ball.distance,-.7,ball.d.z*ball.distance);
   bounce(t,ball.p,.70*Math.pow(.72,ball.bounces));
   ball.bounces++;ball.lastBounce=ball.age;
   ball.nextBounce=ball.age+Math.max(.075,.28*Math.pow(.82,ball.bounces));
  }
 }
 balls=balls.filter(ball=>ball.age<4&&(ball.active||ball.bounces<6));
}
function tick(now){
 try{
  const dt=Math.min((now-last)/1000,.06);
  last=now;
  if(!playing||!ctx)return;
  const t=ctx.currentTime;
  if(t>=lightsOutAt){
   document.body.classList.add('night-listening');
   lightsOutAt=Infinity;
  }
  if(!gameOver||t<replayAt&&Number.isFinite(replayAt))updateNightAmbience(t);
  if(gameOver){
   if(t>=replayAt){button.disabled=false;button.textContent='Play again';replayAt=Infinity;}
   return;
  }
  updateCoaching(t);
  if((!duck||(!finaleAnnounced&&duck.mode==='retreat'&&!duck.voice.monkey))&&t>=nextDuckAt)spawn();
  for(const creature of activeCreatures()){
   updateCreature(creature,dt,t);
   if(gameOver)return;
   if(creature.mode==='retreat'&&creature.distance>13)finishRetreat(creature,t);
  }
  advanceBalls(dt,t);
  if(duck?.mode==='approach'&&duck.distance<=1.36){
   startTickle(duck,t);
   logEvent('TICKLE_REACHED_PLAYER',{direction:duck.direction.name});
  }
  renderDebug();
 }catch(error){
  const message=String(error&&error.stack||error);
  console.error('Duck game loop error',error);
  lastEvent='ERROR '+message;eventLog.push({time:new Date().toISOString(),round,kind:'RUNTIME_ERROR',message});
  status.textContent='Game error — open debug and download log';debug.hidden=false;debugToggle.textContent='Hide debug radar (D)';
  try{renderDebug()}catch(e){telemetry.textContent=message;}
 }finally{requestAnimationFrame(tick);}
}
async function togglePause(){
 if(!ctx||gameOver||button.dataset.mode!=='playing'||button.disabled)return;
 button.disabled=true;
 try{
  if(playing){
   statusBeforePause=status.textContent;playing=false;
   await ctx.suspend();status.textContent='Paused';button.textContent='Resume';
  }else{
   await ctx.resume();playing=true;status.textContent=statusBeforePause;button.textContent='Pause';
  }
 }finally{button.disabled=false;}
}
button.addEventListener('click',async()=>{
 if(button.dataset.mode==='playing'){await togglePause();return;}
 button.disabled=true;
if(!ctx){
 init();
 await ctx.resume();
 button.textContent='Loading audio…';
 status.textContent='Loading game audio…';
 await loadGameAudio();
}else{
 await ctx.resume();
}if(gameOver){
 const at=ctx.currentTime;
 const level=master.gain.value;
 master.gain.cancelScheduledValues(at);
 master.gain.setValueAtTime(level,at);
 master.gain.linearRampToValueAtTime(masterLevel,at+.42);
 stopRecordedDuck();logEvent('RESTART');gameOver=false;duck=null;balls=[];score=0;round=0;lastDirection=null;directionStreak=0;lives=startingLives;replayAt=Infinity;updateScore();}playing=true;button.dataset.mode='playing';button.textContent='Pause';button.disabled=false;nextDuckAt=narrate(ctx.currentTime+.55,story.opening);guideFinished=false;remainingGuideDirections=[...directions];flightAnnounced=false;monkeysAnnounced=false;finaleAnnounced=false;finaleRosters=[];flightRounds=0;remainingVoices=[];lastVoice=undefined;});
window.addEventListener('keydown',async e=>{if(['ArrowUp','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='KeyD')toggleDebug();if(e.code==='Space'){await togglePause();return;}const d=directions.find(x=>x.key===e.code);if(d&&playing)throwBall(d);});
// Pointer presses throw immediately. Keyboard and assistive activation still use click.
document.querySelectorAll('.touch-controls button[data-direction]').forEach(control=>{
 const handleThrow=async()=>{
  const d=directions.find(item=>item.name===control.dataset.direction);
  if(!d)return;
  if(!ctx){status.textContent='Put on headphones and press Play.';return;}
  if(!playing)return;
  if(ctx.state==='suspended')await ctx.resume();
  if(gameOver)return;
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
function toggleDebug(){debug.hidden=!debug.hidden;debugToggle.textContent=debug.hidden?'Show debug radar (D)':'Hide debug radar (D)';debugToggle.setAttribute('aria-pressed',String(!debug.hidden));if(!debug.hidden){debug.closest('details').open=true;renderDebug();}}
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
 for(const duck of activeCreatures()){const p=point(duck.direction,duck.distance);c.fillStyle=duck.mode==='chase'||duck.mode==='tickle'?'#ff8e83':duck.mode==='retreat'?'#b5d8a6':'#ffd77e';c.beginPath();c.arc(p.x,p.y,10,0,Math.PI*2);c.fill();c.fillStyle='#e5f2e7';c.font='12px monospace';c.fillText(animalFor(duck.voice).name.toUpperCase(),p.x,p.y-15);}
 for(const b of balls){const p=point(b.d,b.distance);c.fillStyle='#8bd8f4';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();}
 c.textAlign='left';
 telemetry.textContent='STATE: '+(!ctx?'not started':gameOver?'game over':playing?'running':'paused')+'\nROUND: '+round+'   SCORE: '+score+'\nANIMAL: '+(activeCreatures().map(c=>animalFor(c.voice).name+' · '+c.direction.name.toUpperCase()+' · '+c.voice.name+' · '+c.distance.toFixed(2)+' m · '+c.mode).join(' / ')||'waiting')+'\nLAST EVENT: '+lastEvent+'\nBALLS: '+balls.length+'   AUDIO: '+(ctx?ctx.state:'off')+'\nRECENT EVENTS:\n'+eventLog.slice(-7).map(e=>e.kind+' '+(e.direction||e.thrown||'')+' '+(e.distance??'')).join('\n')+'\nHRTF: Web Audio PannerNode\nKEYS: arrows=throw · D=toggle · Space=pause';
}
renderDebug();
