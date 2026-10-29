// The real production UI with isolated API fixtures; no installation data is modified.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {fixtures,user} from './fixtures.mjs';
const admin=process.env.VISUALY_ADMIN_URL||'http://127.0.0.1:8480';
const browser=await chromium.launch({executablePath:process.env.VISUALY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
async function fixture({storageOnly=false}={}){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(storageOnly=>{localStorage.setItem('visualy-language','fr');if(storageOnly)Object.defineProperty(globalThis,'BroadcastChannel',{value:undefined})},storageOnly);
 const state={authenticated:true,actor:user,saveStatus:200,holdSave:false,held:null};
 await context.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/v1',''),method=route.request().method();
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)}).catch(()=>{});
  if(path==='/auth/setup')return send({required:false});
  if(path==='/auth/login'){state.authenticated=true;state.actor={...user,id:'other-user',name:'Second account'};return send(state.actor)}
  if(path==='/auth/logout'){state.authenticated=false;return send({ok:true})}
  if(!state.authenticated)return send({error:'Connexion requise'},401);
  if(path==='/scenes'&&method==='POST'){
   if(state.holdSave){state.held=()=>send({...route.request().postDataJSON(),id:'saved-before-logout'});return}
   return send(state.saveStatus===200?{...route.request().postDataJSON(),id:'saved'}:{error:'Temporary server failure'},state.saveStatus);
  }
  if(path==='/auth/me')return send(state.actor);
  return send(fixtures[path]||{});
 });
 async function open(){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(admin);await page.locator('.stat-card').first().waitFor();return page;}
 return {context,state,open};
}
async function login(page){await page.getByLabel('Adresse e-mail').fill('second@example.test');await page.getByLabel('Mot de passe',{exact:true}).fill('Fixture password 2026!');await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.getByRole('heading',{name:'Bonjour, Second',exact:true}).waitFor();}
async function editor(page,name){await page.getByRole('button',{name:'Créer une scène',exact:true}).click();await page.getByRole('dialog').waitFor();await page.locator('.title-input').fill(name);}
async function loggedOut(page){await page.getByRole('button',{name:'Se connecter',exact:true}).waitFor();assert.equal(await page.locator('.app').count(),0);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('.user-block').count(),0);}
try{
 // Temporary errors preserve drafts; rejection of the session removes every private view.
 const rejected=await fixture();const page=await rejected.open();await editor(page,'PRIVATE SESSION DRAFT');
 rejected.state.saveStatus=503;await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByText('Temporary server failure').waitFor();assert.equal(await page.locator('.title-input').inputValue(),'PRIVATE SESSION DRAFT');
 rejected.state.authenticated=false;await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await loggedOut(page);
 await login(page);assert.equal(await page.getByText('PRIVATE SESSION DRAFT',{exact:true}).count(),0);assert.equal(await page.getByRole('dialog').count(),0);await rejected.context.close();
 // Logout reaches other tabs through either BroadcastChannel or its storage fallback.
 for(const storageOnly of [false,true]){
  const tabs=await fixture({storageOnly});const first=await tabs.open(),second=await tabs.open();await editor(second,'SECOND TAB PRIVATE DRAFT');
  await first.locator('nav button').nth(7).click();await first.getByRole('button',{name:'Se déconnecter',exact:true}).click();await loggedOut(first);await loggedOut(second);await tabs.context.close();
 }
 // An old save cannot reopen its editor after another tab ends the session and a new account signs in.
 const late=await fixture();const saving=await late.open(),other=await late.open();await editor(saving,'STALE PRIVATE SAVE');late.state.holdSave=true;
 await saving.getByRole('button',{name:'Enregistrer',exact:true}).click();await saving.waitForFunction(()=>document.querySelector('.editor-overlay button[disabled]'));
 const deadline=Date.now()+5000;while(!late.state.held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.ok(late.state.held,'Save request is pending');
 await other.locator('nav button').nth(7).click();await other.getByRole('button',{name:'Se déconnecter',exact:true}).click();await loggedOut(saving);await login(saving);
 await late.state.held();await saving.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await saving.getByRole('dialog').count(),0);assert.equal(await saving.getByText('STALE PRIVATE SAVE',{exact:true}).count(),0);assert.ok(await saving.getByRole('heading',{name:'Bonjour, Second',exact:true}).isVisible());await late.context.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: 401 clears private state and dialogs; server errors preserve drafts; cross-tab logout (channel and storage); late save cannot restore a previous session.');
}finally{await browser.close()}
