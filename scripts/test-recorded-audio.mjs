import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const root=resolve('dist');
const mimetypes={'.html':'text/html; charset=utf-8','.mp3':'audio/mpeg','.js':'text/javascript',
'.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
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
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const base='http://127.0.0.1:'+server.address().port;
const tmp=await mkdtemp(join(tmpdir(),'jiji-recs-'));
let saved=0;
async function validateSavedVideo(page,label,stop){
 const promise=page.waitForEvent('download',{timeout:24000});
 if(stop)await page.locator('#recordToggle').click();
 const file=await promise;
 const path=join(tmp,label+(file.suggestedFilename().endsWith('.mp4')?'.mp4':'.webm'));
 await file.saveAs(path);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',path],{encoding:'utf8'}));
 const a=info.streams.filter(x=>x.codec_type==='audio');
 const v=info.streams.filter(x=>x.codec_type==='video');
 if(!a.length||!v.length)throw Error(label+' saved file missing audio/video tracks: '+JSON.stringify(info.streams.map(x=>x.codec_type)));
 const ff=execFileSync('ffmpeg',['-hide_banner','-nostats','-i',path,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
async function auditFile(page,label,stop){
 const promise=page.waitForEvent('download',{timeout:150000});
 if(stop)await page.locator('#recordToggle').click();
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
 console.log(label+' RECORDING WITH AUDIO OK: '+match[1]+' dB '+JSON.stringify(streams));
}

try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1180,height:700},
   isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
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
  for(let take=1;take<=2;take++){
   await page.locator('#recordToggle').click();
   await page.waitForFunction(()=>window.JIJI_MEDIA?.recording,{timeout:9000});
   await page.waitForTimeout(2100);
   await auditFile(page,(mobile?'mobile':'desktop')+'-take-'+take,true);
   await page.waitForFunction(()=>!window.JIJI_MEDIA?.recording,{timeout:9000});
  }
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
 console.log('TOTAL AUDIBLE SAVED VIDEO FILES: '+saved);
}finally{
 await browser.close();
 await new Promise(done=>server.close(done));
}
