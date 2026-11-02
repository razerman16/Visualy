/** Integration smoke test against a disposable Visualy installation.
 * Run: VISUALY_TEST_URL=http://127.0.0.1:8080 node tests/smoke.mjs
 * Creates data. First run bootstraps an admin; retain credentials in environment
 * to repeat against that installation. Never target production.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const base = (process.env.VISUALY_TEST_URL || 'http://127.0.0.1:8080') + '/api/v1';
const email = process.env.VISUALY_TEST_EMAIL || `test-${randomUUID()}@example.test`;
const password = process.env.VISUALY_TEST_PASSWORD || randomUUID() + '!aA1';
let cookie = '';
let checks = 0;
async function req(path, { method = 'GET', body, auth = 'admin', status, raw = false } = {}) {
  const headers = {};
  if (auth === 'admin' && cookie) headers.Cookie = cookie;
  else if (auth && auth !== 'admin') headers.Authorization = 'Bearer ' + auth;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (auth === 'admin' && res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  const data = raw ? await res.arrayBuffer() : await res.json();
  if (status) assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  else assert.ok(res.ok, `${method} ${path} => ${res.status}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
const health = await req('/health', {auth:null});
assert.equal(health.status, 'ok');
await req('/screens', { auth:null, status:401 });
const setup = await req('/auth/setup', { auth:null });
const user = await req(setup.required ? '/auth/setup' : '/auth/login', {method:'POST',body:{email,password,name:'Recette automatisée',setupToken:process.env.VISUALY_SETUP_TOKEN}});
assert.equal(user.role,'superadmin');
await req('/auth/me');
await req('/auth/setup',{method:'POST',body:{email:'intruder@example.test',password,name:'Intruder',setupToken:process.env.VISUALY_SETUP_TOKEN},status:409});

// Exercise the persisted PDF queue and publication-ready generated page.
let pdf='%PDF-1.4\n';const offsets=[0];
for(const [i,obj] of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'].entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 4\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const pdfForm=new FormData();pdfForm.append('file',new Blob([pdf],{type:'application/pdf'}),'recette.pdf');
await req('/imports/pdf',{auth:null,status:401});
const imported=await req('/imports/pdf',{method:'POST',body:pdfForm,status:202});
let pdfJob;
for(let i=0;i<30;i++){pdfJob=(await req('/imports/pdf')).find(j=>j.id===imported.id);if(pdfJob.status!=='pending')break;await new Promise(r=>setTimeout(r,1000));}
assert.equal(pdfJob.status,'done',pdfJob.error||`PDF import ${imported.id} did not complete within 30 seconds (status: ${pdfJob.status}).`);assert.equal(pdfJob.mediaIds.length,1);
const pageMedia=(await req('/media')).find(m=>m.id===pdfJob.mediaIds[0]);assert.equal(pageMedia.mime,'image/png');

const videoDir=await mkdtemp(join(tmpdir(),'visualy-video-smoke-'));
try{
 const source=join(videoDir,'source.avi');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x120:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','mpeg4','-c:a','pcm_s16le',source]);
 await req('/imports/video',{auth:null,status:401});
 const invalidForm=new FormData();invalidForm.append('file',new Blob(['invalid video']),'bad.avi');
 await req('/imports/video',{method:'POST',body:invalidForm,status:415});
 const videoForm=new FormData();videoForm.append('file',new Blob([await readFile(source)]),'source.avi');
 const submitted=await req('/imports/video',{method:'POST',body:videoForm,status:202});let job;
 for(let i=0;i<30;i++){job=(await req('/imports/video')).find(j=>j.id===submitted.id);if(job.status!=='pending')break;await new Promise(r=>setTimeout(r,1000));}
 assert.equal(job.status,'done',job.error||`Video import ${submitted.id} did not complete within 30 seconds (status: ${job.status}).`);assert.ok(job.duration>0);
 const generated=(await req('/media')).find(m=>m.id===job.mediaId);assert.equal(generated.mime,'video/mp4');
 const mp4=await req(`/media/${job.mediaId}/file`,{raw:true});assert.ok(mp4.byteLength>0);
 if(process.env.VISUALY_CHROMIUM){
  const {chromium}=await import('@playwright/test');const browser=await chromium.launch({executablePath:process.env.VISUALY_CHROMIUM,args:['--no-sandbox']});
  try{const page=await browser.newPage({extraHTTPHeaders:{Cookie:cookie}});await page.goto(base+'/health');await page.setContent(`<video muted loop src="${base}/media/${job.mediaId}/file"></video>`);await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>0.1);console.log('PASS: converted H.264 video decoded and played in Chromium.');}finally{await browser.close();}
 }
}finally{await rm(videoDir,{recursive:true,force:true});}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const upload = new FormData();upload.append('file',new Blob([png],{type:'image/png'}),'recette.png');
const media = await req('/media',{method:'POST',body:upload});
assert.equal(media.mime,'image/png');assert.match(media.checksum,/^[0-9a-f]{64}$/);
const scene = await req('/scenes',{method:'POST',body:{name:'Scène de recette',width:1920,height:1080,background:'#102030',elements:[{id:randomUUID(),type:'text',x:20,y:20,width:800,height:100,text:'Bonjour Visualy',fontSize:64,color:'#ffffff'},{id:randomUUID(),type:'image',x:20,y:200,width:100,height:100,mediaId:media.id}]}});
const program = await req('/programs',{method:'POST',body:{name:'Programme de recette',items:[{id:randomUUID(),type:'scene',refId:scene.id,duration:5}]}});
await req(`/programs/${program.id}/publish`,{method:'POST'});
const group = await req('/groups',{method:'POST',body:{name:'Groupe recette'}});
const deviceId = randomUUID();
const pairing = await req('/players/pair/request',{method:'POST',auth:null,body:{deviceId}});
assert.ok(pairing.code && pairing.requestId);
const pending = await req(`/players/pair/status/${pairing.requestId}?deviceId=${deviceId}`,{auth:null});assert.equal(pending.status,'pending');
const screen = await req('/players/pair/confirm',{method:'POST',body:{code:pairing.code,name:'Écran de recette',groupId:group.id}});
const paired = await req(`/players/pair/status/${pairing.requestId}?deviceId=${deviceId}`,{auth:null});assert.equal(paired.status,'paired');assert.ok(paired.token);
const token = paired.token;
await req(`/screens/${screen.id}`,{method:'PATCH',body:{fallbackProgramId:program.id,orientation:'landscape'}});
const manifest = await req('/players/me/manifest',{auth:token});
assert.equal(manifest.fallbackProgramId,program.id);assert.equal(manifest.programs[0].scenes[0].elements[0].text,'Bonjour Visualy');
await req('/media',{auth:token,status:401});
const bytes = await req(`/media/${media.id}/file`,{auth:token,raw:true});assert.equal(bytes.byteLength,png.length);
await req(`/media/${media.id}/file`,{auth:null,status:401});
await req(`/scenes/${scene.id}`,{method:'PUT',body:{...scene,elements:[{...scene.elements[0],text:'Brouillon non publié'},scene.elements[1]]}});
const immutable = await req('/players/me/manifest',{auth:token});assert.equal(immutable.programs[0].scenes[0].elements[0].text,'Bonjour Visualy');
const scheduleData = {name:'Matin',programId:program.id,screenId:screen.id,groupId:null,priority:10,kind:'weekly',startDate:'2026-01-01',endDate:'2027-12-31',startTime:'08:00',endTime:'12:00',days:[1,2,3,4,5],exclusions:[],timezone:'Europe/Paris'};
await req('/schedules',{method:'POST',body:scheduleData});
await req('/schedules',{method:'POST',body:{...scheduleData,name:'Conflit'},status:409});
await req(`/screens/${screen.id}/commands`,{method:'POST',body:{type:'refresh'}});
const heartbeat = await req('/players/me/heartbeat',{method:'POST',auth:token,body:{programId:program.id,revision:manifest.revision}});
assert.ok(heartbeat.commands.some(c=>c.type==='refresh'));
await req('/players/me/events',{method:'POST',auth:token,body:{events:[{type:'playback',programId:program.id,itemId:program.items[0].id,at:new Date().toISOString()}]}});
assert.ok((await req('/events')).length > 0);
await req(`/screens/${screen.id}`,{method:'DELETE'});
await req('/players/me/manifest',{auth:token,status:401});
await req('/auth/logout',{method:'POST'});
await req('/auth/me',{status:401});
console.log(`PASS: ${checks} HTTP checks. Bootstrap, auth, media, scene, immutable publication, pairing, manifest, scheduling conflict, commands, events, revocation.`);
