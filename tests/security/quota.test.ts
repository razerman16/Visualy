import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerUploadGuard} from '../../apps/api/src/upload-guard.js';
import {pool} from '../../apps/api/src/db.js';
test('uploads are rejected before reading a body when quota is insufficient',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'screnzly-quota-'));const original=pool.query,quota=process.env.MEDIA_QUOTA_MB;process.env.MEDIA_QUOTA_MB='1';
 (pool as any).query=async()=>({rows:[{count:0}]});let handled=false;
 const app=Fastify();registerUploadGuard(app,directory,()=> 'fixture-user');app.post('/api/v1/media',async()=>{handled=true;return {ok:true}});
 try{const res=await app.inject({method:'POST',url:'/api/v1/media'});assert.equal(res.statusCode,507);assert.equal(handled,false);}finally{await app.close();pool.query=original;if(quota===undefined)delete process.env.MEDIA_QUOTA_MB;else process.env.MEDIA_QUOTA_MB=quota;await rm(directory,{recursive:true,force:true});}
});
