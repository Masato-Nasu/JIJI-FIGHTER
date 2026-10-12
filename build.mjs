import {mkdir,rm,cp} from 'node:fs/promises';
const root=new URL('./',import.meta.url),out=new URL('./dist/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['index.html','manifest.webmanifest','sw.js','icons','music'])await cp(new URL(name,root),new URL(name,out),{recursive:true});
console.log('Ready: dist/ (Cloudflare Pages Functions remain in functions/)');


import {readFile,writeFile} from 'node:fs/promises';
const outputHtml=new URL('./dist/index.html',import.meta.url);
let html=await readFile(outputHtml,'utf8');
const replacements=[
 ["const DESTRUCTION_SECONDS=1.8;","const DESTRUCTION_SECONDS=2.4;"],
 ["const center=shipPoint(0,0),scale=clamp(Math.min(W,H)/720,.55,1.2);","const center=shipPoint(0,0),scale=clamp(Math.min(W,H)/680,.62,1.45);"],
 ["for(let i=0;i<46;i++){","for(let i=0;i<90;i++){",],
 ["const angle=rand(0,Math.PI*2),speed=rand(80,310)*scale;","const angle=rand(0,Math.PI*2),speed=rand(140,470)*scale;"],
 ["size:rand(3,15)*scale,life:rand(1.05,1.8)","size:rand(5,19)*scale,life:rand(.9,2.25)"],
 ["sound(65,.8,'sawtooth',.12);sound(150,.22,'square',.055);hud();","sound(65,.85,'sawtooth',.14);sound(145,.3,'square',.08);hud();\n    const wallWarning=$('wallWarning');wallWarning.textContent='';wallWarning.classList.remove('visible');"]
];
for(const [before,after] of replacements){
 if(!html.includes(before))throw new Error('Explosion patch mismatch (source changed): '+before.slice(0,55));
 html=html.replace(before,after);
}
const oldDraw=/  function drawDestruction\(\)\{[\s\S]*?(?=  function finishEnd\(won=false)/;
if(!oldDraw.test(html))throw new Error('Could not locate drawDestruction; source not modified');
const newDraw=String.raw`  function drawDestruction(){
    if(!destruction||mode!=='destroying')return;
    const d=destruction,t=d.age,cx=d.x*W,cy=d.y*H,k=d.scale;
    ctx.save();ctx.translate(cx,cy);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';
    ctx.lineJoin='miter';ctx.lineCap='round';
    if(t<.12){ctx.globalAlpha=.72*(1-t/.12);ctx.fillRect(-W,-H,W*2,H*2);}
    if(t<.55){
      const pulse=1-t/.55,inner=(15+90*Math.sin(Math.PI*Math.min(t/.55,1)))*k;
      ctx.globalAlpha=.95*pulse;ctx.lineWidth=3.8*k;ctx.beginPath();
      for(let i=0;i<18;i++){
        const r=inner*(i%2?.48:1.25),a=Math.PI*2*i/18;
        if(!i)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
        else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
      }
      ctx.closePath();ctx.stroke();
      ctx.globalAlpha=.9*Math.max(0,1-t/.3);
      ctx.beginPath();ctx.arc(0,0,Math.max(0,(28-t*45))*k,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<3;i++){
      const age=t-i*.14;if(age<0||age>1.5)continue;
      ctx.globalAlpha=.94*Math.pow(1-age/1.5,1.2);
      ctx.lineWidth=(4-i*.8)*k;
      const radius=(16+age*290)*k;
      ctx.beginPath();ctx.ellipse(0,0,radius,radius*.76,0,0,Math.PI*2);ctx.stroke();
    }
    for(let i=0;i<38;i++){
      const a=Math.PI*2*i/38,age=t-(i%4)*.01;
      if(age<0||age>1.1)continue;
      const len=(40+age*380)*k,fade=1-age/1.1;
      ctx.globalAlpha=.82*fade;ctx.lineWidth=2.3*k;
      ctx.beginPath();ctx.moveTo(Math.cos(a)*(len-25*k),Math.sin(a)*(len-25*k));
      ctx.lineTo(Math.cos(a)*len,Math.sin(a)*len);ctx.stroke();
    }
    for(const f of d.fragments){
      if(t>=f.life)continue;
      const move=(1-Math.exp(-1.1*t))/1.1;
      const x=f.vx*move,y=f.vy*move+55*t*t*k;
      ctx.globalAlpha=Math.pow(1-t/f.life,.6);ctx.lineWidth=2*k;
      ctx.beginPath();ctx.moveTo(x-f.vx*.045,y-f.vy*.045);ctx.lineTo(x,y);ctx.stroke();
      ctx.save();ctx.translate(x,y);ctx.rotate(f.angle+t*f.spin);
      ctx.beginPath();ctx.moveTo(-f.size,0);ctx.lineTo(f.size*.8,-f.size*.45);
      ctx.lineTo(f.size*.3,f.size*.7);ctx.closePath();ctx.stroke();ctx.restore();
    }
    if(t>.35&&t<1.9){
      ctx.globalAlpha=Math.min(1,(t-.35)*4)*Math.min(1,(1.9-t)*3);
      ctx.lineWidth=1;ctx.textAlign='center';ctx.font='bold '+Math.round(19*k)+'px monospace';
      ctx.fillText(d.reason==='WALL COLLISION'?'WALL COLLISION':'AIRCRAFT DESTROYED',0,-95*k);
    }
    ctx.restore();
  }
`;
html=html.replace(oldDraw,newDraw);
await writeFile(outputHtml,html,'utf8');
console.log('Explosion restored: wall collision and zero hull show visible 2.4s debris before GAME OVER.');

// Mobile BGM route repaired: normal playback must not create a WebAudio graph.
const musicBefore=String.raw`  function label(){music.textContent=musicOn?'♫ MUSIC ON':'♫ MUSIC OFF';music.setAttribute('aria-pressed',String(musicOn));}
  async function startMusic(){
    if(!musicOn)return;
    // Prepare recording destination before play() and while the click is still active.
    const audioStream=makeAudioStream();
    const playPromise=audio.play();
    try{await playPromise;}catch(_){music.textContent='♫ TAP MUSIC';}
    return audioStream;
  }
  music.addEventListener('click',()=>{
    musicOn=!musicOn;
    if(musicOn)startMusic();else audio.pause();
    label();
  });
  // Browser autoplay starts from a real start/resume/restart gesture.
  for(const id of ['startButton','restartButton','resumeButton']){
    document.getElementById(id)?.addEventListener('click',()=>{startMusic();});
  }
  label();`;
const musicAfter=String.raw`  // Normal BGM plays natively; do not route speakers through WebAudio
  // unless the player explicitly selected recording. Critical for mobile.
  function label(){
    const playing=musicOn&&!audio.paused&&!audio.error;
    music.textContent=!musicOn?'♫ MUSIC OFF':audio.error?'♫ MUSIC ERROR':playing?'♫ MUSIC ON':'♫ TAP MUSIC';
    music.setAttribute('aria-pressed',String(musicOn));
  }
  async function startMusic(){
    if(!musicOn)return;
    audio.muted=false;audio.volume=.55;audio.loop=true;
    try{
      if(audio.networkState===HTMLMediaElement.NETWORK_EMPTY)audio.load();
      await audio.play();
    }catch(err){console.warn('BGM cannot start',err);}
    label();
  }
  music.addEventListener('click',()=>{
    if(!musicOn||audio.paused){musicOn=true;startMusic();}
    else{musicOn=false;audio.pause();label();}
  });
  for(const event of ['play','pause','playing','error','waiting'])audio.addEventListener(event,label);
  audio.addEventListener('error',()=>console.warn('BGM file unavailable',audio.currentSrc,audio.error?.code));
  for(const id of ['startButton','restartButton','resumeButton']){
    document.getElementById(id)?.addEventListener('click',()=>{
      const wantsRecording=document.querySelector('input[name="recordMode"]:checked')?.value==='record';
      if(wantsRecording)makeAudioStream();
      startMusic();
    });
  }
  label();`;
const musicSection=/  function label\(\)\{music\.textContent=[\s\S]*?(?=  function makeAudioStream\(\)\{)/;
if(!musicSection.test(html))throw Error('Music functions not found; source has changed');
html=html.replace(musicSection,musicAfter+'\n  // JIJI_AUDIO_STAGE6_2026-10-12-audio6\n');
const oldSound='id="audioButton" class="icon-button" type="button" aria-label="サウンドの切り替え" title="Sound on/off">SOUND OFF';
if(html.includes(oldSound))html=html.replace(oldSound,'id="audioButton" class="icon-button" type="button" aria-label="効果音の切り替え" title="Sound effects on/off">SFX OFF');
const oldToggle="els.audio.textContent=soundEnabled?'SOUND ON':'SOUND OFF';";
if(html.includes(oldToggle))html=html.replace(oldToggle,"els.audio.textContent=soundEnabled?'SFX ON':'SFX OFF';");
const oldAudio='id="bgm" preload="auto" loop playsinline src=';
if(html.includes(oldAudio))html=html.replace(oldAudio,'id="bgm" preload="auto" loop playsinline webkit-playsinline src=');
await writeFile(outputHtml,html,'utf8');
console.log('Mobile BGM route repaired; native playback and recording prepared independently.');
