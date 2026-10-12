import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.mp3':'audio/mpeg',
'.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/api/trends'){
    res.writeHead(503,{'Content-Type':'application/json'});res.end('{"items":[]}');return;
  }
  const rel=p==='/'?'index.html':decodeURIComponent(p.slice(1));
  if(rel.includes('..'))throw Error('unsafe pathname');
  const b=await readFile(resolve(root,rel));
  res.writeHead(200,{'Content-Type':mime[extname(rel)]||'application/octet-stream'});res.end(b);
 }catch(e){res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const base='http://127.0.0.1:'+server.address().port;
try{
 for(const mobile of [false,true]){
  for(const kind of ['simultaneous-bullets','3d-word-impact']){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1200,height:760},
      isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#classicMode').click();
   await page.locator('#startButton').click();
   await page.waitForFunction(()=>window.JIJI_FIGHTER?.state?.mode==='playing',{timeout:22000});
   // Actual lethal damage path, with >1 projectile in the same update:
   // Old code cleared the array in beginDestruction, then accessed
   // an undefined next projectile, halting the animation frame.
   const first=await page.evaluate(kind=>{
    const g=window.JIJI_FIGHTER;
    g.debugNoSpawns();g.debugClearEnemies();g.debugClearGroundTargets();
    g.debugSetTravel(50);g.debugSetHull(6);g.debugSetDamageCooldown(0);
    if(kind==='simultaneous-bullets'){
      for(let i=0;i<3;i++)g.debugAddEnemyShot(g.state.x,g.state.y,10,0,0);
    }else{
      // Word is a physical wireframe and can hit the aircraft too.
      g.debugSpawnTrendContact('upper','台風');
    }
    g.debugStep(.045);g.debugRender();
    return {mode:g.state.mode,hull:g.state.hull,blast:g.state.shipDestroyed,
      destructionAge:g.state.destructionAge,bgmPaused:document.querySelector('#bgm').paused,
      hud:document.querySelector('#hullValue').textContent,
      fireVisible:document.querySelector('#scene').width>0};
   },kind);
   if(first.mode!=='destroying'||first.hull!==0||!first.blast||first.hud!=='0%')
      throw Error(JSON.stringify({mobile,kind,first})+' failed to show explosion');
   if(!first.fireVisible)throw Error('Canvas missing');
   if(first.bgmPaused)throw Error('Music must continue throughout blast');
   await page.evaluate(()=>{const g=window.JIJI_FIGHTER;g.debugStep(.65);g.debugRender();});
   const mid=await page.evaluate(()=>({mode:window.JIJI_FIGHTER.state.mode,
     blast:window.JIJI_FIGHTER.state.shipDestroyed,
     age:window.JIJI_FIGHTER.state.destructionAge}));
   if(mid.mode!=='destroying'||!mid.blast||mid.age<.6)throw Error('Blast did not continue '+JSON.stringify(mid));
   await page.evaluate(()=>window.JIJI_FIGHTER.debugStep(3));
   const ended=await page.evaluate(()=>window.JIJI_FIGHTER.state.mode);
   if(ended!=='over')throw Error('No proper GAME OVER after blast '+ended);
   await page.waitForTimeout(1750);
   if(!await page.locator('#bgm').evaluate(a=>a.paused))throw Error('BGM did not fade after explosion');
   if(errors.length)throw Error('Browser page errors: '+errors.join('; '));
   console.log((mobile?'Mobile':'Desktop')+' '+kind+' HULL 0 -> visible 2.4s destruction -> GAME OVER -> music fade OK');
   await ctx.close();
  }
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
