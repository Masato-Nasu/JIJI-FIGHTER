// Local-only H.264/AAC conversion for Linux Mint / desktop Chrome.
// No remote upload: the server listens exclusively on 127.0.0.1.
import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const MAX_BYTES=512*1024*1024;
function error(res,status,message){
  if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});}
  if(!res.writableEnded)res.end(JSON.stringify({error:message}));
}
function run(program,args,signal){
  return new Promise((resolve,reject)=>{
    let output='',details='',settled=false;
    const proc=spawn(program,args,{stdio:['ignore','pipe','pipe'],signal,timeout:330000,killSignal:'SIGKILL'});
    proc.stdout.on('data',chunk=>{if(output.length<64000)output+=chunk.toString()});
    proc.stderr.on('data',chunk=>{if(details.length<64000)details+=chunk.toString()});
    proc.on('error',err=>{settled=true;reject(err)});
    proc.on('close',code=>{if(settled)return;code===0?resolve(output):reject(Error(program+' returned '+code+': '+details.slice(-1400)))});
  });
}
export async function handleRecordingExport(req,res,origin){
  if(req.method!=='POST'){res.setHeader('Allow','POST');error(res,405,'POST only');return;}
  if(req.headers.origin&&req.headers.origin!==origin){error(res,403,'Invalid origin');return;}
  const type=String(req.headers['content-type']||'').toLowerCase();
  if(!/^(video\/webm|video\/mp4|application\/octet-stream)(?:;|$)/.test(type)){
    error(res,415,'Expected video recording');return;
  }
  const controller=new AbortController();
  const disconnected=()=>{if(!res.writableFinished)controller.abort();};
  res.on('close',disconnected);
  const dir=await mkdtemp(join(tmpdir(),'jiji-fighter-video-'));
  const input=join(dir,type.startsWith('video/mp4')?'input.mp4':'input.webm');
  const output=join(dir,'recording.mp4');
  try{
    let size=0;
    await pipeline(req,async function* (chunks){
      for await(const chunk of chunks){
        size+=chunk.length;
        if(size>MAX_BYTES)throw Error('Recording exceeds 512 MB');
        yield chunk;
      }
    },createWriteStream(input));
    if(size<1024)throw Error('Recording is empty');
    await run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y',
      '-i',input,'-map','0:v:0','-map','0:a:0',
      '-c:v','libx264','-preset','ultrafast','-crf','24',
      '-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-pix_fmt','yuv420p','-r','30',
      '-c:a','aac','-profile:a','aac_low','-b:a','128k','-ar','44100','-ac','2',
      '-movflags','+faststart',output],controller.signal);
    const probe=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-of','json',output],controller.signal));
    const hasVideo=probe.streams?.some(s=>s.codec_type==='video'&&s.codec_name==='h264');
    const hasAudio=probe.streams?.some(s=>s.codec_type==='audio'&&s.codec_name==='aac');
    if(!hasVideo||!hasAudio)throw Error('Converted MP4 is missing H.264 video or AAC audio');
    const file=await stat(output);
    if(file.size<1024)throw Error('MP4 output is empty');
    res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':file.size,
      'Content-Disposition':'attachment; filename="JIJI-FIGHTER.mp4"',
      'Cache-Control':'no-store','X-JIJI-Video-Codecs':'h264,aac'});
    await pipeline(createReadStream(output),res);
  }catch(e){
    console.error('MP4 conversion error',e);
    error(res,/exceeds 512 MB/.test(String(e))?413:503,
      e.code==='ENOENT'?'FFmpeg is not installed. Run: sudo apt install ffmpeg':String(e.message||e).slice(0,900));
  }finally{
    res.off('close',disconnected);
    await rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
