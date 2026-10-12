import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const temp=await mkdtemp(join(tmpdir(),'jiji-linux-smoke-'));
const recording=join(temp,'input.webm'),output=join(temp,'output.mp4');
const proc=spawn(process.execPath,['linux-server.mjs'],{
 env:{...process.env,JIJI_NO_OPEN:'1'},stdio:['ignore','pipe','pipe']
});
let address='',log='';
let readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
const onText=bytes=>{
 log+=String(bytes);
 if(!address){
  const match=log.match(/http:\/\/127\.0\.0\.1:\d+/);
  if(match){address=match[0];readyResolve()}
 }
};
proc.stdout.on('data',onText);
proc.stderr.on('data',onText);
proc.on('error',readyReject);
proc.on('exit',code=>{if(!address)readyReject(Error('Local server exited: '+code+' '+log.slice(-800)))});
try{
 await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Local server start timed out: '+log)),15000))]);
 const html=await (await fetch(address+'/')).text();
 const exporter=html.match(/src="(.\/mp4-share\.[a-f0-9]+\.js)"/)[1];
 const js=await fetch(new URL(exporter,address),{cache:'no-store'});
 if(!js.ok)throw Error('Linux recording bridge HTTP '+js.status);
 const body=await js.text();
 if(!body.includes('api/export-mp4')||!body.includes('元動画を保存')||body.includes('Worker・WASMを初期化中'))
  throw Error('Wrong/old video exporter served by local Linux server');
 // Real Linux server must support byte-range MP3 requests from Chrome.
 const musicRange=await fetch(address+'/music/mazz-db-2017.mp3',{headers:{Range:'bytes=0-1023'}});
 if(musicRange.status!==206)throw Error('Chrome MP3 range should return HTTP 206; got '+musicRange.status);
 if(musicRange.headers.get('content-range')?.startsWith('bytes 0-1023/')!==true)
  throw Error('MP3 Content-Range invalid '+musicRange.headers.get('content-range'));
 const audioChunk=await musicRange.arrayBuffer();
 if(audioChunk.byteLength!==1024)throw Error('MP3 partial response length '+audioChunk.byteLength);
 const browser=await chromium.launch({headless:true,...(process.env.JIJI_CHROME_BIN?{executablePath:process.env.JIJI_CHROME_BIN}:{}),...(process.env.JIJI_CHROME_CHANNEL?{channel:process.env.JIJI_CHROME_CHANNEL}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(address+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#classicMode').click();
  await page.locator('#startButton').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#startButton').disabled,null,{timeout:28000});
  await page.locator('#startButton').click();
  try{
   await page.waitForFunction(()=>document.querySelector('#bgm')?.currentTime>.35,null,{timeout:18000});
  }catch(e){
   const state=await page.evaluate(()=>{
    const audio=document.querySelector('#bgm');
    return {src:audio?.currentSrc,code:audio?.error?.code,message:audio?.error?.message,
      networkState:audio?.networkState,readyState:audio?.readyState,paused:audio?.paused,
      label:document.querySelector('#musicToggle')?.textContent};
   });
   throw Error('Real Linux server BGM playback failed: '+JSON.stringify(state)+' pageErrors='+errors.slice(0,3).join(';')+' '+e.message);
  }
  const result=await page.evaluate(()=>({label:document.querySelector('#musicToggle')?.textContent,
   muted:document.querySelector('#bgm')?.muted,paused:document.querySelector('#bgm')?.paused}));
  if(result.paused||result.muted||result.label?.includes('ERROR'))throw Error('Music broken: '+JSON.stringify(result));
  console.log('REAL LOCAL LINUX BGM OK, audio/MPEG HTTP 206, browser playback (see selected Playwright executable)');
  // Force a genuine media load failure. Recovery must fetch the original
  // unmodified MP3 as a Blob and resume with the SAME audio element, preserving
  // the game's MediaStream audio recording graph.
  await page.evaluate(()=>{
   const audio=document.querySelector('#bgm');
   window.JIJI_MUSIC_DIAGNOSTIC.recovered=false;
   audio.src='/__missing-music__.mp3';
   audio.load();
  });
  await page.waitForFunction(()=>window.JIJI_MUSIC_DIAGNOSTIC?.attempted,{timeout:12000});
  await page.waitForFunction(()=>{
   const audio=document.querySelector('#bgm');
   return window.JIJI_MUSIC_DIAGNOSTIC?.recovered&&!audio.paused&&audio.currentTime>.25;
  },null,{timeout:30000});
  const recovered=await page.evaluate(()=>window.JIJI_MUSIC_DIAGNOSTIC);
  if(recovered.downloadStatus!==200||recovered.bytes<100000||
    !recovered.recovered)throw Error('BGM Blob fallback invalid: '+JSON.stringify(recovered));
  console.log('REAL LOCAL LINUX MUSIC ERROR RECOVERY OK',JSON.stringify(recovered));
  await page.close();
 }finally{await browser.close();}
 const response=await fetch(address+'/api/export-mp4');
 if(response.status!==405)throw Error('Local FFmpeg API GET unexpectedly returned HTTP '+response.status);
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=black:s=322x241:r=20:d=1.4',
  '-f','lavfi','-i','sine=frequency=880:sample_rate=44100:duration=1.4',
  '-c:v','libvpx','-b:v','180k','-c:a','libopus','-shortest',recording]);
 const payload=await readFile(recording);
 const converted=await fetch(address+'/api/export-mp4',{
  method:'POST',headers:{'Content-Type':'video/webm','Origin':address},body:payload
 });
 if(!converted.ok)throw Error('Local FFmpeg conversion returned '+converted.status+' '+await converted.text());
 if(converted.headers.get('X-JIJI-Video-Codecs')!=='h264,aac')throw Error('Missing verified codec header');
 await writeFile(output,Buffer.from(await converted.arrayBuffer()));
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'})).streams;
 if(!streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'))
  throw Error('H264/AAC absent from Linux MP4 '+JSON.stringify(streams.map(s=>[s.codec_type,s.codec_name])));
 console.log('LOCAL LINUX EXPORT OK:',address,'H264 + AAC',payload.length,'input bytes');
}finally{
 proc.kill('SIGINT');
 await rm(temp,{recursive:true,force:true});
}
