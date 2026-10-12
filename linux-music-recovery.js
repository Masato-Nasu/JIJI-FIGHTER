/* Linux Chrome BGM recovery. Desktop-only and local-server-only.
 * If native HTTP streaming errors, retry the same original MP3 through a
 * fully loaded Blob URL. This bypasses Range/seek/network quirks without
 * modifying the game's audio element or WebAudio recording graph. */
(()=>{
'use strict';
if(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))return;
if(location.hostname!=='127.0.0.1'&&location.hostname!=='localhost')return;
let attempted=false,blobURL=null;
const state={attempted:false,code:0,message:'',downloadStatus:null,bytes:0,recovered:false,recoveryError:''};
window.JIJI_MUSIC_DIAGNOSTIC=state;
function init(){
 const audio=document.querySelector('#bgm');
 const button=document.querySelector('#musicToggle');
 if(!audio||!button)return;
 audio.addEventListener('error',async()=>{
  const err=audio.error;
  state.code=err?.code||0;
  state.message=err?.message||'no detail';
  console.warn('[JIJI MUSIC DIAG] Playback failed',JSON.stringify({
   code:state.code,message:state.message,source:audio.currentSrc,
   networkState:audio.networkState,readyState:audio.readyState
  }));
  if(attempted)return;
  attempted=true;state.attempted=true;
  const source=new URL('./music/mazz-db-2017.mp3',location.href);
  let abort=null;
  try{
   abort=new AbortController();
   const timeout=setTimeout(()=>abort.abort(),25000);
   let data;
   try{
    const response=await fetch(source.href,{cache:'no-store',signal:abort.signal});
    state.downloadStatus=response.status;
    if(!response.ok)throw Error('MP3 HTTP '+response.status);
    data=await response.arrayBuffer();
   }finally{clearTimeout(timeout);}
   state.bytes=data.byteLength;
   if(data.byteLength<100000)throw Error('BGM MP3 is too small ('+data.byteLength+' bytes)');
   blobURL=URL.createObjectURL(new Blob([data],{type:'audio/mpeg'}));
   audio.src=blobURL;
   audio.load();
   // Do not replace the <audio> element: the game already uses it to
   // mix music into recorded videos. The source alone is replaced.
   try{await audio.play();state.recovered=true;console.info('[JIJI MUSIC DIAG] BGM resumed from local MP3 Blob');}
   catch(e){
    state.recoveryError='再生操作待ち: '+String(e?.message||e);
    console.warn('[JIJI MUSIC DIAG] Press MUSIC ON to resume BGM',state.recoveryError);
    button.title='MP3取得済み。MUSICを押すと再生を再試行できます。';
   }
  }catch(e){
   state.recoveryError=String(e?.message||e);
   console.error('[JIJI MUSIC DIAG] BGM MP3 fallback failed:',state.recoveryError);
   button.title='BGMエラー code='+state.code+' HTTP='+state.downloadStatus+' '+state.recoveryError;
  }
 },false);
 audio.addEventListener('playing',()=>{state.recovered=true;state.recoveryError='';},false);
 window.addEventListener('pagehide',()=>{if(blobURL)URL.revokeObjectURL(blobURL);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();