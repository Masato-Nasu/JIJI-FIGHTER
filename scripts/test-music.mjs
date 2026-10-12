import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.mp3':'audio/mpeg','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/trends'){
      res.writeHead(503,{'Content-Type':'application/json'});
      res.end('{"source":"unavailable","items":[]}');return;
    }
    const relative=path==='/'?'index.html':decodeURIComponent(path.slice(1));
    if(relative.includes('..'))throw Error('bad path');
    const body=await readFile(resolve(root,relative));
    res.writeHead(200,{'Content-Type':mime[extname(relative)]||'application/octet-stream'});
    res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:780},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#classicMode').click();
    await page.locator('#startButton').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('#startButton').disabled,{timeout:25000});
    await page.locator('#startButton').click();
    await page.waitForFunction(()=>document.querySelector('#bgm')?.currentTime>.35,{timeout:15000});
    const result=await page.evaluate(()=>{
      const a=document.querySelector('#bgm');
      return {paused:a.paused,muted:a.muted,time:a.currentTime,error:a.error?.message,loop:a.loop,
        label:document.querySelector('#musicToggle')?.textContent,
        file:a.currentSrc.split('/').pop()};
    });
    if(result.paused||result.muted||!result.loop||result.error||!result.file.includes('mazz-db-2017.mp3'))throw Error('Playback failed: '+JSON.stringify(result));
    await page.locator('#musicToggle').click();
    if(!await page.locator('#bgm').evaluate(a=>a.paused))throw Error('Pause failed');
    await page.locator('#musicToggle').click();
    await page.waitForFunction(()=>!document.querySelector('#bgm').paused);
    // Verify the gameplay STOP control, softer default sound levels and death.
    if((await page.locator('#audioButton').textContent()).trim()!=='SFX ON')throw Error('SFX must be ON initially');
    if(Math.abs(await page.locator('#bgm').evaluate(a=>a.volume)-.28)>.001)throw Error('BGM volume was not reduced');
    if(!await page.locator('#stopGameButton').isVisible())throw Error('STOP GAME button not shown');
    await page.locator('#stopGameButton').click();
    await page.waitForFunction(()=>!document.querySelector('#intro').classList.contains('hidden'));
    if(!await page.locator('#bgm').evaluate(a=>a.paused))throw Error('BGM continued after STOP GAME');
    if(await page.locator('#stopGameButton').isVisible())throw Error('STOP GAME should hide on title');
    await page.locator('#startButton').click();
    await page.waitForFunction(()=>document.querySelector('#bgm').currentTime>.20,{timeout:15000});
    await page.evaluate(()=>{
      const game=window.JIJI_FIGHTER;
      const wall=game.state.wallDistances.find(w=>w.realm==='upper');
      if(!wall)throw Error('No upper wall found for death test');
      game.debugSetAltitude(0);
      game.debugSetTravel(wall.at-4);
      for(let i=0;i<6 && game.state.mode==='playing';i++)game.debugStep(.04);
    });
    if((await page.evaluate(()=>window.JIJI_FIGHTER.state.mode))!=='destroying')
      throw Error('Expected wall collision to trigger destruction');
    if(await page.locator('#bgm').evaluate(a=>a.paused))
      throw Error('BGM should CONTINUE during the fatal explosion');
    await page.evaluate(()=>window.JIJI_FIGHTER.debugStep(3));
    if((await page.evaluate(()=>window.JIJI_FIGHTER.state.mode))!=='over')
      throw Error('Expected GAME OVER after explosion');
    if(await page.locator('#bgm').evaluate(a=>a.paused))
      throw Error('BGM must not stop immediately when the explosion ends');
    await page.waitForTimeout(1750);
    if(!await page.locator('#bgm').evaluate(a=>a.paused))
      throw Error('BGM did not fade and stop after the post-explosion tail');
    console.log((mobile?'Mobile':'Desktop')+' STOP, SFX defaults, post-explosion music fade OK');
    if(errors.length)throw Error('Script errors: '+errors.slice(0,3).join('; '));
    console.log((mobile?'Mobile':'Desktop')+' BGM OK',JSON.stringify(result));
    await context.close();
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
