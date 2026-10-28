import {convertRemote} from './conversion-client.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from './db.js';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function convertPdf(source:string, directory:string,signal?:AbortSignal) {
  const info=await exec('pdfinfo',[source],{timeout:15000,maxBuffer:65536,signal,env:{PATH:process.env.PATH}});
  const pages=Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1]);
  if(!pages || pages>50) throw new Error('Le document doit contenir entre 1 et 50 pages.');
  await exec('pdftoppm',['-png','-scale-to','1920','-r','96',source,join(directory,'page')],{timeout:120000,maxBuffer:65536,signal,env:{PATH:process.env.PATH}});
  return (await readdir(directory)).filter(n=>/^page-\d+\.png$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
export async function registerPdfImports(api:FastifyInstance, directory:string, authorize:(r:FastifyRequest,write:boolean)=>void) {
  const route='/api/v1/imports/pdf';
  api.get(route,async req=>{authorize(req,false);return (await pool.query('SELECT id,name,status,error,media_ids AS "mediaIds",created_at AS "createdAt" FROM pdf_imports ORDER BY created_at DESC LIMIT 100')).rows;});
  api.post(route,async(req,reply)=>{
    authorize(req,true);const part=await req.file({limits:{fileSize:25*1024*1024}});
    if(!part)return reply.code(400).send({error:'Choisissez un fichier PDF.'});
    const bytes=await part.toBuffer();if(bytes.subarray(0,5).toString()!=='%PDF-')return reply.code(415).send({error:'Document PDF invalide.'});
    const id=randomUUID(),path=join(directory,`pdf-${id}`),name=part.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);
    await writeFile(path,bytes,{flag:'wx',mode:0o600});
    try{await pool.query('INSERT INTO pdf_imports(id,name,path) VALUES($1,$2,$3)',[id,name,path]);}catch(e){await rm(path,{force:true});throw e;}
    return reply.code(202).send({id,name,status:'pending'});
  });
  let stopped=false,running:Promise<void>|undefined;
  async function work(){
    const client=await pool.connect();let temp='';const outputs:string[]=[];
    try{
      await client.query('BEGIN');
      if(!(await client.query('SELECT pg_try_advisory_xact_lock(7382265) AS locked')).rows[0].locked){await client.query('COMMIT');return;}
      const job=(await client.query("SELECT * FROM pdf_imports WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
      if(!job){await client.query('COMMIT');return;}
      temp=join(directory,`pdf-work-${job.id}`);await rm(temp,{recursive:true,force:true});await mkdir(temp);
      await client.query('SAVEPOINT conversion');
      try{
        const {files:pages}=await convertRemote('pdf',job.path,temp);const ids:string[]=[];
        for(const [index,page] of pages.entries()){
          const bytes=await readFile(join(temp,page)),id=randomUUID(),path=join(directory,id);outputs.push(path);
          await writeFile(path,bytes,{flag:'wx',mode:0o600});
          await client.query('INSERT INTO media(id,name,mime,size,checksum,path) VALUES($1,$2,$3,$4,$5,$6)',[id,`${job.name} — page ${index+1}`,'image/png',bytes.length,createHash('sha256').update(bytes).digest('hex'),path]);ids.push(id);
        }
        await client.query("UPDATE pdf_imports SET status='done',media_ids=$2 WHERE id=$1",[job.id,JSON.stringify(ids)]);
      }catch(error){
        await client.query('ROLLBACK TO SAVEPOINT conversion');
        await client.query("UPDATE pdf_imports SET status='error',error=$2 WHERE id=$1",[job.id,error instanceof Error&&error.message.startsWith('Le document')?error.message:'Conversion impossible : PDF invalide, protégé ou délai dépassé.']);
        for(const path of outputs)await rm(path,{force:true});
      }
      await client.query('COMMIT');await rm(job.path,{force:true});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});for(const path of outputs)await rm(path,{force:true});api.log.error({err:error},'PDF import failed');}
    finally{if(temp)await rm(temp,{recursive:true,force:true});client.release();}
  }
  const timer=setInterval(()=>{if(!stopped&&!running)running=work().catch(error=>api.log.error({err:error},'PDF queue unavailable')).finally(()=>{running=undefined;});},2000);timer.unref();
  api.addHook('onClose',async()=>{stopped=true;clearInterval(timer);await running;});
}
