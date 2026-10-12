import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {handleRecordingExport} from '../linux-recording-export.mjs';

const root=resolve('dist');
const mimetypes={'.html':'text/html; charset=utf-8','.mp3':'audio/mpeg','.js':'text/javascript',
'.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/recording-capabilities'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({backend:process.env.JIJI_WEB_EXPORT?'browser':'local-ffmpeg'}));return;
  }
  if(path==='/api/export-mp4'){
    if(process.env.JIJI_WEB_EXPORT){res.writeHead(404);res.end('No server encoder in web test');return;}
    await handleRecordingExport(req,res,'http://127.0.0.1:'+server.address().port);return;
  }
  if(path==='/api/trends'){
   res.writeHead(503,{'Content-Type':'application/json'});
   res.end('{"items":[]}');return;
  }
  const rel=path==='/'?'index.html':decodeURIComponent(path.slice(1));
  if(rel.includes('..'))throw Error('Bad path');
  const data=await readFile(resolve(root,rel));
  res.writeHead(200,{'Content-Type':mimetypes[extname(rel)]||'application/octet-stream'});
  res.end(data);
 }catch(e){res.writeHead(404);res.end(e.message);}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,...(process.env.JIJI_CHROME_BIN?{executablePath:process.env.JIJI_CHROME_BIN}:{}),...(process.env.JIJI_CHROME_CHANNEL?{channel:process.env.JIJI_CHROME_CHANNEL}:{}),args:['--no-sandbox']});
let base='http://127.0.0.1:'+server.address().port;
let localServer;
if(!process.env.JIJI_WEB_EXPORT){
 localServer=spawn(process.execPath,['linux-server.mjs'],{env:{...process.env,JIJI_NO_OPEN:'1'},stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{
  let log='';const timer=setTimeout(()=>reject(Error('Local server startup: '+log)),15000);
  localServer.stdout.on('data',chunk=>{log+=chunk;const match=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  localServer.on('error',reject);
 });
}
console.log('TEST ORIGIN',base,process.env.JIJI_WEB_EXPORT?'static web (no conversion API)':'actual linux-server.mjs');
if(process.env.JIJI_TEST_OUTPUT)await mkdir(process.env.JIJI_TEST_OUTPUT,{recursive:true});
const tmp=await mkdtemp(join(process.env.JIJI_TEST_OUTPUT||tmpdir(),'jiji-recs-'));
let saved=0;
async function auditFile(page,label,stop){
 const promise=page.waitForEvent('download',{timeout:150000});
 if(stop){await page.locator('#recordToggle').click();await page.evaluate(()=>{if(window.JIJI_FIGHTER.state.mode==='playing')document.querySelector('#pauseButton').click();});}
 const dl=await promise.catch(async e=>{
   const status=await page.locator('#jiji-mp4-status').textContent().catch(()=>null);
   throw Error('Video export download missing; MP4 status='+String(status)+'; '+e.message);
 });
 const path=join(tmp,label+(dl.suggestedFilename().endsWith('.mp4')?'.mp4':'.webm'));
 try{await dl.saveAs(path);}catch(e){
  const status=await page.locator('#jiji-mp4-status').textContent().catch(()=>null);
  throw Error('Recorded download canceled: suggested='+dl.suggestedFilename()+' status='+status+' error='+e.message);
 }
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',path],{encoding:'utf8'}));
 const streams=info.streams.map(x=>({type:x.codec_type,codec:x.codec_name}));
 if(!streams.some(x=>x.type==='audio')||!streams.some(x=>x.type==='video'))
   throw Error(label+' missing audio/video tracks '+JSON.stringify(streams));
 
 if(label.startsWith('desktop')&&
    (!streams.some(x=>x.type==='video'&&x.codec==='h264')||
     !streams.some(x=>x.type==='audio'&&x.codec==='aac')))
   throw Error(label+' is not H.264 video + AAC audio: '+JSON.stringify(streams));
 let stderr='';
 try{execFileSync('ffmpeg',['-hide_banner','-nostats','-i',path,'-vn','-af','volumedetect','-f','null','-'],
   {encoding:'utf8',stdio:['ignore','pipe','pipe']});}
 catch(e){stderr=String(e.stderr||'');if(e.status!==0)throw Error('FFmpeg failed '+stderr.slice(-550));}
 if(!stderr){
  const proc=await import('node:child_process');
  const out=proc.spawnSync('ffmpeg',['-hide_banner','-nostats','-i',path,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8'});
  if(out.status!==0)throw Error('Decode failed '+out.stderr.slice(-350));
  stderr=out.stderr;
 }
 const match=stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
 if(!match||!(Number(match[1])>-65))
   throw Error(label+' audio track is silent '+(match?.[0]||'no volume')+' '+stderr.slice(-250));
 saved++;
 console.log('EXPORT BACKEND',await page.evaluate(()=>window.JIJI_EXPORT?.state));
 console.log(label+' RECORDING WITH AUDIO OK: '+match[1]+' dB '+JSON.stringify(streams));
}

try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1180,height:700},
   isMobile:mobile,hasTouch:mobile,userAgent:mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':undefined,acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{
    if(message.type()==='error'||message.text().includes('JIJI MP4'))
      console.log((mobile?'MOBILE':'DESKTOP')+' BROWSER: '+message.type()+' '+message.text());
  });
  page.on('dialog',d=>{errors.push('Unexpected alert '+d.message());d.accept();});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#classicMode').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(()=>document.querySelector('#bgm')?.currentTime>.3,{timeout:18000});
  await page.locator('#audioButton').click(); // isolate original BGM in first two takes
  for(let take=1;take<=2;take++){
   await page.evaluate(()=>{const g=window.JIJI_FIGHTER;g.debugSetTravel(0);g.debugClearEnemies();g.debugNoSpawns();g.debugSetDamageCooldown(1000);});
   await page.locator('#recordToggle').click();
   await page.waitForFunction(()=>window.JIJI_MEDIA?.recording,{timeout:9000});
   await page.waitForTimeout(2100);
   await auditFile(page,(mobile?'mobile':'desktop')+'-take-'+take,true);
   await page.waitForFunction(()=>!window.JIJI_MEDIA?.recording,{timeout:9000});
   const close=page.locator('#jiji-mp4-share').getByRole('button',{name:'閉じる',exact:true});
   if(await close.count())await close.click();
   const mode=await page.evaluate(()=>window.JIJI_FIGHTER.state.mode);
   if(mode==='paused')await page.locator('#resumeButton').click();
   else if(mode!=='playing')throw Error('Unexpected game state after take: '+mode);
  }
  await page.locator('#audioButton').click(); // restore laser/blast sound for GAME OVER
  await page.locator('#recordToggle').click();
  await page.waitForFunction(()=>window.JIJI_MEDIA?.recording);
  await page.waitForTimeout(900);
  await page.evaluate(()=>{
   const game=window.JIJI_FIGHTER;
   const wall=game.state.wallDistances.find(w=>w.realm==='upper');
   game.debugSetAltitude(0);game.debugSetTravel(wall.at-4);
   for(let i=0;i<7&&game.state.mode==='playing';i++)game.debugStep(.04);
  });
  if(await page.locator('#bgm').evaluate(a=>a.paused))
    throw Error('Fatal explosion must keep music playing');
  const onSave=auditFile(page,(mobile?'mobile':'desktop')+'-death',false);
  await page.evaluate(()=>window.JIJI_FIGHTER.debugStep(3));
  await onSave;
  if(!await page.locator('#bgm').evaluate(a=>a.paused))
    throw Error('BGM must stop after 800ms tail and fade');
  if(errors.length)throw Error(errors.slice(0,4).join('; '));
  console.log((mobile?'Mobile':'Desktop')+' passed two take recordings and automatic death save');
  await context.close();
 }
 console.log('TOTAL AUDIBLE SAVED VIDEO FILES: '+saved+'; files: '+tmp);
}finally{
 await browser.close();
 localServer?.kill('SIGINT');
 await new Promise(done=>server.close(done));
}
