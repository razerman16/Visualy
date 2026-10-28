import {convertRemote} from './conversion-client.js';
import {mkdir,rename} from 'node:fs/promises';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {pool} from './db.js';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {open,rm,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const processOptions={timeout:900000,maxBuffer:1024*1024};
export function isVideoContainer(bytes:Buffer){return bytes.toString('ascii',4,8)==='ftyp'||bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]))||(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='AVI ');}
export async function transcodeVideo(source:string,output:string,signal?:AbortSignal){
 const probe=await exec('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',source],{timeout:30000,maxBuffer:1024*1024,signal,env:{PATH:process.env.PATH}});
 const info=JSON.parse(probe.stdout),video=info.streams?.find((s:any)=>s.codec_type==='video'&&!s.disposition?.attached_pic);
 const duration=Number(info.format?.duration);
 if(!video||!Number.isFinite(duration)||duration<=0||duration>3600||video.width>8192||video.height>8192)throw new Error('Vidéo invalide : durée maximale 1 heure, dimensions maximales 8192 pixels.');
 await exec('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',source,'-map',`0:${video.index}`,'-map','0:a:0?','-sn','-dn','-map_metadata','-1','-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",'-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ac','2','-movflags','+faststart','-fs','268435456','-f','mp4','-n',output],{...processOptions,signal,env:{PATH:process.env.PATH}});
 const size=(await stat(output)).size;if(size>=268435456)throw new Error('Output limit exceeded');if(!size)throw new Error('Aucune vidéo produite.');
 return {duration,size};
}
export async function registerVideoImports(api:FastifyInstance,directory:string,authorize:(r:FastifyRequest,write:boolean)=>void){
 const route='/api/v1/imports/video';
 api.get(route,async req=>{authorize(req,false);return (await pool.query('SELECT id,name,status,error,media_id AS "mediaId",duration,created_at AS "createdAt" FROM video_imports ORDER BY created_at DESC LIMIT 100')).rows;});
 api.post(route,async(req,reply)=>{
  authorize(req,true);const part=await req.file({limits:{fileSize:500*1024*1024}});if(!part)return reply.code(400).send({error:'Choisissez une vidéo.'});
  const id=randomUUID(),path=join(directory,`video-${id}`);let saved=false;
  try{
   await pipeline(part.file,createWriteStream(path,{flags:'wx',mode:0o600}));if(part.file.truncated)return reply.code(413).send({error:'Limite de 500 Mo dépassée.'});
   const handle=await open(path,'r');const header=Buffer.alloc(16);try{await handle.read(header,0,16,0);}finally{await handle.close();}
   if(!isVideoContainer(header))return reply.code(415).send({error:'Formats acceptés : MP4, MOV, MKV, WebM et AVI.'});
   const name=part.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);
   await pool.query('INSERT INTO video_imports(id,name,path) VALUES($1,$2,$3)',[id,name,path]);saved=true;
   return reply.code(202).send({id,name,status:'pending'});
  }finally{if(!saved)await rm(path,{force:true});}
 });
 let running:Promise<void>|undefined,stopped=false;
 async function work(){
  const client=await pool.connect();let output='',committed=false;
  try{
   await client.query('BEGIN');if(!(await client.query('SELECT pg_try_advisory_xact_lock(7382265) AS locked')).rows[0].locked){await client.query('COMMIT');return;}const job=(await client.query("SELECT * FROM video_imports WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
   if(!job){await client.query('COMMIT');return;}
   // Stable output name permits cleanup of interrupted conversions before retry.
   output=join(directory,`converted-${job.id}`);await rm(output,{force:true});await client.query('SAVEPOINT conversion');
   try{
    const temp=output+'-work';await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});let duration:number|null=null;try{duration=(await convertRemote('video',job.path,temp)).duration;await rename(join(temp,'video.mp4'),output);}finally{await rm(temp,{recursive:true,force:true});}const result={size:(await stat(output)).size,duration},hash=createHash('sha256');
    for await(const chunk of createReadStream(output))hash.update(chunk);
    const id=randomUUID(),name=job.name.replace(/\.[^.]+$/,'')+'.mp4';
    await client.query('INSERT INTO media(id,name,mime,size,checksum,path) VALUES($1,$2,$3,$4,$5,$6)',[id,name,'video/mp4',result.size,hash.digest('hex'),output]);
    await client.query("UPDATE video_imports SET status='done',media_id=$2,duration=$3 WHERE id=$1",[job.id,id,result.duration]);
   }catch(error){
    await client.query('ROLLBACK TO SAVEPOINT conversion');await rm(output,{force:true});
    const message=error instanceof Error&&error.message.startsWith('Vidéo invalide')?error.message:'Transcodage impossible : fichier invalide, codec non pris en charge ou délai de 15 minutes dépassé.';
    await client.query("UPDATE video_imports SET status='error',error=$2 WHERE id=$1",[job.id,message]);
   }
   await client.query('COMMIT');committed=true;await rm(job.path,{force:true});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});if(output&&!committed)await rm(output,{force:true});api.log.error({err:error},'Video import failed');}
  finally{client.release();}
 }
 const timer=setInterval(()=>{if(!stopped&&!running)running=work().catch(error=>api.log.error({err:error},'Video queue unavailable')).finally(()=>{running=undefined;});},2000);timer.unref();
 api.addHook('onClose',async()=>{stopped=true;clearInterval(timer);await running;});
}
