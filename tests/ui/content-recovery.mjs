// Exercise recovery of a pre-existing oversized collection without changing real data.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {fixtures,user} from './fixtures.mjs';
const browser=await chromium.launch({executablePath:process.env.VISUALY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.addInitScript(()=>localStorage.setItem('visualy-language','fr'));
 const original=fixtures['/scenes'][0];let detailReads=0,saved;
 await page.route('**/api/v1/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
  const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/auth/me')return send(user);
  if(path==='/scenes')return url.searchParams.has('summary')?send([{...original,elements:[],summaryOnly:true}]):send({error:'Content limit'},413);
  if(path===`/scenes/${original.id}`){if(route.request().method()==='PUT'){saved=route.request().postDataJSON();return send(saved)}detailReads++;return send(original)}
  return send(fixtures[path]||{});
 });
 await page.goto(process.env.VISUALY_ADMIN_URL||'http://127.0.0.1:8590');
 await page.getByText(/Les 1 000 premiers résumés/).waitFor();
 await page.locator('.dashboard-scenes .scene-card').first().click();
 await page.getByRole('dialog').waitFor();assert.equal(detailReads,1);
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await page.waitForFunction(()=>!!document.querySelector('.toast'));
 assert.deepEqual(saved.elements,original.elements,'saving a summary must never erase existing scene elements');
 assert.ok(saved.elements.length);
 console.log('PASS: oversized legacy scene collection uses summaries, opens full detail and preserves elements when saved.');
}finally{await browser.close()}
