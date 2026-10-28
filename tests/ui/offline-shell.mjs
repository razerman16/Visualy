import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.SCENZLY_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),page=await context.newPage();
 const player=process.env.SCENZLY_PLAYER_URL||'http://127.0.0.1:8281';
 // Simulate an existing installation before the new worker is registered.
 await page.route('**/__upgrade-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Upgrade fixture</title>'}));
 await page.goto(player+'/__upgrade-fixture');
 await page.evaluate(async()=>{
  localStorage.setItem('scenzly-device-id','existing-device');
  const oldShell=await caches.open('scenzly-shell-v4');await oldShell.put('/old-brand',new Response('old shell'));
  const media=await caches.open('scenzly-media-upgrade-fixture');await media.put('/existing-media',new Response('cached media'));
 });
 await page.goto(player);
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active,undefined,{timeout:30000});
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.equal(await page.title(),'Visualy · Écran');
 assert.equal(await page.evaluate(()=>localStorage.getItem('scenzly-device-id')),'existing-device','device identity preserved');
 assert.equal(await page.evaluate(()=>caches.has('scenzly-shell-v4')),false,'old shell retired');
 assert.equal(await page.evaluate(async()=>!!(await (await caches.open('scenzly-media-upgrade-fixture')).match('/existing-media'))),true,'existing media cache preserved');
 const cached=await page.evaluate(async()=>{const cache=await caches.open('scenzly-shell-v5');return (await cache.keys()).map(r=>new URL(r.url).pathname)});
 assert.ok(cached.some(p=>p.endsWith('.woff2')),'self-hosted fonts cached');
 assert.ok(cached.includes('/brand/visualy-logo.png'),'logo cached');
 assert.ok(cached.includes('/brand/visualy-logo-dark.png'),'dark logo cached');
 assert.ok(cached.includes('/brand/visualy-mark.png'),'mark cached');
 await page.getByRole('combobox',{name:'Langue'}).selectOption('en');await page.getByRole('combobox',{name:'Theme'}).selectOption('dark');
 assert.equal(await page.title(),'Visualy · Player');
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:/Your next message/}).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.brand-logo img:visible').evaluate(img=>img.complete&&img.naturalWidth>0),true);
 assert.ok((await page.locator('.brand-logo img:visible').getAttribute('src')).endsWith('visualy-logo-dark.png'));
 assert.equal(await page.evaluate(()=>document.fonts.check('16px "Manrope Variable"')),true);
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.getByRole('combobox',{name:'Language'}).selectOption('fr');await page.getByRole('heading',{name:/Votre prochain message/}).waitFor();
 console.log('PASS: production player shell, logo and local font load after an offline reload.');
}finally{await browser.close();}
