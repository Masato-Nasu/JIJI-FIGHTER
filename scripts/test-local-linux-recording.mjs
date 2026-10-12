import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const temp=await mkdtemp(join(tmpdir(),'jiji-linux-smoke-'));
const recording=join(temp,'input.webm'),output=join(temp,'output.mp4');
const proc=spawn(process.execPath,['linux-server.mjs'],{
 env:{...process.env,JIJI_NO_OPEN:'1'},stdio:['ignore','pipe','pipe']
});
let address='',log='';
let readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
const onText=bytes=>{
 log+=String(bytes);
 if(!address){
  const match=log.match(/http:\/\/127\.0\.0\.1:\d+/);
  if(match){address=match[0];readyResolve()}
 }
};
proc.stdout.on('data',onText);
proc.stderr.on('data',onText);
proc.on('error',readyReject);
proc.on('exit',code=>{if(!address)readyReject(Error('Local server exited: '+code+' '+log.slice(-800)))});
try{
 await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Local server start timed out: '+log)),15000))]);
 const js=await fetch(address+'/mp4-share.js',{cache:'no-store'});
 if(!js.ok)throw Error('Linux recording bridge HTTP '+js.status);
 const body=await js.text();
 if(!body.includes('/api/export-mp4')||!body.includes('元動画を保存')||body.includes('Worker・WASMを初期化中'))
  throw Error('Wrong/old video exporter served by local Linux server');
 const response=await fetch(address+'/api/export-mp4');
 if(response.status!==405)throw Error('Local FFmpeg API GET unexpectedly returned HTTP '+response.status);
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=black:s=322x241:r=20:d=1.4',
  '-f','lavfi','-i','sine=frequency=880:sample_rate=44100:duration=1.4',
  '-c:v','libvpx','-b:v','180k','-c:a','libopus','-shortest',recording]);
 const payload=await readFile(recording);
 const converted=await fetch(address+'/api/export-mp4',{
  method:'POST',headers:{'Content-Type':'video/webm','Origin':address},body:payload
 });
 if(!converted.ok)throw Error('Local FFmpeg conversion returned '+converted.status+' '+await converted.text());
 if(converted.headers.get('X-JIJI-Video-Codecs')!=='h264,aac')throw Error('Missing verified codec header');
 await writeFile(output,Buffer.from(await converted.arrayBuffer()));
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'})).streams;
 if(!streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'))
  throw Error('H264/AAC absent from Linux MP4 '+JSON.stringify(streams.map(s=>[s.codec_type,s.codec_name])));
 console.log('LOCAL LINUX CHROME EXPORT OK:',address,'H264 + AAC',payload.length,'input bytes');
}finally{
 proc.kill('SIGINT');
 await rm(temp,{recursive:true,force:true});
}
