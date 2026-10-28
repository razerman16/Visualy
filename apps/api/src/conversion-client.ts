import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import tar from 'tar-stream';
export async function convertRemote(kind:'pdf'|'video',source:string,destination:string):Promise<{files:string[];duration:number|null}>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),960000);
 try{
  const response=await fetch(`${process.env.CONVERTER_URL||'http://converter:3001'}/convert?kind=${kind}`,{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:`Bearer ${process.env.CONVERTER_TOKEN}`},body:Readable.toWeb(createReadStream(source)) as ReadableStream<Uint8Array>,duplex:'half',signal:controller.signal} as RequestInit & {duplex:string});
  if(!response.ok||!response.body)throw new Error('Conversion failed');
  await mkdir(destination,{recursive:true});const extract=tar.extract(),files:string[]=[];let total=0;
  extract.on('entry',(header,stream,next)=>{
   stream.on('error',()=>{}); // rejected entries also emit errors when extraction is destroyed
   const valid=kind==='pdf'?/^page-\d+\.png$/.test(header.name):header.name==='video.mp4';
   total+=header.size||0;
   if(!valid||header.type!=='file'||!Number.isSafeInteger(header.size)||(header.size??0)<=0||total>256*1024*1024||files.length>=50||files.includes(header.name)){extract.destroy(new Error('Invalid converter output'));stream.resume();return;}
   files.push(header.name);
   void pipeline(stream,createWriteStream(join(destination,header.name),{flags:'wx',mode:0o600})).then(()=>next(),e=>extract.destroy(e));
  });
  await pipeline(Readable.fromWeb(response.body as any),extract,{signal:controller.signal});
  if(!files.length)throw new Error('Empty converter output');
  const duration=Number(response.headers.get('x-video-duration'));
  return {files:files.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),duration:duration>0&&duration<=3600?duration:null};
 }finally{clearTimeout(timer);controller.abort()}
}
