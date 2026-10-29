import type {FastifyInstance,FastifyRequest} from 'fastify';
import {readdir,statfs,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {pool} from './db.js';
import {uploadRequests} from './limits.js';
export async function directoryBytes(path:string):Promise<number>{let total=0;for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())total+=await directoryBytes(file);else if(entry.isFile())total+=await lstat(file).then(s=>s.size).catch(e=>{if(e.code==='ENOENT')return 0;throw e});}return total;}
export function registerUploadGuard(api:FastifyInstance,directory:string,authorize:(req:FastifyRequest)=>string){
 const active=new Set<string>();let checking=Promise.resolve();
 const maxBytes=Number(process.env.MEDIA_QUOTA_MB||10240)*1024*1024;
 const reservation=1536*1024*1024; // source, worker copy and capped output
 api.addHook('preHandler',async req=>{
  if(req.method!=='POST'||!/^\/api\/v1\/(media|imports\/(pdf|video))$/.test(req.routeOptions.url || ''))return;
  const id=authorize(req);uploadRequests.take(id);
  const previous=checking;let release!:()=>void;checking=new Promise<void>(r=>release=r);await previous;
  try{
   const pending=Number((await pool.query("SELECT (SELECT count(*) FROM pdf_imports WHERE status='pending')+(SELECT count(*) FROM video_imports WHERE status='pending') AS count")).rows[0].count);
   if(active.size>=2||pending>=10)throw Object.assign(new Error('File d’import pleine. Réessayez plus tard.'),{statusCode:429});
   const reserved=(active.size+pending+1)*reservation,usage=await directoryBytes(directory),disk=await statfs(directory);
   if(usage+reserved>maxBytes||disk.bavail*disk.bsize<reserved+1024*1024*1024)throw Object.assign(new Error('Quota de stockage ou espace libre insuffisant.'),{statusCode:507});
   active.add(req.id);
  }finally{release()}
 });
 api.addHook('onResponse',async req=>{active.delete(req.id)});
 api.addHook('onRequestAbort',async req=>{active.delete(req.id)});
 api.addHook('onError',async req=>{active.delete(req.id)});
}
