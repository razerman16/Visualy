import {accountLogins,userRequests,deviceRequests,deviceEvents,deviceEventBytes,identityKey} from './limits.js';
import {registerUploadGuard} from './upload-guard.js';
import { registerVideoImports } from './video-imports.js';
import { registerPdfImports } from './pdf-imports.js';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { randomUUID, randomInt, createHash } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { z } from 'zod';
import { schedulesConflict, getScheduleErrors, type Schedule } from '@scenzly/shared';
import { pool, transaction } from './db.js';
import { digest, secret, hashPassword, verifyPassword, sniffMime, parseRange } from './security.js';
import { credentials, loginSchema, roleSchema, sceneSchema, programSchema, screenSchema, scheduleSchema, groupSchema, pairRequestSchema, pairConfirmSchema, commandSchema, boundedArray } from './validation.js';

type Role = 'superadmin'|'admin'|'editor'|'viewer';
type User = {id:string;email:string;name:string;role:Role};
declare module 'fastify' {interface FastifyRequest {user?:User}}
const READ:Role[]=['superadmin','admin','editor','viewer'];
const EDIT:Role[]=['superadmin','admin','editor'];
const ADMIN:Role[]=['superadmin','admin'];
const mediaDir = process.env.MEDIA_DIR || '/data/media';
const api = Fastify({bodyLimit:2*1024*1024,trustProxy:(_address,hop)=>hop<1,logger:{level:process.env.LOG_LEVEL||'info',serializers:{req(req){return {method:req.method,url:req.url?.split('?')[0],hostname:req.hostname,remoteAddress:req.ip};}},redact:['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]']}});
class HttpError extends Error { constructor(public statusCode:number,message:string){super(message)} }
function fail(status:number,message:string):never {throw new HttpError(status,message)}
function user(req:FastifyRequest,roles:Role[]=READ):User {if(!req.user)fail(401,'Connexion requise'); if(!roles.includes(req.user.role))fail(403,'Droits insuffisants'); return req.user;}
function uid(req:FastifyRequest):string { return z.string().uuid().parse((req.params as any).id); }
const base='/api/v1';
const publicUser=(row:any):User=>({id:row.id,email:row.email,name:row.name,role:row.role});
const mediaView=(row:any)=>({id:row.id,name:row.name,mime:row.mime,size:Number(row.size),url:`${base}/media/${row.id}/file`,checksum:row.checksum,createdAt:row.created_at});
const programView=(row:any)=>({id:row.id,name:row.name,items:row.items,publishedVersion:row.published_version,createdAt:row.created_at});
const screenView=(row:any)=>({id:row.id,name:row.name,groupId:row.group_id,orientation:row.orientation,fallbackProgramId:row.fallback_program_id,lastSeen:row.last_seen,currentProgramId:row.current_program_id,online:row.last_seen ? Date.now()-new Date(row.last_seen).getTime()<90000:false});
async function audit(req:FastifyRequest,type:string,data:object={}) {await pool.query('INSERT INTO security_events(actor_id,type,data) VALUES($1,$2,$3)',[req.user?.id||null,type,JSON.stringify({...data,ip:req.ip})]);}
async function session(reply:FastifyReply,id:string,passwordHash?:string) {const token=secret();await transaction(async c=>{const row=(await c.query("SELECT password,disabled FROM users WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row||row.disabled||passwordHash&&row.password!==passwordHash)fail(401,"Connexion requise");await c.query("INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[digest(token),id]);});reply.setCookie('scenzly_session',token,{path:'/',httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE!=='false',maxAge:604800});}
async function device(req:FastifyRequest,allowQuery=false):Promise<any> {const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];const token=bearer||(allowQuery?(req.query as any).token:undefined);if(typeof token!=='string'||token.length>200)fail(401,'Jeton appareil requis');const {rows}=await pool.query('SELECT * FROM screens WHERE token_hash=$1',[digest(token)]);if(!rows[0])fail(401,'Appareil révoqué ou inconnu');deviceRequests.take(rows[0].id);return rows[0];}
async function manifest(screen:any) {
  const schedules=(await pool.query("SELECT data FROM schedules WHERE data->>'screenId'=$1 OR ($2::text IS NOT NULL AND data->>'groupId'=$2)",[screen.id,screen.group_id])).rows.map(r=>r.data);
  const ids=[...new Set([screen.fallback_program_id,...schedules.map(s=>s.programId)].filter(Boolean))];
  const programs=ids.length?(await pool.query('SELECT v.payload FROM program_versions v JOIN programs p ON p.id=v.program_id AND p.published_version=v.version WHERE p.id=ANY($1::uuid[]) ORDER BY p.id',[ids])).rows.map(r=>r.payload):[];
  const media=[...new Map(programs.flatMap(p=>p.media).map((m:any)=>[m.id,m])).values()];
  const data={screen:{id:screen.id,name:screen.name,orientation:screen.orientation},fallbackProgramId:screen.fallback_program_id,programs,schedules,media};
  return {revision:digest(JSON.stringify(data)),serverTime:new Date().toISOString(),...data};
}
await api.register(cookie);
await api.register(rateLimit,{max:600,timeWindow:'1 minute'});
await api.register(multipart,{limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||500)*1024*1024,files:1,fields:10}});
api.addHook('onRequest',async(req,reply)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');});
api.addHook('preHandler',async(req)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin){
    const host=req.headers['x-forwarded-host']||req.headers.host;
    let originHost='';try{originHost=new URL(req.headers.origin).host}catch{}
    if(originHost!==host)fail(403,'Origine de la requête interdite');
  }
  const token=req.cookies.scenzly_session;
  if(token){const {rows}=await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now() AND NOT u.disabled',[digest(token)]);if(rows[0]){req.user=publicUser(rows[0]);userRequests.take(req.user.id);}}
});
registerUploadGuard(api,mediaDir,req=>user(req,EDIT).id);
api.setErrorHandler((error,req,reply)=>{
  if(error instanceof z.ZodError)return reply.code(400).send({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});
  const err=error as any;
  if(err.code==='23505')return reply.code(409).send({error:'Cette entrée existe déjà'});
  if(err.code==='23503')return reply.code(409).send({error:'Élément inexistant ou encore utilisé'});
  if(err.code==='22P02')return reply.code(400).send({error:'Identifiant invalide'});
  if(err.code==='FST_REQ_FILE_TOO_LARGE')return reply.code(413).send({error:'Fichier trop volumineux'});
  if(err.statusCode>=400&&err.statusCode<500||err.statusCode===507)return reply.code(err.statusCode).send({error:err.message});
  req.log.error({err:error},'Erreur serveur');reply.code(500).send({error:'Erreur interne du serveur'});
});
api.get(`${base}/health`,async()=>{await pool.query('SELECT 1');return {status:'ok'};});
api.get(`${base}/auth/setup`,async()=>({required:!(await pool.query('SELECT 1 FROM users LIMIT 1')).rowCount}));
api.post(`${base}/auth/setup`,{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
  if(!process.env.SETUP_TOKEN||typeof (req.body as any)?.setupToken!=='string'||digest((req.body as any).setupToken)!==digest(process.env.SETUP_TOKEN)){await audit(req,'auth.setup_denied');fail(403,'Clé d’installation invalide');}
  const body=credentials.parse(req.body);
  const record=await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(7382262)');if((await c.query('SELECT 1 FROM users LIMIT 1')).rowCount)fail(409,'Le compte initial existe déjà');const record={id:randomUUID(),...body,role:'superadmin' as Role};await c.query('INSERT INTO users(id,email,name,role,password) VALUES($1,$2,$3,$4,$5)',[record.id,body.email,body.name,record.role,await hashPassword(body.password)]);return record;});
  await audit(req,'auth.setup',{id:record.id});await session(reply,record.id);reply.code(201);return publicUser(record);
});
api.post(`${base}/auth/login`,{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{const body=loginSchema.parse(req.body);accountLogins.take(identityKey(body.email));const row=(await pool.query('SELECT * FROM users WHERE email=$1',[body.email])).rows[0];if(!row||row.disabled||!await verifyPassword(body.password,row.password)){await audit(req,'auth.login_failed',{account:identityKey(body.email)});fail(401,'Adresse ou mot de passe incorrect');}await audit(req,'auth.login',{id:row.id});await session(reply,row.id,row.password);return publicUser(row);});
api.get(`${base}/auth/me`,async(req)=>user(req));
api.post(`${base}/auth/logout`,async(req,reply)=>{if(req.cookies.scenzly_session)await pool.query('DELETE FROM sessions WHERE hash=$1',[digest(req.cookies.scenzly_session)]);await audit(req,'auth.logout');reply.clearCookie('scenzly_session',{path:'/'});return {ok:true};});
api.get(`${base}/users`,async(req)=>{user(req,['superadmin']);return (await pool.query('SELECT id,email,name,role,disabled FROM users ORDER BY name')).rows;});
api.post(`${base}/users`,async(req,reply)=>{user(req,['superadmin']);const b=credentials.extend({role:roleSchema}).parse(req.body);const id=randomUUID();await pool.query('INSERT INTO users(id,email,name,role,password) VALUES($1,$2,$3,$4,$5)',[id,b.email,b.name,b.role,await hashPassword(b.password)]);await audit(req,'user.created',{id});reply.code(201);return {id,email:b.email,name:b.name,role:b.role};});
api.patch(`${base}/users/:id`,async(req)=>{
 user(req,['superadmin']);const id=uid(req);const b=z.object({role:roleSchema.optional(),disabled:z.boolean().optional()}).parse(req.body);
 return transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(7382262)');const row=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)fail(404,'Utilisateur introuvable');
 const role=b.role??row.role,disabled=b.disabled??row.disabled;
 if(row.role==='superadmin'&&!row.disabled&&(role!=='superadmin'||disabled)&&Number((await c.query("SELECT count(*) FROM users WHERE role='superadmin' AND NOT disabled")).rows[0].count)<=1)fail(409,'Conservez au moins un superadministrateur');
 await c.query('UPDATE users SET role=$2,disabled=$3 WHERE id=$1',[id,role,disabled]);
 await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
 await c.query('INSERT INTO security_events(actor_id,type,data) VALUES($1,$2,$3)',[req.user!.id,'user.updated',JSON.stringify({id,role,disabled,ip:req.ip})]);return {...publicUser(row),role,disabled};});
});
api.post(`${base}/users/:id/revoke-sessions`,async req=>{user(req,['superadmin']);const id=uid(req);await pool.query('DELETE FROM sessions WHERE user_id=$1',[id]);await audit(req,'user.sessions_revoked',{id});return {ok:true};});
api.post(`${base}/auth/password`,{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
 const actor=user(req);const b=z.object({currentPassword:z.string().max(128),password:credentials.shape.password}).parse(req.body);
 await transaction(async c=>{const row=(await c.query('SELECT password FROM users WHERE id=$1 FOR UPDATE',[actor.id])).rows[0];if(!await verifyPassword(b.currentPassword,row.password))fail(403,'Mot de passe actuel incorrect');
 await c.query('UPDATE users SET password=$2 WHERE id=$1',[actor.id,await hashPassword(b.password)]);await c.query('DELETE FROM sessions WHERE user_id=$1',[actor.id]);await c.query('INSERT INTO security_events(actor_id,type) VALUES($1,$2)',[actor.id,'user.password_changed']);});
 reply.clearCookie('scenzly_session',{path:'/'});return {ok:true};
});
api.post(`${base}/users/:id/password`,{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async req=>{
 const actor=user(req,['superadmin']),id=uid(req),b=z.object({currentPassword:z.string().max(128),password:credentials.shape.password}).parse(req.body);
 const own=(await pool.query('SELECT password FROM users WHERE id=$1',[actor.id])).rows[0];if(!await verifyPassword(b.currentPassword,own.password))fail(403,'Mot de passe actuel incorrect');
 await transaction(async c=>{if(!(await c.query('UPDATE users SET password=$2 WHERE id=$1',[id,await hashPassword(b.password)])).rowCount)fail(404,'Utilisateur introuvable');await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);await c.query('INSERT INTO security_events(actor_id,type,data) VALUES($1,$2,$3)',[actor.id,'user.password_reset',JSON.stringify({id})]);});return {ok:true};
});
api.get(`${base}/dashboard`,async(req)=>{user(req);const {rows}=await pool.query("SELECT (SELECT count(*)::int FROM screens) screens,(SELECT count(*)::int FROM screens WHERE last_seen>now()-interval '90 seconds') online,(SELECT count(*)::int FROM media) media,(SELECT count(*)::int FROM programs) programs");return rows[0];});
api.get(`${base}/media`,async(req)=>{user(req);return (await pool.query('SELECT * FROM media ORDER BY created_at DESC')).rows.map(mediaView);});
api.post(`${base}/media`,async(req,reply)=>{
  user(req,EDIT);const file=await req.file();if(!file)fail(400,'Choisissez un fichier');
  const id=randomUUID(),path=join(mediaDir,id);const hash=createHash('sha256');let size=0,stored=false;
  try{
    await pipeline(file.file,new Transform({transform(chunk,_encoding,callback){size+=chunk.length;hash.update(chunk);callback(null,chunk);}}),createWriteStream(path,{flags:'wx',mode:0o600}));
    if(file.file.truncated)fail(413,'Fichier trop volumineux');
    const handle=await open(path,'r');let bytes:Buffer;try{const buffer=Buffer.alloc(16);const read=await handle.read(buffer,0,16,0);bytes=buffer.subarray(0,read.bytesRead);}finally{await handle.close();}
    const mime=sniffMime(bytes);if(!mime)fail(415,'Format non pris en charge. Importez JPEG, PNG, WebP, MP4 ou WebM. Convertissez les PDF en images au préalable.');
    const name=file.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,200)||'Média';
    const row=(await pool.query('INSERT INTO media(id,name,mime,size,checksum,path) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id,name,mime,size,hash.digest('hex'),path])).rows[0];stored=true;await audit(req,'media.created',{id,name});reply.code(201);return mediaView(row);
  }finally{if(!stored)await unlink(path).catch(()=>{});}
});
api.get(`${base}/media/:id/file`,async(req,reply)=>{
  const id=uid(req);if(!req.user){const screen=await device(req,true);const allowed=(await manifest(screen)).media.some((m:any)=>m.id===id);if(!allowed)fail(403,'Média non affecté à cet appareil');}
  const row=(await pool.query('SELECT * FROM media WHERE id=$1',[id])).rows[0];if(!row)fail(404,'Média introuvable');
  const size=Number(row.size);reply.header('Content-Type',row.mime).header('Accept-Ranges','bytes').header('Cache-Control','private, max-age=3600').header('ETag',`"${row.checksum}"`).header('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  if(req.headers['if-none-match']===`"${row.checksum}"`&&!req.headers.range)return reply.code(304).send();
  if(req.headers.range){const range=parseRange(req.headers.range,size);if(!range)return reply.code(416).header('Content-Range',`bytes */${size}`).send();reply.code(206).header('Content-Range',`bytes ${range.start}-${range.end}/${size}`).header('Content-Length',range.end-range.start+1);return reply.send(createReadStream(row.path,range));}
  reply.header('Content-Length',size);return reply.send(createReadStream(row.path));
});
api.delete(`${base}/media/:id`,async(req)=>{
  user(req,EDIT);const id=uid(req);
  const row=await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(7382263)');
    const used=await c.query("SELECT 1 FROM scenes WHERE data->'elements' @> $1::jsonb UNION ALL SELECT 1 FROM programs WHERE items @> $2::jsonb UNION ALL SELECT 1 FROM program_versions WHERE payload->'media' @> $3::jsonb LIMIT 1",[JSON.stringify([{mediaId:id}]),JSON.stringify([{type:'media',refId:id}]),JSON.stringify([{id}])]);
    if(used.rowCount)fail(409,'Ce média est utilisé par une scène ou une version de programme');
    const deleted=(await c.query('DELETE FROM media WHERE id=$1 RETURNING path',[id])).rows[0];if(!deleted)fail(404,'Média introuvable');return deleted;
  });
  await unlink(row.path).catch(()=>{});await audit(req,'media.deleted',{id});return {ok:true};
});
api.get(`${base}/scenes`,async(req)=>{user(req);return (await pool.query('SELECT data FROM scenes ORDER BY updated_at DESC')).rows.map(r=>r.data);});
async function saveScene(req:FastifyRequest,reply:FastifyReply,existing:boolean){
  user(req,EDIT);const data=sceneSchema.parse(req.body);const id=existing?uid(req):randomUUID();const full={...data,id,updatedAt:new Date().toISOString()};
  if(existing){if(!(await pool.query('UPDATE scenes SET data=$2,updated_at=now() WHERE id=$1',[id,JSON.stringify(full)])).rowCount)fail(404,'Scène introuvable');}else{await pool.query('INSERT INTO scenes(id,data) VALUES($1,$2)',[id,JSON.stringify(full)]);reply.code(201);}await audit(req,'scene.saved',{id});return full;
}
api.post(`${base}/scenes`,(req,reply)=>saveScene(req,reply,false));
api.put(`${base}/scenes/:id`,(req,reply)=>saveScene(req,reply,true));
api.delete(`${base}/scenes/:id`,async(req)=>{user(req,EDIT);const id=uid(req);if((await pool.query('SELECT 1 FROM programs WHERE items @> $1::jsonb LIMIT 1',[JSON.stringify([{type:'scene',refId:id}])])).rowCount)fail(409,'Cette scène est utilisée par un programme');if(!(await pool.query('DELETE FROM scenes WHERE id=$1',[id])).rowCount)fail(404,'Scène introuvable');await audit(req,'scene.deleted',{id});return {ok:true};});
api.get(`${base}/programs`,async(req)=>{user(req);return (await pool.query('SELECT * FROM programs ORDER BY created_at DESC')).rows.map(programView);});
async function saveProgram(req:FastifyRequest,reply:FastifyReply,existing:boolean){user(req,EDIT);const data=programSchema.parse(req.body);const id=existing?uid(req):randomUUID();const result=existing?await pool.query('UPDATE programs SET name=$2,items=$3 WHERE id=$1 RETURNING *',[id,data.name,JSON.stringify(data.items)]):await pool.query('INSERT INTO programs(id,name,items) VALUES($1,$2,$3) RETURNING *',[id,data.name,JSON.stringify(data.items)]);if(!result.rows[0])fail(404,'Programme introuvable');if(!existing)reply.code(201);await audit(req,'program.saved',{id});return programView(result.rows[0]);}
api.post(`${base}/programs`,(req,reply)=>saveProgram(req,reply,false));
api.put(`${base}/programs/:id`,(req,reply)=>saveProgram(req,reply,true));
api.post(`${base}/programs/:id/publish`,async(req)=>{
  user(req,ADMIN);const id=uid(req);const result=await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(7382263)');
    const row=(await c.query('SELECT * FROM programs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)fail(404,'Programme introuvable');if(!row.items.length)fail(400,'Ajoutez au moins un élément avant publication');
    const scenes:any[]=[];const mediaIds=new Set<string>();
    for(const item of row.items){if(item.type==='media'){mediaIds.add(item.refId);}else{const scene=(await c.query('SELECT data FROM scenes WHERE id=$1',[item.refId])).rows[0]?.data;if(!scene)fail(400,'Une scène de la playlist est introuvable');if(!scenes.some(s=>s.id===scene.id))scenes.push(scene);for(const el of scene.elements){if(el.type==='image'||el.type==='video'){if(!el.mediaId)fail(400,'Un élément de scène ne contient aucun média');mediaIds.add(el.mediaId);}}}}
    const mediaRows=mediaIds.size?(await c.query('SELECT * FROM media WHERE id=ANY($1::uuid[])',[Array.from(mediaIds)])).rows:[];if(mediaRows.length!==mediaIds.size)fail(400,'Un média de la playlist est introuvable');
    for(const scene of scenes)for(const el of scene.elements)if(el.type==='image'||el.type==='video'){const m=mediaRows.find(m=>m.id===el.mediaId);if(!m?.mime.startsWith(el.type+'/'))fail(400,'Le type du média ne correspond pas à son élément de scène');}
    const version=row.published_version+1;const payload={id,name:row.name,version,items:row.items,scenes,media:mediaRows.map(mediaView)};await c.query('INSERT INTO program_versions(program_id,version,payload) VALUES($1,$2,$3)',[id,version,JSON.stringify(payload)]);await c.query('UPDATE programs SET published_version=$2 WHERE id=$1',[id,version]);return programView({...row,published_version:version});
  });await audit(req,'program.published',{id,version:result.publishedVersion});return result;
});
api.delete(`${base}/programs/:id`,async(req)=>{
  user(req,ADMIN);const id=uid(req);
  await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(7382263)');
    if((await c.query("SELECT 1 FROM schedules WHERE data->>'programId'=$1 LIMIT 1",[id])).rowCount)fail(409,'Ce programme est planifié');
    if(!(await c.query('DELETE FROM programs WHERE id=$1',[id])).rowCount)fail(404,'Programme introuvable');
  });await audit(req,'program.deleted',{id});return {ok:true};
});
api.get(`${base}/groups`,async(req)=>{user(req);return (await pool.query('SELECT * FROM groups ORDER BY name')).rows;});
api.post(`${base}/groups`,async(req,reply)=>{user(req,ADMIN);const {name}=groupSchema.parse(req.body);const id=randomUUID();await pool.query('INSERT INTO groups(id,name) VALUES($1,$2)',[id,name]);reply.code(201);return {id,name};});
api.delete(`${base}/groups/:id`,async(req)=>{
  user(req,ADMIN);const id=uid(req);
  await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(7382263)');
    if((await c.query("SELECT 1 FROM schedules WHERE data->>'groupId'=$1 LIMIT 1",[id])).rowCount)fail(409,'Ce groupe possède des planifications');
    if(!(await c.query('DELETE FROM groups WHERE id=$1',[id])).rowCount)fail(404,'Groupe introuvable');
  });return {ok:true};
});
api.get(`${base}/screens`,async(req)=>{user(req);return (await pool.query('SELECT * FROM screens ORDER BY name')).rows.map(screenView);});
api.patch(`${base}/screens/:id`,async(req)=>{
  user(req,ADMIN);const id=uid(req),b=screenSchema.parse(req.body);const old=(await pool.query('SELECT * FROM screens WHERE id=$1',[id])).rows[0];if(!old)fail(404,'Écran introuvable');
  if(b.fallbackProgramId&&!(await pool.query('SELECT 1 FROM programs WHERE id=$1 AND published_version>0',[b.fallbackProgramId])).rowCount)fail(400,'Publiez le programme de secours avant affectation');
  const row=(await pool.query('UPDATE screens SET name=$2,group_id=$3,orientation=$4,fallback_program_id=$5 WHERE id=$1 RETURNING *',[id,b.name??old.name,b.groupId===undefined?old.group_id:b.groupId,b.orientation??old.orientation,b.fallbackProgramId===undefined?old.fallback_program_id:b.fallbackProgramId])).rows[0];await audit(req,'screen.updated',{id});return screenView(row);
});
api.delete(`${base}/screens/:id`,async(req)=>{user(req,ADMIN);const id=uid(req);await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(7382263)');await c.query("DELETE FROM schedules WHERE data->>'screenId'=$1",[id]);if(!(await c.query('DELETE FROM screens WHERE id=$1',[id])).rowCount)fail(404,'Écran introuvable');});await audit(req,'screen.revoked',{id});return {ok:true};});
api.post(`${base}/screens/:id/commands`,async(req)=>{user(req,ADMIN);const id=uid(req);const {type}=commandSchema.parse(req.body);const commandId=randomUUID();await pool.query('INSERT INTO commands(id,screen_id,type) VALUES($1,$2,$3)',[commandId,id,type]);await audit(req,'screen.command',{id,type});return {id:commandId,type};});
api.post(`${base}/players/pair/request`,{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
  const {deviceId}=pairRequestSchema.parse(req.body);const requestId=randomUUID();const code=randomInt(0,1000000).toString().padStart(6,'0');const expiresAt=new Date(Date.now()+10*60000).toISOString();
  await pool.query('DELETE FROM pair_requests WHERE expires_at<now()');await pool.query('INSERT INTO pair_requests(id,device_hash,code,expires_at) VALUES($1,$2,$3,$4)',[requestId,digest(deviceId),code,expiresAt]);reply.code(201);return {requestId,code,expiresAt};
});
api.get(`${base}/players/pair/status/:requestId`,async(req)=>{
  const id=z.string().uuid().parse((req.params as any).requestId);const {deviceId}=pairRequestSchema.parse(req.query);
  return transaction(async c=>{const row=(await c.query('SELECT * FROM pair_requests WHERE id=$1 AND device_hash=$2 FOR UPDATE',[id,digest(deviceId)])).rows[0];if(!row||row.consumed||new Date(row.expires_at).getTime()<Date.now())return {status:'expired'};if(!row.screen_id)return {status:'pending'};const token=secret();await c.query('UPDATE screens SET token_hash=$2 WHERE id=$1',[row.screen_id,digest(token)]);await c.query('UPDATE pair_requests SET consumed=true WHERE id=$1',[id]);return {status:'paired',token,screenId:row.screen_id};});
});
api.post(`${base}/players/pair/confirm`,{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
  user(req,ADMIN);const b=pairConfirmSchema.parse(req.body);const result=await transaction(async c=>{const pair=(await c.query('SELECT * FROM pair_requests WHERE code=$1 AND expires_at>now() AND screen_id IS NULL AND consumed=false FOR UPDATE',[b.code])).rows[0];if(!pair)fail(404,'Code invalide, expiré ou déjà associé');const id=randomUUID();const screen=(await c.query('INSERT INTO screens(id,name,group_id) VALUES($1,$2,$3) RETURNING *',[id,b.name,b.groupId||null])).rows[0];await c.query('UPDATE pair_requests SET screen_id=$2 WHERE id=$1',[pair.id,id]);return screenView(screen);});await audit(req,'screen.paired',{id:result.id});reply.code(201);return result;
});
api.get(`${base}/players/me/manifest`,async(req)=>manifest(await device(req)));
api.post(`${base}/players/me/heartbeat`,async(req)=>{
  const screen=await device(req);const b=z.object({programId:z.string().uuid().nullable().optional(),revision:z.string().max(100).optional(),error:z.string().max(2000).optional()}).parse(req.body||{});
  await pool.query('UPDATE screens SET last_seen=now(),current_program_id=$2,revision=$3 WHERE id=$1',[screen.id,b.programId||null,b.revision||null]);
  if(b.error){deviceEvents.take(screen.id);deviceEventBytes.take(screen.id,Buffer.byteLength(b.error));await pool.query('INSERT INTO events(screen_id,type,data) VALUES($1,$2,$3)',[screen.id,'player.error',JSON.stringify({message:b.error})]);}
  const commands=(await pool.query('DELETE FROM commands WHERE screen_id=$1 RETURNING id,type',[screen.id])).rows;return {commands};
});
api.post(`${base}/players/me/events`,async(req)=>{const screen=await device(req);const b=z.object({events:boundedArray(z.object({type:z.enum(['play','playback','error','online','offline']),programId:z.string().uuid().optional(),itemId:z.string().max(100).optional(),message:z.string().max(2000).optional(),at:z.string().datetime().optional()}),25)}).parse(req.body);deviceEvents.take(screen.id,b.events.length);deviceEventBytes.take(screen.id,Buffer.byteLength(JSON.stringify(b)));for(const event of b.events)await pool.query('INSERT INTO events(screen_id,type,data) VALUES($1,$2,$3)',[screen.id,'player.'+event.type,JSON.stringify(event)]);return {ok:true};});
api.get(`${base}/schedules`,async(req)=>{user(req);return (await pool.query('SELECT data FROM schedules ORDER BY id')).rows.map(r=>r.data);});
async function saveSchedule(req:FastifyRequest,reply:FastifyReply,existing:boolean){
  user(req,ADMIN);const id=existing?uid(req):randomUUID(),data={...scheduleSchema.parse(req.body),id} as Schedule;const errors=getScheduleErrors(data);if(errors.length)fail(400,errors.join('; '));
  await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(7382263)');if(!(await c.query('SELECT 1 FROM programs WHERE id=$1 AND published_version>0',[data.programId])).rowCount)fail(400,'Le programme doit être publié');if(data.screenId&&!(await c.query('SELECT 1 FROM screens WHERE id=$1',[data.screenId])).rowCount)fail(400,'Écran introuvable');if(data.groupId&&!(await c.query('SELECT 1 FROM groups WHERE id=$1',[data.groupId])).rowCount)fail(400,'Groupe introuvable');const others=(await c.query('SELECT data FROM schedules WHERE id<>$1',[id])).rows.map(r=>r.data);if(others.some(other=>schedulesConflict(data,other)))fail(409,'Conflit avec une planification de même cible, nature et priorité');if(existing){if(!(await c.query('UPDATE schedules SET data=$2 WHERE id=$1',[id,JSON.stringify(data)])).rowCount)fail(404,'Planification introuvable');}else{await c.query('INSERT INTO schedules(id,data) VALUES($1,$2)',[id,JSON.stringify(data)]);reply.code(201);}});await audit(req,'schedule.saved',{id});return data;
}
api.post(`${base}/schedules`,(req,reply)=>saveSchedule(req,reply,false));
api.put(`${base}/schedules/:id`,(req,reply)=>saveSchedule(req,reply,true));
api.delete(`${base}/schedules/:id`,async(req)=>{user(req,ADMIN);const id=uid(req);if(!(await pool.query('DELETE FROM schedules WHERE id=$1',[id])).rowCount)fail(404,'Planification introuvable');await audit(req,'schedule.deleted',{id});return {ok:true};});
api.get(`${base}/security-events`,async req=>{user(req,ADMIN);return (await pool.query('SELECT id,actor_id AS "actorId",type,data,created_at AS "createdAt" FROM security_events ORDER BY id DESC LIMIT 200')).rows;});
api.get(`${base}/events`,async(req)=>{user(req);return (await pool.query('SELECT e.id,e.screen_id AS "screenId",e.actor_id AS "actorId",e.type,e.data,e.created_at AS "createdAt",s.name AS "screenName" FROM events e LEFT JOIN screens s ON s.id=e.screen_id ORDER BY e.created_at DESC LIMIT 200')).rows;});

await mkdir(mediaDir,{recursive:true});
const privilege=(await pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];if(privilege?.rolsuper)throw new Error('Refusing to run API with a PostgreSQL superuser. Run the migration service.');
await registerPdfImports(api,mediaDir,(req,write)=>{user(req,write?EDIT:READ);});
await registerVideoImports(api,mediaDir,(req,write)=>{user(req,write?EDIT:READ);});
const cleanup=setInterval(()=>{void pool.query("DELETE FROM sessions WHERE expires_at<now(); DELETE FROM pair_requests WHERE expires_at<now()-interval '1 day'; DELETE FROM events WHERE created_at<now()-interval '30 days'; SELECT public.prune_security_events()").catch(err=>api.log.error(err));},3600000);cleanup.unref();
api.addHook('onClose',async()=>{clearInterval(cleanup);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void api.close().then(()=>pool.end()).then(()=>process.exit(0));});
await api.listen({port:Number(process.env.PORT||3000),host:process.env.HOST||'0.0.0.0'});
