// Isolated conversion service: streamed input/output, no shared media or DB access.
import Fastify from 'fastify';
import {mkdtemp,mkdir,readdir,rm,stat} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {Transform,type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import tar from 'tar-stream';
import {convertPdf} from './pdf-imports.js';
import {transcodeVideo} from './video-imports.js';
import {digest} from './security.js';
import {directoryBytes} from './upload-guard.js';
const root=process.env.CONVERSION_DIR||'/data/work';
const app=Fastify({bodyLimit:1024,logger:true});let busy=false;
if(!process.env.CONVERTER_TOKEN||process.env.CONVERTER_TOKEN.length<32)throw new Error('Converter token required');
app.addContentTypeParser('application/octet-stream',(_req,payload,done)=>done(null,payload));
app.get('/health',async()=>({ok:true}));
app.post('/convert',async(req,reply)=>{
 if(digest(req.headers.authorization||'')!==digest(`Bearer ${process.env.CONVERTER_TOKEN}`))return reply.code(401).send();
 const kind=(req.query as any).kind;if(!['pdf','video'].includes(kind))return reply.code(400).send();
 if(busy)return reply.code(429).send();busy=true;
 let dir='',output='';const controller=new AbortController();let scanning=false;
 const timer=setInterval(()=>{if(scanning)return;scanning=true;void directoryBytes(output).then(size=>{if(size>256*1024*1024)controller.abort()}).catch(()=>{}).finally(()=>{scanning=false})},250);
 const timeout=setTimeout(()=>controller.abort(),945000);const abort=()=>controller.abort();req.raw.on('aborted',abort);reply.raw.on('close',abort);
 try{
  dir=await mkdtemp(join(root,'job-'));output=join(dir,'output');const source=join(dir,'source');
  let size=0;
  await pipeline(req.body as Readable,new Transform({transform(chunk,_enc,cb){size+=chunk.length;cb(size>(kind==='pdf'?25:500)*1024*1024?new Error('Input too large'):null,chunk)}}),createWriteStream(source,{flags:'wx',mode:0o600}),{signal:controller.signal});
  await mkdir(output);
  let duration:number|undefined;if(kind==='pdf')await convertPdf(source,output,controller.signal);else duration=(await transcodeVideo(source,join(output,'video.mp4'),controller.signal)).duration;
  if(await directoryBytes(output)>256*1024*1024)throw new Error('Output too large');
  const pack=tar.pack();reply.type('application/x-tar');if(duration)reply.header('X-Video-Duration',duration);
  void (async()=>{try{for(const name of await readdir(output)){const file=join(output,name),info=await stat(file);await pipeline(createReadStream(file),pack.entry({name,size:info.size,type:'file'}),{signal:controller.signal});}pack.finalize();}catch(e){pack.destroy(e as Error)}})();
  await reply.send(pack);
 }catch{if(!reply.sent)reply.code(422).send({error:'Conversion impossible ou limite dépassée.'});}
 finally{clearInterval(timer);clearTimeout(timeout);req.raw.off('aborted',abort);reply.raw.off('close',abort);try{if(dir)await rm(dir,{recursive:true,force:true});}finally{busy=false;}}
});
await mkdir(root,{recursive:true});
await app.listen({host:'0.0.0.0',port:3001});
