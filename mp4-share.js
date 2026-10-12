/* MP4 export bridge for JIJI FIGHTER — converts recorded WebM to H.264/AAC MP4 */
(()=>{
'use strict';
if(window.__jijiMp4Bridge)return;window.__jijiMp4Bridge=true;console.info('JIJI MP4 bridge fix-2 loaded');
// Prefer native H.264/AAC MP4 capture where the browser actually supports it.
// Preserve the constructor API and avoid FFmpeg initialization on those browsers.
const NativeRecorder=window.MediaRecorder;
const nativeTypes=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1.42E01E"','video/mp4'];
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
function ui(message){if(!dialog){dialog=document.createElement('section');dialog.id='jiji-mp4-share';dialog.style.cssText='position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#090909;color:white;border:1px solid #aaa;padding:12px;min-width:270px;max-width:calc(100vw - 32px);font:13px system-ui;text-align:center';dialog.innerHTML='<p id="jiji-mp4-status"></p><button id="jiji-mp4-download" disabled>MP4保存</button> <button id="jiji-mp4-close">閉じる</button>';document.body.append(dialog);dialog.querySelector('#jiji-mp4-download').onclick=()=>mp4File&&save(mp4File);dialog.querySelector('#jiji-mp4-close').onclick=()=>{dialog.remove();dialog=null;};}dialog.querySelector('#jiji-mp4-status').textContent=message;}
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
async function convert(url){if(active)return;active=true;sourceURL=url;try{ui('録画をMP4に変換しています…');const source=await(await fetch(url)).blob();if(!source.size)throw Error('録画データが空です');const head=new Uint8Array(await source.slice(0,16).arrayBuffer());const mp4Signature=head.length>=8&&String.fromCharCode(...head.slice(4,8))==='ftyp';if(mp4Signature){mp4File=new File([source],'JIJI-FIGHTER-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4',{type:'video/mp4'});ui('ネイティブMP4録画完了。');dialog.querySelector('#jiji-mp4-download').disabled=false;save(mp4File);return;}const f=await engine();await deadline(f.writeFile('input.webm',new Uint8Array(await source.arrayBuffer())),20000,'録画読み込み');ui('H.264映像＋AAC音声に変換中…');const exit=await deadline(f.exec(['-y','-i','input.webm','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','output.mp4']),120000,'MP4変換');if(exit!==0)throw Error('エンコード失敗 '+exit);const data=await f.readFile('output.mp4');if(data.length<1024)throw Error('MP4データが空です');mp4File=new File([data],'JIJI-FIGHTER-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4',{type:'video/mp4'});ui('MP4変換完了。');dialog.querySelector('#jiji-mp4-download').disabled=false;save(mp4File);await f.deleteFile('input.webm').catch(()=>{});await f.deleteFile('output.mp4').catch(()=>{});}catch(e){console.error('MP4 export error',e);const details=problem(e);ui('MP4修正版 2: 変換失敗 '+details+' — 元録画は保持しています');if(dialog&&!dialog.querySelector('#jiji-webm-backup')){const b=document.createElement('button');b.id='jiji-webm-backup';b.textContent='元動画を保存';b.onclick=()=>{const a=document.createElement('a');a.download='JIJI-FIGHTER-original.webm';a.href=sourceURL;originalClick.call(a)};dialog.append(b);}}finally{active=false;}}
HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:')&&/\.webm$/i.test(this.download||'')){void convert(this.href);return;}return originalClick.call(this);};
})();