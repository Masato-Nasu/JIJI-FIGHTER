import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';

const root=resolve(process.env.JIJI_TEST_ROOT||'dist');
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/embed'){
    res.setHeader('Content-Type','text/html');
    res.end('<style>body{margin:0}iframe{width:100vw;height:100dvh;border:0}</style><iframe src="/"></iframe>');return;
  }
  try{
    const rel=path==='/'?'index.html':decodeURIComponent(path.slice(1));
    if(rel.includes('..'))throw Error('unsafe path');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mp3':'audio/mpeg'})[extname(rel)]||'application/octet-stream');
    res.end(await readFile(resolve(root,rel)));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
try{
  for(const engine of process.env.JIJI_TEST_WEBKIT?[chromium,webkit]:[chromium]){
    const browser=await engine.launch({headless:true,args:engine===chromium?['--no-sandbox']:[]});
    try{
      for(const [mobile,embedded,viewport] of [
        [true,false,{width:390,height:844}],
        [true,true,{width:844,height:390}],
        [false,false,{width:1280,height:780}]
      ]){
        const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.route('**/api/trends',r=>r.fulfill({status:503,body:'{"items":[]}'}));
        await page.goto(base+(embedded?'/embed':'/'),{waitUntil:'domcontentloaded'});
        const game=embedded?page.frames().find(f=>f.parentFrame()):page;
        await game.locator('#classicMode').click();
        await game.locator('#startButton').click();
        await game.waitForFunction(()=>window.JIJI_FIGHTER?.state.mode==='playing');
        await game.evaluate(()=>window.JIJI_FIGHTER.debugNoSpawns());
        const mode=()=>game.evaluate(()=>window.JIJI_FIGHTER.state.mode);
        if(mobile){
          await game.locator('#scene').tap({position:{x:100,y:210}});
          assert.equal(await mode(),'playing','ordinary touch must not pause');
          const fire=await game.locator('#fireButton').boundingBox();
          await page.mouse.move(fire.x+fire.width/2,fire.y+fire.height/2);
          await page.mouse.down();
          await game.evaluate(()=>window.dispatchEvent(new Event('blur')));
          assert.equal(await mode(),'playing','visible mobile blur must not pause');
          assert.equal(await game.evaluate(()=>window.JIJI_FIGHTER.state.laserHeld),true,'focus jitter must not cancel held fire');
          await page.mouse.up();
        }else{
          await game.evaluate(()=>window.dispatchEvent(new Event('blur')));
          assert.equal(await mode(),'paused','desktop blur must still pause');
          await game.locator('#resumeButton').click();
        }
        await game.locator('#pauseButton').click();
        assert.equal(await mode(),'paused','explicit PAUSE must work');
        await game.locator('#resumeButton').click();
        assert.equal(await mode(),'playing','RESUME must work');
        await game.evaluate(()=>{
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        assert.equal(await mode(),'paused','backgrounding must still pause');
        assert.deepEqual(errors,[]);
        console.log(`PASS ${engine.name()} ${mobile?'touch':'desktop'} ${embedded?'iframe':'direct'}: input, blur, PAUSE, RESUME, background`);
        await context.close();
      }
    }finally{await browser.close();}
  }
}finally{await new Promise(r=>server.close(r));}
