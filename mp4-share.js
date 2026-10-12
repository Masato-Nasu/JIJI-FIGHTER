/* Explicit desktop export API: one completed recording, one queued export.
 * Mobile keeps its existing recorder/download path. No global API interception. */
(()=>{
'use strict';
if(window.JIJI_EXPORT)return;
const desktop=!(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
if(!desktop)return;
const scriptURL=new URL(document.currentScript.src);
const base=new URL('./',scriptURL);
const workerURL=new URL('./encoder/worker.js?v='+encodeURIComponent(scriptURL.pathname.split('/').pop()),base);
const state={build:scriptURL.pathname.split('/').pop(),backend:'',pending:0,completed:0,failed:0,lastCodecs:null};
console.info('[JIJI export]',state.build,location.href);
let queue=Promise.resolve(),serial=0,dialog;
const jobs=[];
function save(file){
 const a=document.createElement('a');a.download=file.name;a.href=URL.createObjectURL(file);
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
function ui(job,text){
 job.message=text;
 if(!dialog||!dialog.isConnected){
  dialog=document.createElement('section');dialog.id='jiji-mp4-share';
  dialog.style.cssText='position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#090909;color:white;border:1px solid #aaa;padding:12px;min-width:280px;max-width:calc(100vw - 32px);max-height:40vh;overflow:auto;font:13px/1.6 system-ui;text-align:center';
  document.body.appendChild(dialog);
 }
 dialog.replaceChildren();
 for(const item of jobs){
  const row=document.createElement('div');
  const status=document.createElement('p');status.textContent='#'+item.id+' '+item.message;
  if(item===job)status.id='jiji-mp4-status';status.setAttribute('role','status');row.append(status);
  for(const [label,file] of [['元動画を保存',item.original],['MP4を保存',item.mp4]]){
   if(!file)continue;
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.style.cssText='margin:4px;padding:8px';b.onclick=()=>save(file);row.append(b);
  }
  dialog.append(row);
 }
 const close=document.createElement('button');close.textContent='閉じる';
 close.onclick=()=>{dialog.remove();dialog=null;};dialog.append(close);
}
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

async function localAvailable(){
 if(!['127.0.0.1','localhost'].includes(location.hostname))return false;
 try{
  const r=await fetch(new URL('api/recording-capabilities',base),{cache:'no-store',signal:AbortSignal.timeout(3000)});
  return r.ok&&(await r.json()).backend==='local-ffmpeg';
 }catch{return false;}
}
async function browserConvert(source,job){
 return new Promise(async(resolve,reject)=>{
  let worker,timer;
  const finish=(error,bytes)=>{
   clearTimeout(timer);worker?.terminate();
   error?reject(error):resolve(new Blob([bytes],{type:'video/mp4'}));
  };
  try{
   worker=new Worker(workerURL); // classic same-origin, directly loads core
   timer=setTimeout(()=>finish(Error('ブラウザ変換が時間制限に達しました。元動画は保持しています。')),360000);
   worker.onerror=e=>finish(Error('変換Worker: '+e.message));
   worker.onmessageerror=()=>finish(Error('変換Workerの受信に失敗'));
   worker.onmessage=({data})=>{
    if(data.error)finish(Error(data.error));
    else if(data.bytes)finish(null,data.bytes);
    else if(data.phase)ui(job,data.phase+'（ブラウザ内処理）');
   };
   const bytes=await source.arrayBuffer();worker.postMessage({bytes},[bytes]);
  }catch(e){finish(e);}
 });
}
async function convert(job){
 try{
  ui(job,'MP4の映像・音声を確認中');
  let converted=job.original;
  let info=await codecInfo(converted);
  if(!(info.mp4&&info.h264&&info.aac)){
   if(await localAvailable()){
    state.backend='local-ffmpeg';ui(job,'Linux FFmpegでH.264/AACへ変換中');
    const r=await fetch(new URL('api/export-mp4',base),{method:'POST',
     headers:{'Content-Type':job.original.type},body:job.original,cache:'no-store',signal:AbortSignal.timeout(360000)});
    if(!r.ok){let detail='';try{detail=(await r.json()).error;}catch{}throw Error(detail||'MP4変換 HTTP '+r.status);}
    converted=await r.blob();
   }else{
    state.backend='browser-ffmpeg';converted=await browserConvert(job.original,job);
   }
   info=await codecInfo(converted);
  }else state.backend='native';
  state.lastCodecs=info;
  if(!info.mp4||!info.h264||!info.aac)throw Error('H.264/AACを確認できませんでした');
  job.mp4=new File([converted],job.name+'.mp4',{type:'video/mp4'});
  save(job.mp4);state.completed++;
  ui(job,'H.264＋AACのMP4をダウンロードしました。保存先にない場合は「MP4を保存」を押してください。');
 }catch(e){
  state.failed++;console.error('[JIJI export]',e);
  try{save(job.original);}catch(downloadError){console.error(downloadError);}
  ui(job,'MP4変換失敗: '+String(e?.message||e)+'。元動画は保持しています。');
 }finally{state.pending--;}
}
window.JIJI_EXPORT={state,saveRecording(blob){
 const id=++serial,name='JIJI-FIGHTER-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+id;
 const original=new File([blob],name+'-ORIGINAL.'+(blob.type.includes('mp4')?'mp4':'webm'),{type:blob.type});
 const job={id,name,original,mp4:null,message:'変換待ち'};
 jobs.push(job);state.pending++;ui(job,job.message);
 queue=queue.then(()=>convert(job));return queue;
}};
})();
