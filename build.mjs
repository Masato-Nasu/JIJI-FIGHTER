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
  single("function damage(amount){\n    if(mode!=='playing'||player.invuln>0)return;",
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


// Display the actual release version in the built game.
// Keep the game mechanics, audio routing, recording, and all other UI unchanged.
{
  const fs = await import('node:fs/promises');
  const path = new URL('./dist/index.html', import.meta.url);
  const html = await fs.readFile(path, 'utf8');
  const oldLabel = '<span class="index">V. 0.9.12</span>';
  const newLabel = '<span class="index">V. 0.11.16</span>';
  if (!html.includes(oldLabel) && !html.includes(newLabel)) {
    throw new Error('Version label mismatch: refusing silent publication');
  }
  if (html.includes(oldLabel)) {
    await fs.writeFile(path, html.replace(oldLabel, newLabel), 'utf8');
  }
  console.log('Built JIJI FIGHTER with display version V. 0.11.16');
}


// MP4 conversion bridge, loaded before game scripts to capture recorder downloads.
{
 const fs=await import('node:fs/promises');
 await fs.copyFile(new URL('./mp4-share.js',import.meta.url),new URL('./dist/mp4-share.js',import.meta.url));
 const htmlPath=new URL('./dist/index.html',import.meta.url);
 let html=await fs.readFile(htmlPath,'utf8');
 if(!/src=["'](?:\.\/)?mp4-share(?:\.[a-f0-9]+)?\.js["']/.test(html)){
   const script='<script src="./mp4-share.js"></script>';
   if(html.includes('</head>'))html=html.replace('</head>',script+'\n</head>');
   else if(html.includes('<body'))html=html.replace('<body',script+'\n<body');
   else throw new Error('Cannot find MP4 script injection location');
   await fs.writeFile(htmlPath,html,'utf8');
 }
 console.log('MP4 recording conversion bridge included.');
}

// Linux Chrome-only fallback for actual BGM media decoding/streaming errors.
// Leave existing mobile music playback and capture logic entirely unchanged.
{
 const fs=await import('node:fs/promises');
 await fs.copyFile(new URL('./linux-music-recovery.js',import.meta.url),new URL('./dist/linux-music-recovery.js',import.meta.url));
 const htmlPath=new URL('./dist/index.html',import.meta.url);
 let html=await fs.readFile(htmlPath,'utf8');
 if(!html.includes('src="./linux-music-recovery.js"')){
  const script='<script src="./linux-music-recovery.js"></script>';
  if(!html.includes('</head>'))throw Error('Music recovery injection requires HTML head');
  html=html.replace('</head>',script+'\n</head>');
  await fs.writeFile(htmlPath,html,'utf8');
 }
 console.log('Linux Chrome music error recovery and diagnostics installed.');
}


// TREND_FETCH_UNBLOCK_20261012
// The original client delayed its API request until an ~8 MB embedded font was ready.
// Begin fetching LIVE topics immediately and show the actual error rather than a generic prompt.
{
 const fs=await import('node:fs/promises');
 const path=new URL('./dist/index.html',import.meta.url);
 let html=await fs.readFile(path,'utf8');
 const changes=[["  async function refresh(){\n    await ready;\n    const request=++revision;\n    let timer;\n    try{\n      const rows=await Promise.race([provider(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('取得がタイムアウトしました')),22000);})]);","  async function refresh(){\n    const request=++revision;\n    let timer;\n    try{\n      // Request the public topics immediately, before the large JP font finishes loading.\n      // This avoids making a successful API appear unavailable during slow font setup.\n      const feedRequest=provider();\n      const rows=await Promise.race([feedRequest,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('話題語APIが45秒以内に応答しませんでした')),45000);})]);\n      await ready;"],[":'LIVE話題語が取得できません。接続と公開先を確認し、RELOADしてください。サンプルでは代用しません。';",":'LIVE取得失敗：'+String(result.error||'通信エラー').slice(0,140)+' / サンプル語なし';"]];
 for(const [before,after] of changes){
   const count=html.split(before).length-1;
   if(count!==1)throw new Error('TREND fetch patch drift: expected one match, found '+count);
   html=html.replace(before,after);
 }
 await fs.writeFile(path,html,'utf8');
 console.log('LIVE word fetch now starts before Japanese font loading; actual errors are shown.');
}


// JIJI_COURSE_NATIVE_AAC_20261012
// Keep the published HTML's embedded font and existing game logic untouched.
// Repair mobile menu scrolling, clarify the start stage, and prefer actual
// H.264 video + AAC audio MP4 before WebM/Opus where supported.
{
 const fs=await import('node:fs/promises');
 const file=new URL('./dist/index.html',import.meta.url);
 let h=await fs.readFile(file,'utf8');
 function replaceOne(before,after,label){
   const count=h.split(before).length-1;
   if(count!==1)throw new Error('Course/MP4 build drift '+label+': '+count);
   h=h.replace(before,after);
 }
 replaceOne(
  "for(const type of ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4']){",
  'for(const type of [\'video/mp4;codecs="avc1.42E01E,mp4a.40.2"\',\'video/mp4;codecs="avc1.4D401E,mp4a.40.2"\',\'video/webm;codecs=vp8,opus\',\'video/webm;codecs=vp9,opus\',\'video/webm\']){',
  'prefer AAC H.264 before Opus'
 );
 // Long mobile menu could not scroll: ancestor #game disabled all touch panning.
 // The actual flight canvas retains touch-action:none for precise steering.
 const menuCSS=String.raw`
<style id="jiji-course-fix">
#game{touch-action:pan-y}
#scene,.touch-controls,.fire-button,.bomb-button{touch-action:none}
#intro{overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}
#intro .intro-inner{margin:auto;min-width:0}
.stage-choice-panel{width:min(100%,340px);margin:11px auto 14px;padding:12px;border:1px solid #777;text-align:left;background:rgba(8,8,8,.88)}
.stage-choice-panel .stage-choose-label{margin:0 0 7px;font-size:10px;letter-spacing:.11em;color:#fff}
.stage-choice-panel .stage-chooser{display:block;width:100%;min-height:44px;padding:10px 12px;margin:0;border:1px solid #aaa;border-radius:2px;background:#111;color:#fff;font:500 13px Helvetica,Arial,sans-serif;letter-spacing:.015em;touch-action:auto}
.stage-choice-panel .stage-chooser option{background:#111;color:#fff}
.stage-choice-help{font:10px/1.5 Helvetica,Arial,sans-serif;letter-spacing:.025em;color:#aaa;margin:8px 0 0}
@media(max-width:680px){#intro{padding:18px 16px 28px}#intro .logo-art{margin-top:6px}#intro .stage-choice-panel{margin:9px auto 10px}}
@media(max-height:690px){#intro .modal-foot{margin-top:10px}#intro .stage-choice-panel{padding:9px 11px}}
</style>`;
 replaceOne('</head>',menuCSS+'\n</head>','course menu CSS');
 const stageStart=h.indexOf('        <label class="stage-choose-label" for="stageChooser">');
 const stageEnd=stageStart<0?-1:h.indexOf('        </select>',stageStart);
 if(stageStart<0||stageEnd<0)throw Error('Cannot locate stage selection');
 const oldStage=h.slice(stageStart,stageEnd+'        </select>'.length);
 if(!oldStage.includes('id="stageChooser"')||!oldStage.includes('value="6"'))throw Error('Stage selector unexpected');
 const newStage=String.raw`        <div class="stage-choice-panel">
          <label class="stage-choose-label" for="stageChooser">COURSE / 開始ステージ</label>
          <select id="stageChooser" class="stage-chooser" aria-label="開始ステージを選ぶ">
            <option value="1">01 — FIRST CONTACT / はじめから</option>
            <option value="2">02 — MIRROR RUN / 2面から</option>
            <option value="3">03 — GROUND ZERO / 3面から</option>
            <option value="4">04 — WORD STORM / 4面から</option>
            <option value="5">05 — CROSS FIRE / 5面から</option>
            <option value="6">06 — FINAL FORTRESS / 6面から</option>
          </select>
          <p class="stage-choice-help">01は全6面を順番にプレイ。02〜06は途中の面から練習します。</p>
        </div>`;
 replaceOne(oldStage,'','remove old stage layout');
 // Place the course choice before the two sets of recording/difficulty controls.
 const stateLine='<p id="loadState" class="load-state" role="status">文字の立体データを準備しています…</p>';
 replaceOne(stateLine,stateLine+'\n'+newStage,'stage selector location');
 await fs.writeFile(file,h,'utf8');
 console.log('Course menu scroll and stage selection clarified; native H.264/AAC recording prioritized.');
}


// JIJI_TREND_DENSITY_20261012
// Keep the six stage layouts, stage enemy HP, ranking, bosses and CLASSIC intact.
// Later TREND stages used to spawn up to 3 large glyphs per burst.
// Cap simultaneously live word enemies and introduce one at a time.
{
 const fs=await import('node:fs/promises');
 const path=new URL('./dist/index.html',import.meta.url);
 let game=await fs.readFile(path,'utf8');
 function one(before,after,reason){
   const n=game.split(before).length-1;
   if(n!==1)throw Error('TREND density patch mismatch '+reason+': '+n);
   game=game.replace(before,after);
 }
 one("const introWords=Math.min(6,trendItems.length);",
     "const introWords=Math.min(3,trendItems.length);",
     'initial words 6 to 3');
 one("enemies.length<(gameMode==='trend'?currentStage().enemyCap:14+wave*2)",
     "enemies.length<(gameMode==='trend'?Math.min(currentStage().enemyCap,Math.ceil((wave+7)/2)):14+wave*2)",
     'TREND visible cap 4,5,5,6,6,7');
 one(
   "if(gameMode==='trend'&&wave>=2){\n        const reinforcements=wave>=5?2:wave>=4?1:Math.random()<.45?1:0;\n        for(let n=0;n<reinforcements&&enemies.length<currentStage().enemyCap;n++)\n          spawnTrend(rand(159,220));\n      }",
   "// TREND: one word at a time; avoid unreadable multi-word bursts.",
   'remove burst reinforcements');
 one("spawnTimer=rand(base*.78,base*1.02)*(gameMode==='trend'?.65:.73);",
     "spawnTimer=rand(base*.78,base*1.02)*(gameMode==='trend'?1.8:.73);",
     'space out new TREND words');
 one("shots=[];bombs=[];spawnTimer=.2;groundTimer=.55;",
     "shots=[];bombs=[];spawnTimer=gameMode==='trend'?1.35:.2;groundTimer=.55;",
     'brief pause after a stage transition');
 await fs.writeFile(path,game,'utf8');
 console.log('TREND glyph density reduced: 3 opening words, max 4–7 live words by stage, no burst spawns; CLASSIC unchanged.');
}

// Recording-only corrections. Keep all established gameplay patches above intact.
{
 const {createHash}=await import('node:crypto');
 let h=await readFile(outputHtml,'utf8');
 const one=(from,to)=>{
  if(h.split(from).length!==2)throw Error('Recording patch drift: '+from.slice(0,70));
  h=h.replace(from,to);
 };
 one("  function download(blob,type){",`  function download(blob,type){
    if(window.JIJI_EXPORT){void window.JIJI_EXPORT.saveRecording(blob);return;}`);
 one("    if(trackNodes)return trackNodes.destination.stream;",`    if(trackNodes){
      if(trackNodes.context.state==='suspended')trackNodes.context.resume().catch(console.warn);
      return trackNodes.destination.stream;
    }`);
 // Prevent a new take from replacing recorder/parts while onstop is pending.
 one("  async function beginRecording(){",`  async function beginRecording(){
    if(recorder)return;`);
 one("    const rw=1280,rh=Math.round(rw*Math.max(.45,Math.min(1.3,scene.clientHeight/Math.max(1,scene.clientWidth))));",
     "    const rw=1280,rh=2*Math.round(rw*Math.max(.45,Math.min(1.3,scene.clientHeight/Math.max(1,scene.clientWidth)))/2);");
 one("    const bgmStream=makeAudioStream();\n    if(bgmStream)for(const tr of bgmStream.getAudioTracks())stream.addTrack(tr);",`    const bgmStream=makeAudioStream();
    if(!bgmStream||!bgmStream.getAudioTracks().some(t=>t.readyState==='live')){
      resetUI();alert('録画用音声を開始できません。RECを押して再試行してください。');return;
    }
    for(const tr of bgmStream.getAudioTracks())stream.addTrack(tr);`);
 one("    recorder.onerror=e=>{console.warn('Recording error',e);resetUI();};",
     "    recorder.onerror=e=>{console.warn('Recording error; final data retained until onstop',e);};");
 // EASY-only balance: gentler damage, longer recovery window and stronger pickups.
 one("easy:{name:'EASY',damage:.5,invulnerability:.85}",
     "easy:{name:'EASY',damage:.25,invulnerability:1.6}");
 one("const gain=Math.min(20,100-hull);",
     "const gain=Math.min(hullDifficulty==='easy'?40:20,100-hull);");
 one("EASY：被弾ダメージ半減 ／ NORMAL：標準 ／ HARD：被弾ダメージ1.75倍",
     "EASY：被弾ダメージ25％・無敵1.6秒・回復40 ／ NORMAL：標準 ／ HARD：被弾ダメージ1.75倍");
 // Preserve filenames in the source tree, but never reuse a cache-first URL
 // for executable assets in a new HTML build (including under an older SW).
 const encoderHash=createHash('sha256').update(await readFile(new URL('./encoder/worker.js',root))).digest('hex').slice(0,12);
 const names=[];
 for(const name of ['mp4-share','linux-music-recovery']){
  const bytes=await readFile(new URL(name+'.js',root));
  const hash=createHash('sha256').update(bytes).update(encoderHash).digest('hex').slice(0,12);
  const target=name+'.'+hash+'.js';names.push(target);
  one('<script src="./'+name+'.js"></script>','<script src="./'+target+'"></script>');
  await writeFile(new URL(target,out),bytes);
  await rm(new URL(name+'.js',out));
 }
 await cp(new URL('encoder/',root),new URL('encoder/',out),{recursive:true});
 const build=createHash('sha256').update(h).digest('hex').slice(0,12);
 h=h.replace('</head>','<meta name="jiji-build" content="'+build+'">\n</head>');
 let sw=await readFile(new URL('sw.js',root),'utf8');
 for(let i=0;i<names.length;i++)sw=sw.replace(['mp4-share.js','linux-music-recovery.js'][i],names[i]);
 sw=sw.replace('BUILD_ID',build);
 await writeFile(new URL('sw.js',out),sw);
 await writeFile(outputHtml,h);
 await writeFile(new URL('_headers',out),'/*\n  Cache-Control: no-cache\n');
 console.log('Recording build '+build+'; explicit exporter, versioned scripts, same-origin browser encoder.');
}
