// Run only against a disposable installation. Existing superadmin supplied via environment.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=(process.env.VISUALY_TEST_URL||'http://127.0.0.1:18380')+'/api/v1';
const password='Disposable password 2026!';
async function request(path,{cookie='',method='GET',body,status=200,headers={}}={}){
 const response=await fetch(base+path,{method,headers:{...headers,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return {data,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
const {cookie:admin}=await request('/auth/login',{method:'POST',body:{email:process.env.VISUALY_TEST_EMAIL,password:process.env.VISUALY_TEST_PASSWORD}});
assert.ok(admin);
const email=`security-${randomUUID()}@example.test`;
const {data:editor}=await request('/users',{method:'POST',cookie:admin,status:201,body:{name:'Security editor',email,password,role:'editor'}});
const a=await request('/auth/login',{method:'POST',body:{email,password}}),b=await request('/auth/login',{method:'POST',body:{email,password}});
assert.match(a.headers.get('set-cookie'),/Secure/);assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/SameSite=Strict/i);
await request('/users',{cookie:a.cookie,status:403});
await request('/auth/logout',{cookie:a.cookie,method:'POST',status:403,headers:{Origin:'https://evil.invalid'}});
await request('/scenes',{cookie:a.cookie,method:'POST',status:400,body:{name:'bad',width:1920,height:1080,background:'url(https://evil.invalid/pixel)',elements:[]}});
await request('/auth/password',{cookie:a.cookie,method:'POST',body:{currentPassword:password,password:password+' new'}});
await request('/auth/me',{cookie:a.cookie,status:401});await request('/auth/me',{cookie:b.cookie,status:401});
const c=await request('/auth/login',{method:'POST',body:{email,password:password+' new'}});
await request(`/users/${editor.id}/revoke-sessions`,{cookie:admin,method:'POST'});await request('/auth/me',{cookie:c.cookie,status:401});
await request(`/users/${editor.id}`,{cookie:admin,method:'PATCH',body:{disabled:true}});await request('/auth/login',{method:'POST',status:401,body:{email,password:password+' new'}});
await request(`/users/${editor.id}`,{cookie:admin,method:'PATCH',body:{disabled:false}});
await request(`/users/${editor.id}/password`,{cookie:admin,method:'POST',body:{currentPassword:process.env.VISUALY_TEST_PASSWORD,password}});
const d=await request('/auth/login',{method:'POST',body:{email,password}});
await request(`/users/${editor.id}`,{cookie:admin,method:'PATCH',body:{role:'viewer'}});await request('/auth/me',{cookie:d.cookie,status:401});
const v=await request('/auth/login',{method:'POST',body:{email,password}});
await request('/scenes',{cookie:v.cookie,method:'POST',status:403,body:{name:'denied',width:1920,height:1080,background:'#fff',elements:[]}});
const {data:me}=await request('/auth/me',{cookie:admin});await request(`/users/${me.id}`,{cookie:admin,method:'PATCH',status:409,body:{disabled:true}});
const {data:events}=await request('/security-events',{cookie:admin});for(const type of ['user.updated','user.password_changed','user.sessions_revoked','user.password_reset','auth.login_failed'])assert.ok(events.some(e=>e.type===type),type);
console.log('PASS: roles, CSRF, colors, password changes, two-session revocation, disable/reactivate, reset, last-admin protection, security journal.');
