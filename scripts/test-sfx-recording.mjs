import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const mime={'.html':'text/html; charset=utf-8','.mp3':'audio/mpeg','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
const root=resolve('dist');
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/api/trends'){
    res.writeHead(503,{'Content-Type':'application/json'});res.end('{"items":[]}');return;
  }
  const rel=name==='/'?'index.html':decodeURIComponent(name.slice(1));
  if(rel.includes('..'))throw Error('invalid path');
  const body=await readFile(resolve(root,rel));
  res.writeHead(200,{'Content-Type':mime[extname(rel)]||'application/octet-stream'});res.end(body);
 }catch(error){res.writeHead(404);res.end('missing');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const output=await mkdtemp(join(tmpdir(),'jiji-sfx-'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});

function run(tool,args){
 const r=spawnSync(tool,args,{encoding:'utf8'});
 if(r.status!==0)throw Error(tool+' '+r.stderr?.slice(-500));
 return r;
}
async function record(page,label,bgmOn){
 const audio=page.locator('#bgm'),music=page.locator('#musicToggle');
 if(bgmOn){
   if(await audio.evaluate(el=>el.paused))await music.click();
   await page.waitForFunction(()=>document.querySelector('#bgm').currentTime>.2);
 }else{
   if(!await audio.evaluate(el=>el.paused))await music.click();
   if(!await audio.evaluate(el=>el.paused))throw Error(label+': cannot mute background music');
 }
 await page.locator('#recordToggle').click();
 await page.waitForFunction(()=>window.JIJI_MEDIA?.recording,{timeout:12000});
 await page.evaluate(()=>window.__JIJI_SFX_ROUTED__=0);
 // Fire a real game's laser SFX repeatedly; no external synthesized test signal.
 await page.keyboard.down('Space');
 await page.waitForTimeout(2950);
 await page.keyboard.up('Space');
 const routed=await page.evaluate(()=>window.__JIJI_SFX_ROUTED__);
 if(routed<5)throw Error(label+': SFX were not sent to recording ('+routed+')');
 const pending=page.waitForEvent('download',{timeout:22000});
 await page.locator('#recordToggle').click();
 const download=await pending;
 const path=join(output,label+(download.suggestedFilename().endsWith('.mp4')?'.mp4':'.webm'));
 await download.saveAs(path);
 const streams=JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',path]).stdout).streams;
 if(!streams.some(x=>x.codec_type==='audio')||!streams.some(x=>x.codec_type==='video'))
   throw Error(label+': missing video/audio tracks');
 const stderr=run('ffmpeg',['-hide_banner','-nostats','-i',path,'-vn','-af','volumedetect','-f','null','-']).stderr;
 const m=stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
 if(!m||Number(m[1]) < -58)throw Error(label+': recorded SFX inaudible '+(m?.[0]||'no signal'));
 console.log('SFX MIX OK '+label+' '+routed+' laser events, '+m[1]+' dB, '+JSON.stringify(streams.map(x=>[x.codec_type,x.codec_name])));
 await page.waitForFunction(()=>!window.JIJI_MEDIA?.recording);
}
try{
 for(const mobile of [false,true]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:780},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#classicMode').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(()=>document.querySelector('#bgm')?.currentTime>.25,{timeout:17000});
  if((await page.locator('#audioButton').textContent()).trim()!=='SFX ON')throw Error('SFX not on by default');
  await record(page,(mobile?'mobile':'desktop')+'-sfx-only',false);
  await record(page,(mobile?'mobile':'desktop')+'-bgm-plus-sfx',true);
  if(errors.length)throw Error('Browser errors '+errors.slice(0,3).join(';'));
  console.log((mobile?'Mobile':'Desktop')+' saved BGM+SFX and SFX-only recordings validated');
  await ctx.close();
 }
}finally{
 await browser.close();await new Promise(done=>server.close(done));
}
