// Run only against the disposable integration installation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.VISUALY_TEST_URL+'/api/v1';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.VISUALY_TEST_EMAIL,password:process.env.VISUALY_TEST_PASSWORD})});
assert.equal(login.status,200);
assert.equal(login.headers.get('cache-control'),'no-store');
const cookie=login.headers.get('set-cookie').split(';')[0];
const scene={name:'Oversized test',width:1920,height:1080,background:'#fff',elements:Array.from({length:40},()=>({id:randomUUID(),type:'text',x:0,y:0,width:100,height:100,text:'x'.repeat(10000)}))};
const response=await fetch(base+'/scenes',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(scene)});
assert.equal(response.status,413,'large valid scene rejected before persistence');
assert.equal(response.headers.get('cache-control'),'no-store');
const scenes=await fetch(base+'/scenes',{headers:{Cookie:cookie}});
assert.equal(scenes.status,200);assert.ok(!(await scenes.json()).some(s=>s.name===scene.name));
const ids=[];let program;
try{
 for(let i=0;i<10;i++){
  const res=await fetch(base+'/scenes',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...scene,name:`Bounded publication ${i}`,elements:scene.elements.slice(0,24)})});
  assert.equal(res.status,201);ids.push((await res.json()).id);
 }
 const created=await fetch(base+'/programs',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Oversized publication test',items:ids.map(refId=>({id:randomUUID(),type:'scene',refId,duration:10}))})});
 assert.equal(created.status,201);program=(await created.json()).id;
 const publish=await fetch(base+`/programs/${program}/publish`,{method:'POST',headers:{Cookie:cookie}});
 assert.equal(publish.status,413,'aggregate publication must be rejected even when each scene fits');
 const programs=await (await fetch(base+'/programs',{headers:{Cookie:cookie}})).json();
 assert.equal(programs.find(p=>p.id===program).publishedVersion,0,'failed publication is atomic');
}finally{
 if(program)await fetch(base+`/programs/${program}`,{method:'DELETE',headers:{Cookie:cookie}});
 for(const id of ids)await fetch(base+`/scenes/${id}`,{method:'DELETE',headers:{Cookie:cookie}});
}
const media=await (await fetch(base+'/media',{headers:{Cookie:cookie}})).json();
assert.ok(media.length,'smoke test supplies media');
for(const headers of [{Cookie:cookie},{Cookie:cookie,Range:'bytes=0-3'},{Cookie:cookie,'If-None-Match':`"${media[0].checksum}"`}]){
 const file=await fetch(base+`/media/${media[0].id}/file`,{headers});
 assert.ok([200,206,304].includes(file.status));assert.equal(file.headers.get('cache-control'),'no-store');await file.arrayBuffer();
}
await fetch(base+'/auth/logout',{method:'POST',headers:{Cookie:cookie}});
const denied=await fetch(base+`/media/${media[0].id}/file`,{headers:{Cookie:cookie}});
assert.equal(denied.status,401);assert.equal(denied.headers.get('cache-control'),'no-store');
console.log('PASS: oversized scene and aggregate publication rejected atomically; sessions, full/range/conditional media and errors use no-store; logout denies media.');
