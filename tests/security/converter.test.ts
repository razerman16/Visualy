import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import tar from 'tar-stream';
import {convertRemote} from '../../apps/api/src/conversion-client.js';
test('converter response cannot extract paths, links, duplicates or oversized files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'screnzly-archive-test-'));await writeFile(join(root,'source'),'fixture');
 let variant='valid';
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/x-tar');const pack=tar.pack();pack.on('error',()=>{});pack.pipe(res);res.on('close',()=>pack.destroy());if(variant==='valid')pack.entry({name:'page-1.png'},Buffer.from('ok'));if(variant==='path')pack.entry({name:'../escape'},Buffer.from('no'));if(variant==='link')pack.entry({name:'page-1.png',type:'symlink',linkname:'/etc/passwd'});if(variant==='duplicate'){pack.entry({name:'page-1.png'},Buffer.from('a'));pack.entry({name:'page-1.png'},Buffer.from('b'));}if(variant==='size'){const stream=pack.entry({name:'page-1.png',size:300*1024*1024});stream.on('error',()=>{});stream.write('a');return;}pack.finalize();});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const old=process.env.CONVERTER_URL;process.env.CONVERTER_URL=`http://127.0.0.1:${(server.address() as any).port}`;
 try{
  const result=await convertRemote('pdf',join(root,'source'),join(root,'valid'));assert.deepEqual(result.files,['page-1.png']);
  for(variant of ['path','link','duplicate','size'])await assert.rejects(convertRemote('pdf',join(root,'source'),join(root,variant)));
  assert.ok(!(await readdir(root)).includes('escape'));
 }finally{if(old===undefined)delete process.env.CONVERTER_URL;else process.env.CONVERTER_URL=old;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
