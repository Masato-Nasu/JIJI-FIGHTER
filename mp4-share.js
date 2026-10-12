/* MP4 export bridge for JIJI FIGHTER — converts recorded WebM to H.264/AAC MP4 */
(()=>{
'use strict';
if(window.__jijiMp4Bridge)return;window.__jijiMp4Bridge=true;console.info('JIJI MP4 H264 AAC verified bridge loaded');
// Prefer native H.264/AAC MP4 capture where the browser actually supports it.
// Preserve the constructor API and avoid FFmpeg initialization on those browsers.
const NativeRecorder=window.MediaRecorder;
// A bare MP4 MIME type can still contain Opus audio. X requires AAC.
// Only bypass conversion when both H.264 video and AAC audio are advertised.
const nativeTypes=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"'];
const chosenType=nativeTypes.find(t=>NativeRecorder?.isTypeSupported?.(t));
if(chosenType){
  window.MediaRecorder=new Proxy(NativeRecorder,{
    construct(target,args,newTarget){
      const options={...(args[1]||{}),mimeType:chosenType};
      try{return Reflect.construct(target,[args[0],options],target);}
      catch(e){console.warn('Native MP4 recorder rejected, falling back to original',e);return Reflect.construct(target,args,target);}
    },
    get(target,key){if(key==='isTypeSupported')return target.isTypeSupported.bind(target);return Reflect.get(target,key,target);}
  });
  console.info('JIJI MP4: native recorder available',chosenType);
}
const originalClick=HTMLAnchorElement.prototype.click,createURL=URL.createObjectURL.bind(URL);
let active=false,mp4File=null,dialog=null,ffmpeg=null,sourceURL=null;
function ui(message){if(!dialog){dialog=document.createElement('section');dialog.id='jiji-mp4-share';dialog.style.cssText='position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#090909;color:white;border:1px solid #aaa;padding:12px;min-width:270px;max-width:calc(100vw - 32px);font:13px system-ui;text-align:center';dialog.innerHTML='<p id="jiji-mp4-status"></p><button id="jiji-mp4-close">閉じる</button>';document.body.append(dialog);dialog.querySelector('#jiji-mp4-close').onclick=()=>{dialog.remove();dialog=null;};}dialog.querySelector('#jiji-mp4-status').textContent=message;}
function save(file){const link=document.createElement('a');link.download=file.name;link.href=createURL(file);originalClick.call(link);setTimeout(()=>URL.revokeObjectURL(link.href),60000);}
function problem(e){return e instanceof Error?e.message:(e?.message||e?.type||e?.name||String(e||'不明なエラー'));}
function deadline(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'が'+Math.ceil(ms/1000)+'秒以内に完了しませんでした。通信・ブラウザ制限を確認してください')),ms);})]).finally(()=>clearTimeout(timer));}
async function blobUrl(url,type,label){ui('MP4エンジン: '+label+' を取得中…');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{signal:controller.signal,cache:'force-cache'});if(!response.ok)throw Error(label+' HTTP '+response.status);return createURL(new Blob([await response.arrayBuffer()],{type}));}catch(e){throw Error(label+' の取得に失敗: '+problem(e));}finally{clearTimeout(timer);}}
async function engine(){
 if(ffmpeg)return ffmpeg;
 const root='https://cdn.jsdelivr.net/npm/';
 const lib=await blobUrl(root+'@ffmpeg/ffmpeg@0.12.6/dist/umd/ffmpeg.js','text/javascript','本体');
 ui('MP4エンジン: スクリプトを起動中…');
 await deadline(new Promise((ok,bad)=>{const tag=document.createElement('script');tag.src=lib;tag.onload=ok;tag.onerror=()=>bad(Error('FFmpeg本体スクリプトが実行できません'));document.head.append(tag);}),15000,'スクリプト起動');
 const worker=await blobUrl(root+'@ffmpeg/ffmpeg@0.12.6/dist/umd/814.ffmpeg.js','text/javascript','Worker');
 const core=root+'@ffmpeg/core@0.12.6/dist/umd/';
 const coreURL=await blobUrl(core+'ffmpeg-core.js','text/javascript','コア');
 const wasmURL=await blobUrl(core+'ffmpeg-core.wasm','application/wasm','WASM');
 if(!window.FFmpegWASM?.FFmpeg)throw Error('FFmpegクラスが見つかりません');
 const f=new window.FFmpegWASM.FFmpeg();
 f.on('log',({message})=>console.debug('[MP4]',message));
 ui('MP4エンジン: Worker・WASMを初期化中…');
 await deadline(f.load({classWorkerURL:worker,coreURL,wasmURL}),30000,'Worker・WASM初期化');
 ffmpeg=f;return f;
}

async function codecInfo(blob){
 // A .mp4 suffix and MediaRecorder.isTypeSupported do not guarantee AAC.
 // Inspect the actual ISO BMFF sample-entry tags before accepting a native file.
 const first=new Uint8Array(await blob.slice(0,Math.min(blob.size,4*1024*1024)).arrayBuffer());
 const mp4=first.length>=8&&String.fromCharCode(...first.subarray(4,8))==='ftyp';
 if(!mp4)return {mp4:false,h264:false,aac:false,opus:false};
 const decoder=new TextDecoder('latin1');
 let text=decoder.decode(first);
 if(blob.size>first.byteLength){
   text+=decoder.decode(await blob.slice(Math.max(first.byteLength,blob.size-4*1024*1024)).arrayBuffer());
 }
 return {
   mp4:true,
   h264:/(?:avc1|avc3)/.test(text),
   aac:text.includes('mp4a'),
   opus:/(?:Opus|opus)/.test(text)
 };
}
function compatible(x){return x.mp4&&x.h264&&x.aac&&!x.opus;}
function filename(){return 'JIJI-FIGHTER-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4';}
async function convert(url,downloadName){
 if(active)return;
 active=true;sourceURL=url;
 try{
   ui('保存動画の映像・音声コーデックを確認しています…');
   const response=await fetch(url);
   if(!response.ok)throw Error('録画データ HTTP '+response.status);
   const source=await response.blob();
   if(source.size<1024)throw Error('録画データが空か不完全です');
   const inputCodec=await codecInfo(source);
   console.info('[JIJI MP4] captured track signatures',inputCodec,'blob type',source.type);
   if(compatible(inputCodec)){
     mp4File=new File([source],filename(),{type:'video/mp4'});
     ui('H.264映像＋AAC音声を確認。MP4を保存します。');
     save(mp4File);
     return;
   }

   // Even if the browser gave an MP4 container, it may contain Opus audio.
   // Never pass that through to X/phone galleries as a supposedly compatible MP4.
   const ff=await engine();
   const input=inputCodec.mp4?'input.mp4':'input.webm';
   const bytes=new Uint8Array(await source.arrayBuffer());
   await deadline(ff.writeFile(input,bytes),20000,'録画読み込み');
   ui('互換形式 H.264映像＋AAC音声へ変換しています…');
   const args=['-y','-i',input,'-map','0:v:0','-map','0:a:0',
     '-c:v',inputCodec.h264?'copy':'libx264'];
   if(!inputCodec.h264)args.push('-preset','ultrafast','-pix_fmt','yuv420p');
   args.push('-c:a','aac','-b:a','128k','-ar','44100','-movflags','+faststart','output.mp4');
   const code=await deadline(ff.exec(args),180000,'H.264/AAC変換');
   if(code!==0)throw Error('変換エンジン終了コード '+code+'。動画・音声が正常に記録されたか確認してください');
   const result=await ff.readFile('output.mp4');
   if(result.byteLength<1024)throw Error('変換後の動画が空です');
   const converted=new Blob([result],{type:'video/mp4'});
   const outputCodec=await codecInfo(converted);
   console.info('[JIJI MP4] encoded track signatures',outputCodec);
   if(!compatible(outputCodec))throw Error('変換後もH.264/AAC音声を確認できなかったため、互換性のないMP4は保存しません');
   mp4File=new File([converted],filename(),{type:'video/mp4'});
   ui('H.264/AACの確認完了。MP4を保存します。');
   save(mp4File);
   await ff.deleteFile(input).catch(()=>{});
   await ff.deleteFile('output.mp4').catch(()=>{});
 }catch(e){
   console.error('JIJI compatible MP4 export failed',e);
   ui('MP4変換できませんでした: '+problem(e)+'。互換性のない動画をMP4として保存することはしません。');
   if(dialog&&!dialog.querySelector('#jiji-original-backup')){
     const button=document.createElement('button');
     button.id='jiji-original-backup';
     button.textContent='元の録画を保存（投稿互換性は保証されません）';
     button.onclick=()=>{
       const link=document.createElement('a');
       link.download=(downloadName||'JIJI-FIGHTER-original.webm');
       link.href=sourceURL;originalClick.call(link);
     };
     dialog.append(button);
   }
 }finally{active=false;}
}
HTMLAnchorElement.prototype.click=function(){
 const name=this.download||'';
 // Intercept BOTH mp4 and webm. Native mp4 can contain unsupported Opus audio.
 if(this.href.startsWith('blob:')&&/\.(?:webm|mp4)$/i.test(name)){
   void convert(this.href,name);
   return;
 }
 return originalClick.call(this);
};
})();
