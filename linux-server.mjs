import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=new URL('./',import.meta.url);
// Reuse the same provider, parsing and filtering as the deployed game.
const source=await readFile(new URL('functions/api/trends.js',root),'utf8');
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const assets=new Map([
  ['/manifest.webmanifest',['manifest.webmanifest','application/manifest+json']],
  ['/sw.js',['sw.js','text/javascript']],
  ...['icon-192.png','icon-512.png','apple-touch-icon.png'].map(n=>['/icons/'+n,['icons/'+n,'image/png']]),
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/music/mazz-db-2017.mp3',['music/mazz-db-2017.mp3','audio/mpeg']]
]);
let cached=null,expires=0;
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  const origin='http://127.0.0.1:'+server.address().port;
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end('Forbidden');return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try{
    const url=new URL(req.url,origin);
    if(url.pathname==='/api/trends'){
      if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('Forbidden');return;}
      let result=cached;
      if(!result||Date.now()>=expires){
        const response=await onRequestGet({request:new Request(origin+'/api/trends')});
        result={status:response.status,body:await response.text()};
        if(response.ok){cached=result;expires=Date.now()+600000;}
      }
      res.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:result.body);return;
    }
    const asset=assets.get(url.pathname);
    if(!asset){res.writeHead(404);res.end('Not found');return;}
    const body=await readFile(new URL(asset[0],root));
    if(url.pathname==='/sw.js')res.setHeader('Cache-Control','no-cache');
    res.writeHead(200,{'Content-Type':asset[1],'Content-Length':body.length});
    res.end(req.method==='HEAD'?undefined:body);
  }catch(error){
    console.error('取得エラー:',error.message);
    res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:'LOCAL_SERVER_ERROR'}));
  }
});
server.listen(0,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+server.address().port;
  console.log('JIJI FIGHTER v0.11.0\n'+url+'\n話題語の取得には初回30秒ほどかかる場合があります。\nこのターミナルは開いたままにしてください。終了: Ctrl+C');
  if(process.env.JIJI_NO_OPEN!=='1'){
    const child=spawn('xdg-open',[url],{stdio:'ignore'});
    child.on('error',()=>console.log('上記URLをブラウザで開いてください。'));
  }
});
process.on('SIGINT',()=>{server.close();server.closeAllConnections();});
