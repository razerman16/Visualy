// Isolated browser fixtures exercise layout and failures without changing server data.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fixtures} from './fixtures.mjs';
const admin=process.env.VISUALY_ADMIN_URL||'http://127.0.0.1:8480';
const output=process.env.VISUALY_SCREENSHOTS||'/tmp/visualy-stability';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.VISUALY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
async function open({width=1440,lang='fr',theme='light',route}={}){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({lang,theme})=>{localStorage.setItem('visualy-language',lang);localStorage.setItem('visualy-theme',theme)},{lang,theme});
 await page.route('**/api/v1/**',async r=>{const path=new URL(r.request().url()).pathname.replace('/api/v1','');if(route&&await route(r,path))return;await r.fulfill({contentType:'application/json',body:JSON.stringify(fixtures[path]||{})})});
 await page.goto(admin);await page.locator('.stat-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);return page;
}
async function navigate(page,index){if(page.viewportSize().width<=760)await page.locator('.mobile-menu').click();await page.locator('nav button').nth(index).click();}
async function fits(page,label){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label);}
try{
 let checks=0;
 for(const width of [320,390,768,1024,1440])for(const lang of ['fr','en'])for(const theme of ['light','dark']){
  const page=await open({width,lang,theme});await fits(page,`${width}/${lang}/${theme}/dashboard`);checks++;
  for(let i=1;i<8;i++){await navigate(page,i);await fits(page,`${width}/${lang}/${theme}/page-${i}`);checks++;}
  if(width===320||width===1440)await page.screenshot({path:`${output}/settings-${width}-${lang}-${theme}.png`,fullPage:true});
  await navigate(page,2);await page.locator('.heading-actions button').click();await page.getByRole('dialog').waitFor();await fits(page,`${width}/${lang}/${theme}/editor`);checks++;
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','Editor locks background scrolling');
  assert.ok(await page.locator('.title-input').evaluate(el=>el.clientWidth)>=140,'Readable scene name');
  for(const key of ['Shift+Tab','Tab','Tab']){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.editor-overlay')),true,'Editor contains keyboard focus');}
  if(width===320||width===1440)await page.screenshot({path:`${output}/editor-${width}-${lang}-${theme}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await navigate(page,5);await page.locator('.heading-actions .primary').click();await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')),true,'Reverse Tab from dialog root stays inside');
  await fits(page,`${width}/${lang}/${theme}/pairing`);checks++;await page.keyboard.press('Escape');
  if(width<=760){await page.locator('.mobile-menu').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'),'false');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),false,'Closed mobile navigation is not focusable');}
  await page.close();
 }
 console.log(`PASS: ${checks} layouts across 320/390/768/1024/1440 px, FR/EN, light/dark; keyboard scopes and mobile navigation.`);
 // A failed upload remains visible even after the successful list refresh.
 const upload=await open({route:async(r,path)=>{if(path==='/media'&&r.request().method()==='POST'){await r.fulfill({status:413,contentType:'application/json',body:JSON.stringify({error:'Fixture upload rejected'})});return true}}});
 await navigate(upload,1);await upload.locator('input[type=file][multiple]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('fixture')});await upload.getByRole('alert').filter({hasText:'Fixture upload rejected'}).waitFor();await upload.getByRole('button',{name:'Actualiser les données'}).click();await upload.waitForFunction(()=>!document.querySelector('.spinning'));assert.ok(await upload.getByRole('alert').filter({hasText:'Fixture upload rejected'}).isVisible());await upload.close();
 // Retrying a publish failure must update the saved draft, never create a duplicate.
 let creates=0,updates=0,publishes=0;
 const program=await open({route:async(r,path)=>{const method=r.request().method();if((path==='/programs'&&method==='POST')||(path==='/programs/saved-draft'&&method==='PUT')){method==='POST'?creates++:updates++;await r.fulfill({contentType:'application/json',body:JSON.stringify({...r.request().postDataJSON(),id:'saved-draft'})});return true}if(path==='/programs/saved-draft/publish'){publishes++;await r.fulfill({status:publishes===1?503:200,contentType:'application/json',body:JSON.stringify(publishes===1?{error:'Fixture publication unavailable'}:{ok:true})});return true}}});
 await navigate(program,3);await program.getByRole('button',{name:'Nouveau programme',exact:true}).click();await program.getByLabel('Nom du programme').fill('Retry draft');await program.getByLabel('Contenu à ajouter').selectOption('scene:scene-1');await program.getByRole('button',{name:'Ajouter',exact:true}).click();await program.getByRole('button',{name:'Publier le programme',exact:true}).click();await program.getByText('Fixture publication unavailable').waitFor();await program.getByRole('button',{name:'Publier le programme',exact:true}).click();await program.getByRole('dialog').waitFor({state:'hidden'});assert.deepEqual({creates,updates,publishes},{creates:1,updates:1,publishes:2});await program.close();
 // Malformed proxy responses surface as recoverable errors, not an empty page.
 let invalid=false;
 const network=await open({route:async(r,path)=>{if(invalid&&path==='/dashboard'){await r.fulfill({contentType:'text/html',body:'<html>Proxy error</html>'});return true}if(path==='/auth/logout'){await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture logout unavailable'})});return true}}});
 invalid=true;await network.getByRole('button',{name:'Actualiser les données'}).click();await network.getByRole('alert').filter({hasText:'Réponse du serveur invalide'}).waitFor();invalid=false;await network.getByRole('button',{name:'Réessayer',exact:true}).click();await network.getByRole('alert').waitFor({state:'hidden'});await navigate(network,7);await network.getByRole('button',{name:'Se déconnecter',exact:true}).click();await network.getByRole('alert').filter({hasText:'Fixture logout unavailable'}).waitFor();assert.ok(await network.getByRole('heading',{name:'Paramètres',exact:true}).isVisible());await network.close();
 assert.deepEqual(errors,[]);console.log('PASS: upload error retention, publication retry without duplicate drafts, invalid response recovery, failed logout without unhandled rejection.');
}finally{await browser.close()}
