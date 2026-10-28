import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=(process.env.VISUALY_TEST_URL||'http://127.0.0.1:18380')+'/api/v1';
async function call(path,body,auth='',expected=200){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth.startsWith('visualy_session=')?{Cookie:auth}:auth?{Authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(data)}`);return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const {cookie}=await call('/auth/login',{email:process.env.VISUALY_TEST_EMAIL,password:process.env.VISUALY_TEST_PASSWORD});
const deviceId=randomUUID(),{data:pair}=await call('/players/pair/request',{deviceId},'',201);
await call('/players/pair/confirm',{code:pair.code,name:'Security events fixture'},cookie,201);
const {data:{token}}=await call(`/players/pair/status/${pair.requestId}?deviceId=${deviceId}`);
await call('/players/me/events',{events:[{type:'auth.login'}]},token,400);
await call('/players/me/events',{events:Array(26).fill({type:'play'})},token,400);
for(let i=0;i<4;i++)await call('/players/me/events',{events:Array(25).fill({type:'play'})},token);
await call('/players/me/events',{events:[{type:'play'}]},token,429);
const {data:events}=await call('/events',undefined,cookie);assert.ok(events.some(e=>e.type==='player.play'));assert.ok(!events.some(e=>e.type==='auth.login'));
console.log('PASS: reserved event names and oversized batches rejected, device budget enforced, event namespace isolated.');
