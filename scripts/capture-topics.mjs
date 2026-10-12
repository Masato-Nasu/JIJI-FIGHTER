// Capture a real game-canvas screenshot with a reproducible, clearly DEMO word set.
// This does not affect production gameplay, live topics or the website build.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname, dirname, join} from 'node:path';

const root=resolve('.');
const words=['台風','経済','地震','宇宙','半導体','物価','科学','速報',
  '鉄道','防災','新幹線','研究','生成AI','映画公開','気象','世界大会'];
const items=words.map((text,i)=>({text,rank:i+1,source:'google-news'}));
const host='127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.png':'image/png','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/api/trends'){
      const payload=JSON.stringify({source:'public-trends',items,sample_count:0,
        sources:{googleNews:{ok:true,count:items.length}}});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(payload);return;
    }
    const safe=decodeURIComponent(pathname).replace(/^\/+/,'')||'index.html';
    if(safe.split('/').includes('..')){res.writeHead(400);res.end();return;}
    const body=await readFile(resolve(root,safe));
    res.writeHead(200,{'Content-Type':mime[extname(safe)]||'application/octet-stream'});
    res.end(body);
  }catch(e){res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,host,resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://'+host+':'+port+'/index.html',{waitUntil:'domcontentloaded',timeout:90000});
  await page.locator('#startButton').waitFor({timeout:30000});
  await page.waitForFunction(()=>window.JIJI_FIGHTER?.state?.trendReady,{timeout:30000});
  await page.locator('#startButton').click();
  await page.waitForTimeout(900);
  const debug=await page.evaluate(()=>Boolean(window.JIJI_FIGHTER?.debugTrend));
  if(debug){
    await page.evaluate(()=>{
      const g=window.JIJI_FIGHTER;
      g.debugNoSpawns?.();
      g.debugClearEnemies?.();
      // Let the initial stage banner fade, without depending on wall routing.
      for(let n=0;n<110;n++)g.debugStep?.(.025);
      g.debugClearEnemies?.();
      g.debugSetTravel?.(35);
      const positions=[[-34,16,115],[-11,18,125],[12,14,135],[34,17,115],
        [-30,7,176],[-9,9,166],[13,12,172],[32,8,180]];
      const names=['台風','経済','地震','宇宙','半導体','物価','科学','速報'];
      for(let i=0;i<names.length;i++){
        const [x,y,z]=positions[i];
        const e=g.debugTrend(names[i],i+8,x,y,z);
        e.fire=999;
      }
      g.debugSetHull?.(100);
      document.getElementById('systemMessage')?.classList.remove('visible');
      g.debugRender?.();
    });
  }else{
    // If the debug interface is unavailable in a later version,
    // capture real gameplay rather than manufacturing a static graphic.
    await page.waitForTimeout(7000);
  }
  await mkdir(join(root,'docs'),{recursive:true});
  await page.locator('#scene').screenshot({path:join(root,'docs','japanese-topics.png'),animations:'disabled'});
  if(errors.length)console.warn('Browser warnings:',errors.slice(0,3));
  console.log('Captured docs/japanese-topics.png'+(debug?' with eight distinct visible 3D words':' from live game canvas'));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
