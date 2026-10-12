/* Desktop video exporter: local Linux FFmpeg, never browser WebAssembly.
 * Phone path is untouched. On desktop keep a manual original-video download
 * available even when conversion, automatic downloads, or APIs fail. */
(()=>{
'use strict';
if(window.__jijiMp4Bridge)return;
window.__jijiMp4Bridge=true;
const desktop=!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
if(!desktop)return;

const NativeRecorder=window.MediaRecorder;
const nativeTypes=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.4D401E,mp4a.40.2"'];
const nativeType=nativeTypes.find(t=>NativeRecorder?.isTypeSupported?.(t));
if(nativeType){
 window.MediaRecorder=new Proxy(NativeRecorder,{
  construct(target,args){
   try{return Reflect.construct(target,[args[0],{...(args[1]||{}),mimeType:nativeType}],target);}
   catch(e){console.warn('[JIJI MP4] Native encoder declined format',e);return Reflect.construct(target,args,target);}
  },
  get(target,key){if(key==='isTypeSupported')return target.isTypeSupported.bind(target);return Reflect.get(target,key,target);}
 });
}
const originalClick=HTMLAnchorElement.prototype.click;
const createURL=URL.createObjectURL.bind(URL);
const approved=new WeakSet(),sourceBlobs=new Map();
const originalURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=function(data){
 const url=originalURL(data);
 if(data instanceof Blob&&/^video\/(?:webm|mp4)/i.test(data.type)){
  sourceBlobs.set(url,data);
  setTimeout(()=>sourceBlobs.delete(url),10*60*1000);
 }
 return url;
};
let active=false,originalFile=null,mp4File=null,dialog=null;
function save(file){
 const a=document.createElement('a');
 a.download=file.name;a.href=createURL(file);
 approved.add(a);
 document.body.appendChild(a);
 try{originalClick.call(a);}finally{a.remove();}
 setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
function ui(message){
 if(!dialog||!dialog.isConnected){
  dialog=document.createElement('section');
  dialog.id='jiji-mp4-share';
  dialog.style.cssText='position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#090909;color:white;border:1px solid #aaa;padding:12px;min-width:280px;max-width:calc(100vw - 32px);font:13px/1.6 system-ui;text-align:center';
  dialog.innerHTML='<p id="jiji-mp4-status" role="status"></p><button type="button" id="jiji-save-original" style="margin:4px;padding:8px">元動画を保存</button><button type="button" id="jiji-save-mp4" style="margin:4px;padding:8px">MP4を保存</button><button type="button" id="jiji-mp4-close" style="margin:4px;padding:8px">閉じる</button>';
  document.body.appendChild(dialog);
  dialog.querySelector('#jiji-save-original').onclick=()=>{if(originalFile)save(originalFile);};
  dialog.querySelector('#jiji-save-mp4').onclick=()=>{if(mp4File)save(mp4File);};
  dialog.querySelector('#jiji-mp4-close').onclick=()=>{dialog.remove();dialog=null;};
 }
 dialog.querySelector('#jiji-mp4-status').textContent=message;
 dialog.querySelector('#jiji-save-original').hidden=!originalFile;
 dialog.querySelector('#jiji-save-mp4').hidden=!mp4File;
}
function problem(e){return String(e?.message||e||'不明なエラー');}
async function codecInfo(blob){
 const head=new Uint8Array(await blob.slice(0,Math.min(blob.size,5*1024*1024)).arrayBuffer());
 const signature=head.length>=12&&String.fromCharCode(...head.subarray(4,8))==='ftyp';
 if(!signature)return {mp4:false,h264:false,aac:false};
 const chunks=[head];
 if(blob.size>head.byteLength)chunks.push(new Uint8Array(await blob.slice(Math.max(head.byteLength,blob.size-5*1024*1024)).arrayBuffer()));
 const entries=[];
 for(const bytes of chunks){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=4;i+20<=bytes.length;i++){
   if(bytes[i]!==115||bytes[i+1]!==116||bytes[i+2]!==115||bytes[i+3]!==100)continue;
   const size=view.getUint32(i-4),count=view.getUint32(i+8);
   if(size<24||i-4+size>bytes.length||count<1||count>50)continue;
   let start=i+12;
   for(let k=0;k<count&&start+8<=i-4+size;k++){
    const n=view.getUint32(start);
    if(n<8||start+n>i-4+size)break;
    entries.push(String.fromCharCode(...bytes.subarray(start+4,start+8)));
    start+=n;
   }
  }
 }
 return {mp4:true,h264:entries.includes('avc1')||entries.includes('avc3'),aac:entries.includes('mp4a'),entries};
}
function stamp(){return 'JIJI-FIGHTER-'+new Date().toISOString().replace(/[:.]/g,'-');}
async function convert(url,name){
 if(active){ui('すでに別の録画を処理中です。元動画を保存できます。');return;}
 active=true;mp4File=null;
 try{
  let source=sourceBlobs.get(url);
  if(!source){const response=await fetch(url);if(!response.ok)throw Error('録画の読み込み失敗');source=await response.blob();}
  if(source.size<1024)throw Error('録画データが空です');
  const originalExt=/^video\/mp4/i.test(source.type)?'mp4':'webm';
  originalFile=new File([source],stamp()+'-ORIGINAL.'+originalExt,{type:source.type||'video/webm'});
  ui('録画データを確保しました。「元動画を保存」はいつでも押せます。MP4を準備中…');
  const info=await codecInfo(source);
  if(info.mp4&&info.h264&&info.aac){
   mp4File=new File([source],stamp()+'.mp4',{type:'video/mp4'});
   save(mp4File);
   ui('H.264映像＋AAC音声のMP4を保存しました。見つからない場合は「MP4を保存」を押してください。');
   return;
  }
  // The desktop Linux server runs OS FFmpeg. No fragile ffmpeg.wasm worker.
  // On a Cloudflare-hosted copy this endpoint is intentionally unavailable;
  // in that case we immediately save the original recording.
  ui('元動画を確保しました。LinuxのFFmpegでH.264/AACへ変換中…');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),120000);
  let response;
  try{
   response=await fetch('/api/export-mp4',{
    method:'POST',headers:{'Content-Type':source.type||'application/octet-stream'},
    body:source,signal:controller.signal,cache:'no-store'
   });
  }finally{clearTimeout(timer);}
  if(!response.ok){
   let detail='';
   try{detail=(await response.json()).error||'';}catch{}
   throw Error(response.status===404||response.status===405?'PCローカルサーバーで起動してください（bash start-linux.sh）':detail||'MP4変換サーバー HTTP '+response.status);
  }
  const converted=await response.blob();
  const checked=await codecInfo(converted);
  if(!checked.mp4||!checked.h264||!checked.aac)throw Error('H.264/AACを検証できませんでした');
  mp4File=new File([converted],stamp()+'.mp4',{type:'video/mp4'});
  save(mp4File);
  ui('MP4変換成功。H.264映像＋AAC音声で保存しました。見つからない場合は「MP4を保存」を押してください。');
 }catch(e){
  console.error('[JIJI desktop export]',e);
  if(originalFile){
   try{save(originalFile);}catch(downloadError){console.error('[JIJI backup]',downloadError);}
   ui('MP4変換はできませんでした: '+problem(e)+'。元動画の保存を試みました。ダウンロードにない場合は「元動画を保存」を押してください。');
  }else ui('動画を取り出せませんでした: '+problem(e));
 }finally{
  sourceBlobs.delete(url);
  active=false;
 }
}
HTMLAnchorElement.prototype.click=function(){
 const name=this.download||'';
 if(!approved.has(this)&&this.href.startsWith('blob:')&&/\.(?:mp4|webm)$/i.test(name)){
  void convert(this.href,name);return;
 }
 return originalClick.call(this);
};
document.addEventListener('click',event=>{
 const a=event.target?.closest?.('a[download]');
 if(!a||approved.has(a))return;
 if(a.href.startsWith('blob:')&&/\.(?:mp4|webm)$/i.test(a.download||'')){
  event.preventDefault();event.stopImmediatePropagation();
  void convert(a.href,a.download);
 }
},true);
})();