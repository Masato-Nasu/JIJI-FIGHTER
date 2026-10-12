// Regression: a waiting old service worker, nested hosting path, failed exports,
// and multiple completed takes must not run old code or discard recordings.
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
if(process.env.JIJI_TEST_OUTPUT)await mkdir(process.env.JIJI_TEST_OUTPUT,{recursive:true});
const temp=await mkdtemp(join(process.env.JIJI_TEST_OUTPUT||tmpdir(),'jiji-upgrade-'));
const input=join(temp,'input.webm');
execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=s=320x240:r=15:d=0.5',
 '-f','lavfi','-i','sine=frequency=880:duration=0.5','-c:v','libvpx','-c:a','libopus','-shortest',input]);
const source=await readFile(input),hash=b=>createHash('sha256').update(b).digest('hex');
const prefix='/tools/jiji-fighter/';
let legacy=true,fail=true,apiCalls=0;
const mime={'.js':'text/javascript','.html':'text/html','.json':'application/json','.mp3':'audio/mpeg','.png':'image/png'};
const legacySW=`self.addEventListener('install',e=>e.waitUntil(caches.open('old-jiji-test').then(c=>c.put('./mp4-share.js',new Response('window.__OLD_EXPORTER_RAN=true',{headers:{'Content-Type':'text/javascript'}})))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname.endsWith('/mp4-share.js'))e.respondWith(caches.match(e.request));});`;
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!path.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const name=path.slice(prefix.length)||'index.html';
  if(name==='seed.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Old PWA</title>');return;}
  if(name==='sw.js'&&legacy){res.setHeader('Content-Type','text/javascript');res.end(legacySW);return;}
  if(name==='fixture.webm'){res.setHeader('Content-Type','video/webm');res.end(source);return;}
  if(name==='api/export-mp4')apiCalls++;
  if(name.startsWith('api/')||(fail&&name.endsWith('.part0'))){res.writeHead(404);res.end();return;}
  if(name.includes('..'))throw Error('invalid');
  const bytes=await readFile(join('dist',name));
  res.setHeader('Content-Type',mime[extname(name)]||'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+prefix;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 await page.goto(base+'seed.html');
 await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>navigator.serviceWorker.controller);
 legacy=false;
 await page.goto(base,{waitUntil:'load'});
 const state=await page.evaluate(()=>({old:window.__OLD_EXPORTER_RAN,current:window.JIJI_EXPORT?.state.build,
  scripts:[...document.scripts].map(s=>s.src).filter(s=>/mp4-share/.test(s)),controlled:!!navigator.serviceWorker.controller}));
 if(state.old||!state.current||state.scripts.length!==1||!state.controlled)throw Error('Upgrade failed '+JSON.stringify(state));
 console.log('OLD SW / VERSIONED SCRIPT / SUBPATH OK',state.current);
 const downloads=[];
 page.on('download',d=>downloads.push(d));
 await page.evaluate(async()=>{
  const blob=await (await fetch('./fixture.webm')).blob();
  await Promise.all([window.JIJI_EXPORT.saveRecording(blob),window.JIJI_EXPORT.saveRecording(blob)]);
 });
 await page.waitForFunction(()=>window.JIJI_EXPORT.state.pending===0&&window.JIJI_EXPORT.state.failed===2);
 if(downloads.length!==2)throw Error('Expected two backups, got '+downloads.length);
 for(const [i,d] of downloads.entries()){
  const file=join(temp,'backup-'+i+'.webm');await d.saveAs(file);
  if(hash(await readFile(file))!==hash(source))throw Error('Backup bytes lost');
 }
 if(await page.getByRole('button',{name:'元動画を保存',exact:true}).count()!==2)throw Error('Earlier failed recording inaccessible');
 console.log('QUEUED FAILURES KEEP BOTH ORIGINALS (SHA-256 exact)');
 fail=false;
 const pending=page.waitForEvent('download',{timeout:180000});
 await page.evaluate(async()=>window.JIJI_EXPORT.saveRecording(await (await fetch('./fixture.webm')).blob()));
 const d=await pending,file=join(temp,'recovered.mp4');await d.saveAs(file);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'})).streams;
 if(!streams.some(s=>s.codec_name==='h264')||!streams.some(s=>s.codec_name==='aac'))throw Error('Recovery codecs incorrect');
 if(apiCalls!==0)throw Error('Public page tried local export API');
 console.log('RETRY AFTER FAILED WORKER OK: H.264/AAC; zero local export API calls; '+temp);
}finally{await browser.close();await new Promise(r=>server.close(r));}
