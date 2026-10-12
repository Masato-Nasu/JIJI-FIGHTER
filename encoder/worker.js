/* Same-origin classic worker using the single-thread core directly.
 * No UMD wrapper worker, nested worker, SharedArrayBuffer or CDN required. */
'use strict';
self.onmessage=async({data})=>{
 let core;
 try{
  const phase=text=>self.postMessage({phase:text});
  phase('変換エンジンを取得中');
  const get=async name=>{
   const r=await fetch(new URL(name,self.location.href),{signal:AbortSignal.timeout(60000)});
   if(!r.ok)throw Error(name+' HTTP '+r.status);
   return r;
  };
  const manifest=await (await get('manifest.json')).json();
  const parts=[];
  for(const [i,part] of manifest.parts.entries()){
   phase('変換エンジンを取得中 '+(i+1)+'/'+manifest.parts.length);
   const bytes=await (await get(part.name)).arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes.byteLength!==part.bytes||hash!==part.sha256)throw Error('変換エンジンの整合性エラー: '+part.name);
   parts.push(bytes);
  }
  phase('変換エンジンを起動中');
  importScripts(new URL('ffmpeg-core.js',self.location.href).href);
  const wasmBinary=new Uint8Array(await new Blob(parts).arrayBuffer());
  core=await self.createFFmpegCore({wasmBinary});
  let log='';
  core.setLogger(({message})=>{log=(log+'\n'+message).slice(-2400);});
  core.setProgress(({progress})=>{
   if(Number.isFinite(progress)&&progress>=0&&progress<=1)phase('H.264/AACへ変換中 '+Math.round(progress*100)+'%');
  });
  core.FS.writeFile('input',new Uint8Array(data.bytes));
  phase('H.264/AACへ変換中');
  core.setTimeout(300000);
  core.exec('-y','-i','input','-map','0:v:0','-map','0:a:0',
   '-c:v','libx264','-preset','ultrafast','-crf','24',
   '-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-pix_fmt','yuv420p','-r','30',
   '-c:a','aac','-profile:a','aac_low','-b:a','128k','-ar','44100','-ac','2',
   '-movflags','+faststart','output.mp4');
  if(core.ret!==0)throw Error('FFmpeg終了コード '+core.ret+': '+log);
  const result=core.FS.readFile('output.mp4');
  self.postMessage({bytes:result.buffer},[result.buffer]);
 }catch(e){self.postMessage({error:String(e?.message||e)});}
};
