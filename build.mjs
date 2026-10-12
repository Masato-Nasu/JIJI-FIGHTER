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


// STOP_GAME_BGM_SFX_20261012 — applied to the distributable HTML after the existing audio/explosion fixes.
{
  const {readFile:readControls,writeFile:writeControls}=await import('node:fs/promises');
  const output=new URL('./dist/index.html',import.meta.url);
  let game=await readControls(output,'utf8');
  function change(before,after,label){
    const n=game.split(before).length-1;
    if(n!==1)throw Error('Unsafe STOP/SFX patch '+label+': '+n+' occurrences');
    game=game.replace(before,after);
  }
  change('let held=new Set(),shootHeld=false,bombHeld=false,pointerDrag=null,soundEnabled=false,audioCtx=null;',
    'let held=new Set(),shootHeld=false,bombHeld=false,pointerDrag=null,soundEnabled=true,audioCtx=null;','SFX initially ON');
  change('>SFX OFF</button>','>SFX ON</button>','SFX label');
  change('g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);',
    'g.gain.setValueAtTime(volume*.32,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);','gentle SFX volume');
  change('audio.volume=.48;','audio.volume=.28;','BGM initial volume');
  change('audio.muted=false;audio.volume=.55;audio.loop=true;',
    'audio.muted=false;audio.volume=.28;audio.loop=true;','BGM playback volume');
  const stopCreate=[
    "  const stopBtn=document.createElement('button');",
    "  stopBtn.id='stopGameButton';stopBtn.type='button';stopBtn.className='icon-button stop-game-button';",
    "  stopBtn.textContent='■ STOP GAME';stopBtn.setAttribute('aria-label','ゲームを終了して開始画面に戻る');",
    "  stopBtn.style.right='auto';stopBtn.style.display='none';",
    "  $('game').appendChild(stopBtn);",
    "  function fitPause(){",
    "    pauseBtn.style.left=W<=680?'16px':'32px';pauseBtn.style.top=W<=680?'103px':'81px';",
    "    stopBtn.style.left=W<=680?'109px':'128px';stopBtn.style.top=W<=680?'103px':'81px';",
    "  }"
  ].join('\n');
  change("  function fitPause(){pauseBtn.style.left=W<=680?'16px':'32px';pauseBtn.style.top=W<=680?'103px':'81px';}",
    stopCreate,'STOP button layout');
  change("pauseBtn.style.display='block';pauseBtn.textContent='Ⅱ PAUSE';",
    "pauseBtn.style.display='block';stopBtn.style.display='block';pauseBtn.textContent='Ⅱ PAUSE';",'STOP show on mission');
  change("els.fire.classList.remove('firing');pauseBtn.style.display='none';\n    els.msg.classList.remove('visible');",
    "els.fire.classList.remove('firing');pauseBtn.style.display='none';stopBtn.style.display='none';\n    els.msg.classList.remove('visible');",'STOP hide on crash');
  change("mode='over';shootHeld=false;bombHeld=false;els.fire.classList.remove('firing');pauseBtn.style.display='none';",
    "mode='over';shootHeld=false;bombHeld=false;els.fire.classList.remove('firing');pauseBtn.style.display='none';stopBtn.style.display='none';",'STOP hide on results');
  change("sound(65,.85,'sawtooth',.14);sound(145,.3,'square',.08);hud();",
    "sound(65,.85,'sawtooth',.14);sound(145,.3,'square',.08);hud();\n    window.dispatchEvent(new Event('jiji:musicstop'));",'music off when aircraft explodes');
  change("els.over.classList.remove('hidden');sound(110,.6,'sawtooth',.08);",
    "els.over.classList.remove('hidden');sound(110,.6,'sawtooth',.08);\n    window.dispatchEvent(new Event('jiji:musicstop'));",'music off after game complete');
  change("els.intro.classList.remove('hidden');pauseBtn.style.display='none';$('trendReadout').hidden=true;",
    "els.intro.classList.remove('hidden');pauseBtn.style.display='none';stopBtn.style.display='none';$('trendReadout').hidden=true;\n    window.dispatchEvent(new Event('jiji:missionstop'));",'STOP returns to menu');
  change("  pauseBtn.addEventListener('click',()=>{if(mode==='playing')pause();else if(mode==='paused')resume();});",
    [
      "  pauseBtn.addEventListener('click',()=>{if(mode==='playing')pause();else if(mode==='paused')resume();});",
      "  stopBtn.addEventListener('click',()=>{",
      "    if(mode==='playing'||mode==='paused'||mode==='destroying')$('menuPause').click();",
      "  });"
    ].join('\n'),'STOP works during gameplay');
  change('  // JIJI_AUDIO_STAGE6_2026-10-12-audio6',[
    "  function stopMusicForMission(){",
    "    audio.pause();",
    "    try{audio.currentTime=0;}catch(_){}",
    "    label();",
    "  }",
    "  window.addEventListener('jiji:musicstop',stopMusicForMission);",
    "  window.addEventListener('jiji:missionstop',()=>{",
    "    stopMusicForMission();",
    "    if(recorder?.state==='recording')recorder.stop();",
    "  });",
    "  // JIJI_AUDIO_STAGE6_2026-10-12-audio6"
  ].join('\n'),'media stop and recording auto-save');
  await writeControls(output,game,'utf8');
  console.log('STOP button, death music stop, SFX default ON and reduced volume enabled.');
}


// RECORD_AUDIO_AND_DEATH_FADE_V2
// Preserve sound throughout the blast and retain the audio track for repeat recordings.
{
 const fs=await import('node:fs/promises');
 const file=new URL('./dist/index.html',import.meta.url);
 let h=await fs.readFile(file,'utf8');
 function sub(a,b,label){
   const n=h.split(a).length-1;
   if(n!==1)throw Error('Recording/death patch drift '+label+': '+n);
   h=h.replace(a,b);
 }
 sub("sound(65,.85,'sawtooth',.14);sound(145,.3,'square',.08);hud();\n    window.dispatchEvent(new Event('jiji:musicstop'));",
     "sound(65,.85,'sawtooth',.14);sound(145,.3,'square',.08);hud();\n    // Continue music through the explosion animation.",
     'do not silence at impact');
 sub("els.over.classList.remove('hidden');sound(110,.6,'sawtooth',.08);\n    window.dispatchEvent(new Event('jiji:musicstop'));",
     "els.over.classList.remove('hidden');sound(110,.6,'sawtooth',.08);\n    window.dispatchEvent(new Event('jiji:deathsceneend'));",
     'start the musical tail after the blast');
 sub("if(stream)for(const track of stream.getTracks())track.stop();",
     "if(stream){\n      for(const track of stream.getVideoTracks())track.stop();\n      for(const track of stream.getAudioTracks())stream.removeTrack(track);\n    }",
     'keep the WebAudio destination alive across recordings');
 sub("if(!over.classList.contains('hidden')&&recorder?.state==='recording')recorder.stop();",
     "// jiji:deathsceneend handles final saving, after the music tail.",
     'do not truncate the recording when GAME OVER appears');
 const fade=[
   "  let endingToken=0;",
   "  const pendingEnds=[];",
   "  function cancelEnding(){endingToken++;while(pendingEnds.length)clearTimeout(pendingEnds.pop());}",
   "  function after(ms,fn){pendingEnds.push(setTimeout(fn,ms));}",
   "  window.addEventListener('jiji:deathsceneend',()=>{",
   "    cancelEnding();",
   "    const token=endingToken,before=audio.volume;",
   "    // Show the full blast first, then 800ms tail and 650ms fade.",
   "    after(800,()=>{",
   "      for(let step=1;step<=13;step++)after(step*50,()=>{",
   "        if(token!==endingToken)return;",
   "        audio.volume=Math.max(0,before*(1-step/13));",
   "        if(step===13){",
   "          stopMusicForMission();audio.volume=.28;",
   "          after(180,()=>{",
   "            if(token!==endingToken)return;",
   "            if(recorder?.state==='recording')recorder.stop();",
   "          });",
   "        }",
   "      });",
   "    });",
   "  });",
   "  window.addEventListener('jiji:musicstop',()=>{cancelEnding();stopMusicForMission();});"
 ].join('\n');
 sub("  window.addEventListener('jiji:musicstop',stopMusicForMission);",fade,
     'fade BGM after explosion and then save recording');
 sub("    stopMusicForMission();\n    if(recorder?.state==='recording')recorder.stop();",
     "    cancelEnding();stopMusicForMission();\n    if(recorder?.state==='recording')recorder.stop();",
     'STOP GAME still stops immediately');
 sub("    audio.muted=false;audio.volume=.28;audio.loop=true;",
     "    cancelEnding();audio.muted=false;audio.volume=.28;audio.loop=true;",
     'cancel delayed fades when restarting music');
 if(h.includes("if(musicOn && stream.getAudioTracks().length!==1){"))sub(
     "if(musicOn && stream.getAudioTracks().length!==1){",
     "if(musicOn && (stream.getAudioTracks().length!==1||stream.getAudioTracks()[0].readyState!=='live')){",
     'never silently record with a stopped audio track');
 await fs.writeFile(file,h,'utf8');
 console.log('Recorded audio survives multiple sessions; BGM fades after blast + 0.8s tail.');
}


// GAME_SFX_RECORDING_MIX_20261012
// Duplicate the game's synthesized oscillator signals into the same
// MediaStreamDestination that carries BGM. Speaker playback stays unchanged.
{
 const fs=await import('node:fs/promises');
 const path=new URL('./dist/index.html',import.meta.url);
 let content=await fs.readFile(path,'utf8');
 function updateOnce(before,after,why){
   const n=content.split(before).length-1;
   if(n!==1)throw Error('SFX mix source drift '+why+': '+n);
   content=content.replace(before,after);
 }
 updateOnce("o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+duration+.01);",
    "o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+duration+.01);\n"+
    "      // Forward precisely the SFX events heard during gameplay to recording.\n"+
    "      window.dispatchEvent(new CustomEvent('jiji:sfx',{detail:{frequency:f,duration,type,volume:volume*.32}}));",
    'forward synthesized SFX to recorder');
 const fxMixer=[
 "  // Record SFX independently of music ON/OFF into the same video audio track.",
 "  // Maintain one stream track for BGM + SFX (no duplicate speaker playback).",
 "  window.__JIJI_SFX_ROUTED__=0;",
 "  window.addEventListener('jiji:sfx',event=>{",
 "    if(recorder?.state!=='recording'||!trackNodes)return;",
 "    try{",
 "      const {frequency,duration,type,volume}=event.detail;",
 "      const context=trackNodes.context;",
 "      if(context.state!=='running')return;",
 "      const t=context.currentTime;",
 "      const oscillator=context.createOscillator(),gain=context.createGain();",
 "      oscillator.type=type;",
 "      oscillator.frequency.setValueAtTime(frequency,t);",
 "      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35,frequency*.42),t+duration);",
 "      gain.gain.setValueAtTime(volume,t);",
 "      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);",
 "      oscillator.connect(gain);gain.connect(trackNodes.destination);",
 "      oscillator.start(t);oscillator.stop(t+duration+.01);",
 "      window.__JIJI_SFX_ROUTED__++;",
 "    }catch(error){console.warn('Recording SFX mixer failed',error);}",
 "  });",
 "  function overlayText(s,x,y,font='18px monospace',align='left'){"
 ].join('\n');
 updateOnce("  function overlayText(s,x,y,font='18px monospace',align='left'){",fxMixer,'mix recorded SFX');
 await fs.writeFile(path,content,'utf8');
 console.log('BGM and synthesized SFX now share one recorded audio track.');
}


// LETHAL_HIT_FRAME_ABORT_V1
// Multiple bullets can arrive in the SAME frame. A lethal hit clears enemies,
// projectiles and targets in beginDestruction(). Every collision loop must
// RETURN from update() before trying to use elements from those cleared arrays.
{
  const fs=await import('node:fs/promises');
  const output=new URL('./dist/index.html',import.meta.url);
  let h=await fs.readFile(output,'utf8');
  function single(from,to,what){
    const count=h.split(from).length-1;
    if(count!==1)throw Error('Lethal-hit build drift '+what+': '+count);
    h=h.replace(from,to);
  }
  single("function damage(amount){\n     if(mode!=='playing'||player.invuln>0)return;",
    "function damage(amount){\n     if(mode!=='playing'||player.invuln>0)return false;",
    'damage skipped return');
  single("hull=Math.max(0,hull-amount*setting.damage);combo=0;flash=.29;shake=9;",
    "hull=Math.max(0,hull-amount*setting.damage);if(hull<.5)hull=0;combo=0;flash=.29;shake=9;",
    'displayed zero equals real zero');
  single("toast('HULL DAMAGE',.85);hud();if(hull<=0)end();",
    "if(hull<=0){hud();end(false,'HULL DEPLETED');return true;}\n     toast('HULL DAMAGE',.85);hud();return false;",
    'switch fatal bullet to destruction');
  single("damage(30+3*wave);",
    "if(damage(30+3*wave))return;",
    'ground emplacement contact');
  single("damage(37+wave*2);",
    "if(damage(37+wave*2))return;",
    '3D trend word contact');
  single("if(Math.hypot(e.x-player.x,Math.min(Math.abs(e.y-player.y),Math.abs(mirrorY(e.y)-player.y)))<4.5)damage(34+2*wave);",
    "if(Math.hypot(e.x-player.x,Math.min(Math.abs(e.y-player.y),Math.abs(mirrorY(e.y)-player.y)))<4.5 && damage(34+2*wave))return;",
    'enemy contact');
  single("if(b.z<9){if(Math.hypot(b.x-player.x,b.y-player.y)<2.7)damage(b.damage||22+Math.floor(wave*1.5));enemyShots.splice(i,1);}",
    "if(b.z<9){if(Math.hypot(b.x-player.x,b.y-player.y)<2.7 && damage(b.damage||22+Math.floor(wave*1.5)))return;enemyShots.splice(i,1);}",
    'multiple bullets same frame');
  await fs.writeFile(output,h,'utf8');
  console.log('Lethal projectiles and enemy contacts now always enter visible destruction without crashing the frame.');
}
