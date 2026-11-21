const $=s=>document.querySelector(s),button=$('#start'),status=$('#status'),debug=$('#debug'),scoreEl=$('#score');
const directions=[{name:'front',x:0,z:-1,key:'ArrowUp'},{name:'right',x:1,z:0,key:'ArrowRight'},{name:'back',x:0,z:1,key:'ArrowDown'},{name:'left',x:-1,z:0,key:'ArrowLeft'}];
let gameOver=false,tickleUntil=0,tickleNext=0;
let ctx,master,roomSend,playing=false,duck=null,balls=[],nextDuckAt=0,last=0,score=0,round=0,duckPanner,duckFilter,duckGain;
const rand=(a,b)=>a+Math.random()*(b-a);
function panner(){const p=ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=1.3;p.maxDistance=35;p.rolloffFactor=.85;p.coneInnerAngle=360;return p;}
function pos(p,x,y,z){if(p.positionX){p.positionX.value=x;p.positionY.value=y;p.positionZ.value=z;}else p.setPosition(x,y,z);}
function sound(type,at,p,volume=1){const dur=type==='quack'?.48:type==='hit'?.7:type==='retreat'?.52:type==='tickle'?.18:type==='death'?1.15:.23;const buf=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate),data=buf.getChannelData(0);let phase=0;
for(let i=0;i<data.length;i++){const t=i/ctx.sampleRate,u=t/dur;let f,v;
if(type==='quack'||type==='retreat'){f=(type==='retreat'?340:225)+100*Math.exp(-t*10)+35*Math.sin(t*27);const e=Math.pow(Math.sin(Math.PI*u),1.65);v=e*(.55*Math.sin(phase)+.18*Math.sin(2*phase)+.08*Math.sin(3*phase))*(.85+.15*Math.sin(2*Math.PI*14*t));}
else if(type==='tickle'){f=580+190*Math.sin(t*45)+110*Math.sin(t*19);v=Math.pow(1-u,1.8)*(.16*Math.sin(phase)+.11*Math.sin(2*phase)+.05*Math.sin(3*phase));}
else if(type==='death'){f=390*Math.pow(.55,u)+22*Math.sin(t*8);v=Math.pow(Math.sin(Math.PI*u),1.1)*(.26*Math.sin(phase)+.12*Math.sin(phase*1.5));}
else if(type==='hit'){f=270+580*Math.exp(-t*8)+80*Math.sin(t*25);v=Math.pow(1-u,2)*(.5*Math.sin(phase)+.22*Math.sin(phase*1.5));}
else {f=220+210*Math.exp(-t*22);v=Math.exp(-t*22)*(.65*Math.sin(phase)+.12*Math.sin(2*phase));}
phase+=2*Math.PI*f/ctx.sampleRate;data[i]=v;}
const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buf;gain.gain.value=volume;src.connect(gain).connect(p);src.start(Math.max(at,ctx.currentTime));}
function init(){ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.37;const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-17;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.006;limiter.release.value=.22;master.connect(limiter).connect(ctx.destination);
const impulse=ctx.createBuffer(2,Math.floor(ctx.sampleRate*.38),ctx.sampleRate);for(let c=0;c<2;c++){const a=impulse.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/ctx.sampleRate*15)*.12;}const verb=ctx.createConvolver();verb.buffer=impulse;roomSend=ctx.createGain();roomSend.gain.value=.11;roomSend.connect(verb).connect(master);
const L=ctx.listener;if(L.positionX){L.positionX.value=0;L.positionY.value=0;L.positionZ.value=0;L.forwardX.value=0;L.forwardY.value=0;L.forwardZ.value=-1;L.upX.value=0;L.upY.value=1;L.upZ.value=0;}else {L.setPosition(0,0,0);L.setOrientation(0,0,-1,0,1,0);}
duckPanner=panner();duckFilter=ctx.createBiquadFilter();duckFilter.type='lowpass';duckFilter.frequency.value=4000;duckGain=ctx.createGain();duckGain.gain.value=.8;duckFilter.connect(duckGain).connect(duckPanner);duckPanner.connect(master);duckPanner.connect(roomSend);
const bed=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),bd=bed.getChannelData(0);let smooth=0;for(let i=0;i<bd.length;i++){smooth=.996*smooth+.004*(Math.random()*2-1);bd[i]=smooth;}const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();filter.type='lowpass';filter.frequency.value=280;g.gain.value=.032;src.buffer=bed;src.loop=true;src.connect(filter).connect(g).connect(master);src.start();}
function spawn(){const d=directions[Math.floor(Math.random()*4)];duck={direction:d,distance:10,mode:'approach',nextQuack:ctx.currentTime+.15,escapeSpeed:5.8};round++;status.textContent='A duck is approaching…';}
let lastEvent='No throws yet';
function throwBall(d){
 if(gameOver||!duck||duck.mode!=='approach')return;
 const p=panner();p.connect(master);p.connect(roomSend);
 const ball={p,d,distance:0,age:0,nextBounce:0,bounces:0,active:true};
 balls.push(ball);pos(p,d.x*.8,.1,d.z*.8);sound('bounce',ctx.currentTime,p,.52);
 lastEvent='THROW '+d.name.toUpperCase()+' toward duck '+duck.direction.name.toUpperCase();
 status.textContent='Ball flying '+d.name+'…';
 if(d!==duck.direction){ball.active=false;duck.mode='chase';duck.nextQuack=ctx.currentTime+.08;lastEvent='MISS — wrong direction';status.textContent='Miss! The duck is coming to TICKLE you!';}
}
function hitDuck(ball,t){
 duck.mode='retreat';duck.nextQuack=t+.12;score++;scoreEl.textContent='Ducks startled: '+score;
 status.textContent='BOINK! Duck startled!';lastEvent='HIT — ball intercepted duck at '+duck.distance.toFixed(1)+'m';
 pos(ball.p,ball.d.x*duck.distance,0,ball.d.z*duck.distance);sound('hit',t,ball.p,.62);
 ball.age=999;ball.bounces=99;ball.active=false;
}
function tick(now){const dt=Math.min((now-last)/1000,.06);last=now;if(playing&&ctx){const t=ctx.currentTime;if(!gameOver){if(!duck&&t>=nextDuckAt)spawn();if(duck){if(duck.mode==='approach'){duck.distance=Math.max(1.35,duck.distance-dt*1.1);if(duck.distance<=1.36){duck.mode='tickle';tickleUntil=t+2.15;tickleNext=t;status.textContent='OH NO. TICKLES!';}}else if(duck.mode==='chase'){duck.distance=Math.max(.65,duck.distance-dt*5.6);if(duck.distance<=.68){duck.mode='tickle';tickleUntil=t+2.15;tickleNext=t;status.textContent='OH NO. TICKLES!';}}else if(duck.mode==='retreat')duck.distance+=dt*duck.escapeSpeed;
pos(duckPanner,duck.direction.x*duck.distance,0,duck.direction.z*duck.distance);duckFilter.frequency.setTargetAtTime(Math.max(1200,6500/(1+duck.distance*.12)),t,.06);
if(duck.mode==='tickle'){if(t>=tickleNext){sound('tickle',t,duckFilter,.42);tickleNext=t+.12+Math.random()*.11;}if(t>=tickleUntil){sound('death',t,duckFilter,.6);gameOver=true;status.textContent='GAME OVER — TICKLED TO DEATH. Restart to try again.';button.disabled=false;button.textContent='Play again';}}else if(t>=duck.nextQuack){sound(duck.mode==='retreat'?'retreat':'quack',t+.01,duckFilter,duck.mode==='retreat'?.43:duck.mode==='chase'?.8:.68);duck.nextQuack=t+(duck.mode==='retreat'?.55:duck.mode==='chase'?rand(.22,.38):rand(.9,1.5));}
if(duck.mode==='retreat'&&duck.distance>13){duck=null;nextDuckAt=t+rand(1,2);status.textContent='Listening for another duck…';}}
for(const b of balls){if(b.age>=999)continue;b.age+=dt;const previousDistance=b.distance;b.distance+=dt*8.5;pos(b.p,b.d.x*b.distance,.12,b.d.z*b.distance);
 if(b.active&&duck&&duck.mode==='approach'&&b.d===duck.direction&&previousDistance<=duck.distance+.6&&b.distance>=duck.distance-.6){hitDuck(b,t);continue;}
 if(b.active&&b.distance>=14){b.active=false;lastEvent='MISS — ball passed the duck path';if(duck&&duck.mode==='approach'){duck.mode='chase';duck.nextQuack=t+.08;status.textContent='Miss! The duck is coming to TICKLE you!';}}if(b.age>=b.nextBounce&&b.bounces<6){sound('bounce',t,b.p,.37*Math.pow(.68,b.bounces));b.bounces++;b.nextBounce=b.age+.26+b.bounces*.09;}}
balls=balls.filter(b=>b.age<4&&b.bounces<6);renderDebug();}}requestAnimationFrame(tick);}
button.addEventListener('click',async()=>{if(!ctx)init();await ctx.resume();if(gameOver){gameOver=false;duck=null;balls=[];score=0;round=0;scoreEl.textContent='Ducks startled: 0';}playing=true;button.textContent='Audio running';button.disabled=true;nextDuckAt=ctx.currentTime+.3;status.textContent='Listen for a duck…';});
window.addEventListener('keydown',async e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='KeyD')toggleDebug();if(e.code==='Space'&&ctx&&!gameOver){playing=!playing;if(playing)await ctx.resume();else await ctx.suspend();status.textContent=playing?'Listen for a duck…':'Paused';}const d=directions.find(x=>x.key===e.code);if(d&&playing)throwBall(d);});
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
 c.fillText('FRONT ↑',cx,16);c.fillText('BACK ↓',cx,h-6);c.fillText('LEFT',24,cy-8);c.fillText('RIGHT',w-25,cy-8);
 c.fillStyle='#e3f2e4';c.beginPath();c.arc(cx,cy,7,0,Math.PI*2);c.fill();c.fillStyle='#0b1510';c.font='bold 10px monospace';c.fillText('YOU',cx,cy-13);
 const point=(d,dist)=>({x:cx+d.x*Math.min(dist,limit)*scale,y:cy+d.z*Math.min(dist,limit)*scale});
 if(duck){const p=point(duck.direction,duck.distance);c.fillStyle=duck.mode==='chase'||duck.mode==='tickle'?'#ff8e83':duck.mode==='retreat'?'#b5d8a6':'#ffd77e';c.beginPath();c.arc(p.x,p.y,10,0,Math.PI*2);c.fill();c.fillStyle='#e5f2e7';c.font='12px monospace';c.fillText('DUCK',p.x,p.y-15);}
 for(const b of balls){const p=point(b.d,b.distance);c.fillStyle='#8bd8f4';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();}
 c.textAlign='left';
 telemetry.textContent='STATE: '+(!ctx?'not started':gameOver?'game over':playing?'running':'paused')+'\nROUND: '+round+'   SCORE: '+score+'\nDUCK: '+(duck?duck.direction.name.toUpperCase()+' · '+duck.distance.toFixed(2)+' m · '+duck.mode:'waiting')+'\nLAST EVENT: '+lastEvent+'\nBALLS: '+balls.length+'   AUDIO: '+(ctx?ctx.state:'off')+'\nHRTF: Web Audio PannerNode\nKEYS: arrows=throw · D=toggle · Space=pause';
}
renderDebug();
